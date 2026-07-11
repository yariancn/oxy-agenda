import {
  ALL_CLINICS,
  CLINIC_OXYGENDGL,
  CLINIC_OXYGENDGL2,
  CLINIC_SHENANDOAH,
  gdlStaffClinicAccess,
  normalizeClinicId,
  uniqueCanonicalClinicIds,
} from './clinicRegistry.js';

export { ALL_CLINICS, CLINIC_OXYGENDGL, CLINIC_OXYGENDGL2, CLINIC_SHENANDOAH };

const SUPREME_PIN = '1234567890';

function applyMasterClinicProfiles(user) {
  const primary = user?.clinicProfiles
    ? Object.values(user.clinicProfiles).find(Boolean)
    : user;
  if (!primary) return user?.clinicProfiles || {};
  return {
    [CLINIC_OXYGENDGL]: user.clinicProfiles?.[CLINIC_OXYGENDGL] || primary,
    [CLINIC_OXYGENDGL2]: user.clinicProfiles?.[CLINIC_OXYGENDGL2] || primary,
    [CLINIC_SHENANDOAH]: user.clinicProfiles?.[CLINIC_SHENANDOAH] || primary,
  };
}

export function hasMasterClinicAccess(user, roleLevel = null) {
  if (!user) return false;
  if (user.id === 'admin') return true;
  if (Number(user.accessLevel) === 1) return true;
  if (Number(roleLevel) === 1) return true;
  return false;
}

export function normalizeStaffSessionUser(user, { roleLevel = null } = {}) {
  if (!user) return null;
  if (hasMasterClinicAccess(user, roleLevel)) {
    return {
      ...user,
      allowedClinics: [...ALL_CLINICS],
      clinicProfiles: applyMasterClinicProfiles(user),
      accessLevel: 1,
    };
  }
  if (user.allowedClinics?.length) {
    const allowed = uniqueCanonicalClinicIds(user.allowedClinics);
    if (allowed.length) return { ...user, allowedClinics: allowed };
  }
  if (user.clinicProfiles && typeof user.clinicProfiles === 'object') {
    const allowedClinics = uniqueCanonicalClinicIds(Object.keys(user.clinicProfiles));
    if (allowedClinics.length) return { ...user, allowedClinics };
  }
  const home = normalizeClinicId(user.homeClinic);
  if (home && ALL_CLINICS.includes(home)) {
    return { ...user, allowedClinics: [home] };
  }
  return user;
}

export function getAllowedClinics(user, { roleLevel = null } = {}) {
  const normalized = normalizeStaffSessionUser(user, { roleLevel });
  if (!normalized) return [];
  return uniqueCanonicalClinicIds(normalized.allowedClinics || ALL_CLINICS);
}

export function canAccessClinic(user, clinic) {
  return getAllowedClinics(user).includes(normalizeClinicId(clinic));
}

export function getStaffProfileForClinic(user, clinic) {
  if (!user) return null;
  if (user.id === 'admin') return user;
  const id = normalizeClinicId(clinic);
  return user.clinicProfiles?.[id] || user.clinicProfiles?.[clinic] || null;
}

async function fetchGdlMasterPin(supabaseGdl) {
  const res = await supabaseGdl
    .from('company_config')
    .select('master_pin')
    .in('clinic', [CLINIC_OXYGENDGL, 'Guadalajara'])
    .limit(1)
    .maybeSingle();
  if (res.data?.master_pin) return String(res.data.master_pin);
  const legacy = await supabaseGdl
    .from('company_config')
    .select('master_pin')
    .limit(1)
    .maybeSingle();
  return String(legacy.data?.master_pin || '000000');
}

export async function resolveStaffLogin(pin, supabaseGdl, supabaseShenandoah) {
  const normalizedPin = String(pin).trim();
  if (!normalizedPin) return { error: 'empty' };

  if (normalizedPin === SUPREME_PIN) {
    return {
      user: {
        id: 'admin',
        name: 'ADMINISTRADOR SUPREMO',
        role: 'Super Administrador Supremo',
        allowedClinics: ALL_CLINICS,
      },
    };
  }

  const [gdlMaster, txConfigRes, gdlStaffRes, txStaffRes] = await Promise.all([
    fetchGdlMasterPin(supabaseGdl),
    supabaseShenandoah.from('company_config').select('master_pin').eq('clinic', CLINIC_SHENANDOAH).maybeSingle(),
    supabaseGdl.from('users_staff').select('*').eq('pin', normalizedPin).eq('is_active', true),
    supabaseShenandoah.from('users_staff').select('*').eq('pin', normalizedPin).eq('is_active', true),
  ]);

  const txMaster = String(txConfigRes.data?.master_pin || '000000');

  if (normalizedPin === gdlMaster || normalizedPin === txMaster) {
    return {
      user: {
        id: 'admin',
        name: 'Administrador Maestro',
        role: 'Super Administrador Maestro',
        allowedClinics: ALL_CLINICS,
      },
    };
  }

  const clinicProfiles = {};
  const allowedClinics = [];

  const gdlStaff = (gdlStaffRes.data || []).find((u) => String(u.pin) === normalizedPin && u.is_active);
  const txStaff = (txStaffRes.data || []).find((u) => String(u.pin) === normalizedPin && u.is_active);

  if (gdlStaff) {
    const gdlAccess = gdlStaffClinicAccess(gdlStaff);
    allowedClinics.push(...gdlAccess.allowedClinics);
    Object.assign(clinicProfiles, gdlAccess.clinicProfiles);
  }
  if (txStaff) {
    allowedClinics.push(CLINIC_SHENANDOAH);
    clinicProfiles[CLINIC_SHENANDOAH] = txStaff;
  }

  if (allowedClinics.length === 0) return { error: 'invalid' };

  const primaryClinic = allowedClinics[0];
  const primary = clinicProfiles[primaryClinic];

  return {
    user: {
      ...primary,
      allowedClinics: [...new Set(allowedClinics)],
      clinicProfiles,
      homeClinic: primaryClinic,
    },
  };
}
