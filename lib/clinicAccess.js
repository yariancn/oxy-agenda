import {
  ACTIVE_CLINICS,
  ALL_CLINICS,
  CLINIC_OXYGENDGL,
  CLINIC_SHENANDOAH,
  gdlStaffClinicAccess,
  isClinicEnabled,
  normalizeClinicId,
  uniqueCanonicalClinicIds,
} from './clinicRegistry.js';
import { findRoleLevelInDb, inferRoleLevelFromName } from './staffRoleLevel.js';

export { ACTIVE_CLINICS, ALL_CLINICS, CLINIC_OXYGENDGL, CLINIC_SHENANDOAH };

const SUPREME_PIN = '1234567890';

export function resolveStaffRoleLevel(user, dbRoles = [], activeClinic = null) {
  if (!user) return 99;
  if (user.id === 'admin') return 1;
  if (Number(user.accessLevel) === 1) return 1;

  const levels = [];
  const profiles = user.clinicProfiles && typeof user.clinicProfiles === 'object'
    ? Object.values(user.clinicProfiles)
    : [];

  for (const profile of profiles) {
    if (!profile?.role) continue;
    const fromDb = findRoleLevelInDb(dbRoles, profile.role);
    if (fromDb != null) levels.push(fromDb);
  }

  if (!levels.length) {
    const activeProfile = activeClinic
      ? getStaffProfileForClinic(user, activeClinic) || user
      : user;
    const fromDb = findRoleLevelInDb(dbRoles, activeProfile?.role);
    if (fromDb != null) return fromDb;
    const sessionLevel = Number(user.accessLevel);
    if (Number.isFinite(sessionLevel) && sessionLevel > 0 && sessionLevel < 99) {
      return sessionLevel;
    }
    return inferRoleLevelFromName(activeProfile?.role) || 99;
  }

  return Math.min(...levels);
}

function clinicsFromProfiles(user) {
  if (!user?.clinicProfiles || typeof user.clinicProfiles !== 'object') return [];
  return uniqueCanonicalClinicIds(Object.keys(user.clinicProfiles));
}


function applyMasterClinicProfiles(user) {
  const primary = user?.clinicProfiles
    ? Object.values(user.clinicProfiles).find(Boolean)
    : user;
  if (!primary) return user?.clinicProfiles || {};
  return {
    [CLINIC_OXYGENDGL]: user.clinicProfiles?.[CLINIC_OXYGENDGL] || primary,
    [CLINIC_SHENANDOAH]: user.clinicProfiles?.[CLINIC_SHENANDOAH] || primary,
  };
}

function filterEnabledClinics(clinics = []) {
  return uniqueCanonicalClinicIds(clinics).filter(isClinicEnabled);
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
      allowedClinics: [...ACTIVE_CLINICS],
      clinicProfiles: applyMasterClinicProfiles(user),
      accessLevel: 1,
    };
  }
  if (user.allowedClinics?.length) {
    const allowed = filterEnabledClinics(user.allowedClinics);
    if (allowed.length) return { ...user, allowedClinics: allowed };
  }
  if (user.clinicProfiles && typeof user.clinicProfiles === 'object') {
    const allowedClinics = filterEnabledClinics(Object.keys(user.clinicProfiles));
    if (allowedClinics.length) return { ...user, allowedClinics };
  }
  const home = normalizeClinicId(user.homeClinic);
  if (home && isClinicEnabled(home)) {
    return { ...user, allowedClinics: [home] };
  }
  return user;
}

export function getAllowedClinics(user, { roleLevel = null, dbRoles = [], activeClinic = null } = {}) {
  const effectiveRoleLevel = roleLevel ?? resolveStaffRoleLevel(user, dbRoles, activeClinic);
  const normalized = normalizeStaffSessionUser(user, { roleLevel: effectiveRoleLevel });
  if (!normalized) return [];
  const profileClinics = clinicsFromProfiles(normalized);
  const allowed = filterEnabledClinics([
    ...(normalized.allowedClinics || []),
    ...profileClinics,
  ]);
  if (hasMasterClinicAccess(normalized, effectiveRoleLevel)) return [...ACTIVE_CLINICS];
  return allowed.length ? allowed : filterEnabledClinics(profileClinics);
}

export function canAccessClinic(user, clinic, options = {}) {
  return getAllowedClinics(user, options).includes(normalizeClinicId(clinic));
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
  return String(legacy.data?.master_pin || '').trim();
}

export async function resolveStaffLogin(pin, supabaseGdl, supabaseShenandoah) {
  const normalizedPin = String(pin).trim();
  if (!normalizedPin) return { error: 'empty' };

  if (SUPREME_PIN && normalizedPin === SUPREME_PIN) {
    return {
      user: {
        id: 'admin',
        name: 'ADMINISTRADOR SUPREMO',
        role: 'Super Administrador Supremo',
        allowedClinics: ACTIVE_CLINICS,
      },
    };
  }

  const [gdlMaster, txConfigRes, gdlStaffRes, txStaffRes] = await Promise.all([
    fetchGdlMasterPin(supabaseGdl),
    supabaseShenandoah.from('company_config').select('master_pin').eq('clinic', CLINIC_SHENANDOAH).maybeSingle(),
    supabaseGdl.from('users_staff').select('*').eq('pin', normalizedPin).eq('is_active', true),
    supabaseShenandoah.from('users_staff').select('*').eq('pin', normalizedPin).eq('is_active', true),
  ]);

  const txMaster = String(txConfigRes.data?.master_pin || '').trim();
  const gdlMasterPin = String(gdlMaster || '').trim();

  if (
    (gdlMasterPin && normalizedPin === gdlMasterPin)
    || (txMaster && normalizedPin === txMaster)
  ) {
    return {
      user: {
        id: 'admin',
        name: 'Administrador Maestro',
        role: 'Super Administrador Maestro',
        allowedClinics: ACTIVE_CLINICS,
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
