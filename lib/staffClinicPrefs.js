const STORAGE_KEY = 'oxy-agenda-staff-active-clinic-v1';

export function loadStaffActiveClinic() {
  if (typeof window === 'undefined') return null;
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return value === 'Guadalajara' || value === 'Shenandoah' ? value : null;
  } catch {
    return null;
  }
}

export function saveStaffActiveClinic(clinic) {
  if (typeof window === 'undefined') return;
  if (clinic !== 'Guadalajara' && clinic !== 'Shenandoah') return;
  try {
    localStorage.setItem(STORAGE_KEY, clinic);
  } catch {
    /* quota / private mode */
  }
}

/** @param {{ allowedClinics?: string[], homeClinic?: string } | null} user */
export function resolveStaffActiveClinic(user) {
  const allowed = user?.allowedClinics || [];
  if (!allowed.length) return 'Guadalajara';

  const stored = loadStaffActiveClinic();
  if (stored && allowed.includes(stored)) return stored;

  if (user.homeClinic && allowed.includes(user.homeClinic)) return user.homeClinic;

  return allowed[0];
}
