import {
  CLINIC_OXYGENDGL,
  CLINIC_OXYGENDGL2,
  isClinicEnabled,
  LEGACY_GDL_CLINIC,
  normalizeClinicId,
  uniqueCanonicalClinicIds,
} from './clinicRegistry.js';

const STORAGE_KEY = 'oxy-agenda-staff-active-clinic-v2';
const LEGACY_STORAGE_KEY = 'oxy-agenda-staff-active-clinic-v1';

function migrateLegacyStoredClinic(value) {
  if (value === LEGACY_GDL_CLINIC || value === CLINIC_OXYGENDGL2) return CLINIC_OXYGENDGL;
  if (isClinicEnabled(value)) return normalizeClinicId(value);
  return null;
}

export function loadStaffActiveClinic() {
  if (typeof window === 'undefined') return null;
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    const migrated = migrateLegacyStoredClinic(value);
    if (migrated) return migrated;

    const legacy = localStorage.getItem(LEGACY_STORAGE_KEY);
    return migrateLegacyStoredClinic(legacy);
  } catch {
    return null;
  }
}

export function saveStaffActiveClinic(clinic) {
  if (typeof window === 'undefined') return;
  const id = normalizeClinicId(clinic);
  if (!isClinicEnabled(id)) return;
  try {
    localStorage.setItem(STORAGE_KEY, id);
  } catch {
    /* quota / private mode */
  }
}

export function clearStaffActiveClinic() {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(LEGACY_STORAGE_KEY);
  } catch {
    /* private mode */
  }
}

/** @param {{ allowedClinics?: string[], homeClinic?: string } | null} user */
export function resolveStaffActiveClinic(user) {
  const allowed = uniqueCanonicalClinicIds(user?.allowedClinics || []);
  if (!allowed.length) return CLINIC_OXYGENDGL;

  const stored = loadStaffActiveClinic();
  if (stored && allowed.includes(stored)) return stored;

  const home = normalizeClinicId(user.homeClinic);
  if (home && allowed.includes(home)) return home;

  return allowed[0];
}
