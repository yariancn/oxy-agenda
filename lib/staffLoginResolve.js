import { ACTIVE_CLINICS, gdlStaffClinicAccess, CLINIC_OXYGENDGL, CLINIC_SHENANDOAH, isShenandoah } from './clinicRegistry.js';
import { normalizeStaffEmail, isValidStaffEmail } from './staffEmail.js';
import { findRoleLevelInDb, inferRoleLevelFromName } from './staffRoleLevel.js';

const SUPREME_PIN = '1234567890';

function pinMatches(staff, pin) {
  return staff && String(staff.pin) === String(pin).trim() && staff.is_active !== false;
}

async function fetchGdlMasterPin(supabaseGdl) {
  const res = await supabaseGdl
    .from('company_config')
    .select('master_pin')
    .in('clinic', ['Oxygengdl', 'Guadalajara'])
    .limit(1)
    .maybeSingle();
  if (res.data?.master_pin) return String(res.data.master_pin);
  const legacy = await supabaseGdl.from('company_config').select('master_pin').limit(1).maybeSingle();
  return String(legacy.data?.master_pin || '000000');
}

async function findStaffByEmail(supabase, email) {
  const normalized = normalizeStaffEmail(email);
  if (!normalized) return null;
  const { data, error } = await supabase
    .from('users_staff')
    .select('*')
    .eq('is_active', true);
  if (error || !data?.length) return null;
  return data.find((row) => normalizeStaffEmail(row.email) === normalized) || null;
}

async function fetchRoleLevel(supabase, roleName) {
  if (!roleName || !supabase) return 99;
  const normalizedRole = String(roleName).trim();
  const { data: rows } = await supabase
    .from('user_roles')
    .select('name, level');
  if (rows?.length) {
    const fromDb = findRoleLevelInDb(rows, normalizedRole);
    if (fromDb != null) return fromDb;
  } else {
    // Fallback exact ilike when select-all fails or table empty
    const { data } = await supabase
      .from('user_roles')
      .select('level')
      .ilike('name', normalizedRole)
      .maybeSingle();
    if (data?.level != null) return data.level;
  }
  return inferRoleLevelFromName(normalizedRole) || 99;
}

function applyMasterClinicAccess(user, profile) {
  return {
    ...user,
    allowedClinics: ACTIVE_CLINICS,
    clinicProfiles: {
      [CLINIC_OXYGENDGL]: profile,
      [CLINIC_SHENANDOAH]: profile,
    },
  };
}

async function resolveStaffRoleLevels(clinicProfiles, supabaseGdl, supabaseShenandoah) {
  const levels = await Promise.all(
    Object.entries(clinicProfiles).map(async ([clinicId, profile]) => {
      const db = isShenandoah(clinicId) ? supabaseShenandoah : supabaseGdl;
      return fetchRoleLevel(db, profile?.role);
    }),
  );
  return levels.length ? Math.min(...levels) : 99;
}

async function buildUserFromStaff(gdlStaff, txStaff, supabaseGdl, supabaseShenandoah) {
  const clinicProfiles = {};
  const allowedClinics = [];

  if (gdlStaff) {
    const gdlAccess = gdlStaffClinicAccess(gdlStaff);
    allowedClinics.push(...gdlAccess.allowedClinics);
    Object.assign(clinicProfiles, gdlAccess.clinicProfiles);
  }
  if (txStaff) {
    allowedClinics.push(CLINIC_SHENANDOAH);
    clinicProfiles[CLINIC_SHENANDOAH] = txStaff;
  }

  if (!allowedClinics.length) return null;

  const primaryClinic = allowedClinics[0];
  const primary = clinicProfiles[primaryClinic];
  const roleLevel = await resolveStaffRoleLevels(clinicProfiles, supabaseGdl, supabaseShenandoah);

  let user = {
    ...primary,
    email: normalizeStaffEmail(primary.email || gdlStaff?.email || txStaff?.email),
    allowedClinics: [...new Set(allowedClinics)],
    clinicProfiles,
    homeClinic: primaryClinic,
    accessLevel: roleLevel,
  };

  if (roleLevel === 1) {
    user = applyMasterClinicAccess(user, primary);
    user.accessLevel = 1;
  }

  return user;
}

async function resolveBreakGlassPin(pin, supabaseGdl, supabaseShenandoah) {
  const normalizedPin = String(pin).trim();
  if (!normalizedPin) return { error: 'empty' };

  const supremePin = String(process.env.STAFF_SUPREME_PIN || SUPREME_PIN).trim();
  if (normalizedPin === supremePin) {
    return {
      user: {
        id: 'admin',
        name: 'ADMINISTRADOR SUPREMO',
        role: 'Super Administrador Supremo',
        allowedClinics: ACTIVE_CLINICS,
        accessLevel: 1,
      },
    };
  }

  const [gdlMaster, txConfigRes] = await Promise.all([
    fetchGdlMasterPin(supabaseGdl),
    supabaseShenandoah.from('company_config').select('master_pin').eq('clinic', CLINIC_SHENANDOAH).maybeSingle(),
  ]);
  const txMaster = String(txConfigRes.data?.master_pin || '000000');

  if (normalizedPin === gdlMaster || normalizedPin === txMaster) {
    return {
      user: {
        id: 'admin',
        name: 'Administrador Maestro',
        role: 'Super Administrador Maestro',
        allowedClinics: ACTIVE_CLINICS,
        accessLevel: 1,
      },
    };
  }

  return null;
}

export async function resolveStaffLoginWithCredentials({
  email,
  pin,
  trustedEmail = '',
  supabaseGdl,
  supabaseShenandoah,
}) {
  const normalizedPin = String(pin || '').trim();
  if (!normalizedPin) return { error: 'empty' };

  const breakGlass = await resolveBreakGlassPin(normalizedPin, supabaseGdl, supabaseShenandoah);
  if (breakGlass) return breakGlass;

  const loginEmail = normalizeStaffEmail(email || trustedEmail);
  if (!loginEmail) return { error: 'email_required' };
  if (!isValidStaffEmail(loginEmail)) return { error: 'email_invalid' };

  const [gdlStaff, txStaff] = await Promise.all([
    findStaffByEmail(supabaseGdl, loginEmail),
    findStaffByEmail(supabaseShenandoah, loginEmail),
  ]);

  const gdlOk = pinMatches(gdlStaff, normalizedPin);
  const txOk = pinMatches(txStaff, normalizedPin);

  if (!gdlOk && !txOk) {
    if (!gdlStaff && !txStaff) return { error: 'invalid' };
    return { error: 'invalid' };
  }

  const user = await buildUserFromStaff(gdlOk ? gdlStaff : null, txOk ? txStaff : null, supabaseGdl, supabaseShenandoah);
  if (!user) return { error: 'invalid' };

  return { user, loginEmail };
}

export async function resolveStaffUserByEmail({
  email,
  supabaseGdl,
  supabaseShenandoah,
}) {
  const loginEmail = normalizeStaffEmail(email);
  if (!loginEmail) return { error: 'email_required' };
  if (!isValidStaffEmail(loginEmail)) return { error: 'email_invalid' };

  const [gdlStaff, txStaff] = await Promise.all([
    findStaffByEmail(supabaseGdl, loginEmail),
    findStaffByEmail(supabaseShenandoah, loginEmail),
  ]);

  if (!gdlStaff && !txStaff) return { error: 'invalid' };

  const user = await buildUserFromStaff(
    gdlStaff?.is_active !== false ? gdlStaff : null,
    txStaff?.is_active !== false ? txStaff : null,
    supabaseGdl,
    supabaseShenandoah,
  );
  if (!user) return { error: 'invalid' };

  return { user, loginEmail };
}
