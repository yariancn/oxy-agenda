/** Identificadores de clínica / sede (company_config.clinic y columna clinic en citas). */
export const CLINIC_OXYGENDGL = 'Oxygengdl';
export const CLINIC_OXYGENDGL2 = 'Oxygengdl2';
export const CLINIC_SHENANDOAH = 'Shenandoah';
/** Alias legacy en BD y localStorage previo a multi-sede GDL. */
export const LEGACY_GDL_CLINIC = 'Guadalajara';

export const ALL_CLINICS = [CLINIC_OXYGENDGL, CLINIC_OXYGENDGL2, CLINIC_SHENANDOAH];
export const GDL_CLINICS = [CLINIC_OXYGENDGL, CLINIC_OXYGENDGL2];

const CLINIC_META = {
  [CLINIC_OXYGENDGL]: {
    id: CLINIC_OXYGENDGL,
    db: 'GDL',
    locale: 'es',
    timezone: 'America/Mexico_City',
    currency: 'MXN',
    shortLabel: 'GDL 1',
    defaultName: 'OXYGENGDL',
    bookingPath: '/booking/mx',
    portalTag: 'GDL',
    accent: 'emerald',
    flag: '🇲🇽',
    regionLabel: 'Guadalajara · MX',
  },
  [CLINIC_OXYGENDGL2]: {
    id: CLINIC_OXYGENDGL2,
    db: 'GDL',
    locale: 'es',
    timezone: 'America/Mexico_City',
    currency: 'MXN',
    shortLabel: 'GDL 2',
    defaultName: 'OXYGENDGL2',
    bookingPath: '/booking/mx2',
    portalTag: 'GDL2',
    accent: 'teal',
    flag: '🇲🇽',
    regionLabel: 'Guadalajara · MX',
  },
  [CLINIC_SHENANDOAH]: {
    id: CLINIC_SHENANDOAH,
    db: 'TX',
    locale: 'en',
    timezone: 'America/Chicago',
    currency: 'USD',
    shortLabel: 'TX',
    defaultName: 'REGENOXY LLC',
    bookingPath: '/booking/us',
    portalTag: 'TX',
    accent: 'blue',
    flag: '🇺🇸',
    regionLabel: 'Houston · USA',
  },
};

export function normalizeClinicId(clinic) {
  if (!clinic || clinic === LEGACY_GDL_CLINIC) return CLINIC_OXYGENDGL;
  if (ALL_CLINICS.includes(clinic)) return clinic;
  return clinic;
}

export function getClinicMeta(clinic) {
  return CLINIC_META[normalizeClinicId(clinic)] || CLINIC_META[CLINIC_OXYGENDGL];
}

export function isShenandoah(clinic) {
  return normalizeClinicId(clinic) === CLINIC_SHENANDOAH;
}

export function isGdlCluster(clinic) {
  return !isShenandoah(clinic);
}

export function localeForClinic(clinic) {
  return getClinicMeta(clinic).locale;
}

export function getClinicTimezone(clinic) {
  return getClinicMeta(clinic).timezone;
}

export function currencyForClinic(clinic) {
  return getClinicMeta(clinic).currency;
}

export function getClinicShortLabel(clinic) {
  return getClinicMeta(clinic).shortLabel;
}

export function getClinicDefaultName(clinic) {
  return getClinicMeta(clinic).defaultName;
}

/** Nombre de marca en SMS/correo (no siempre coincide con razón social en company_config). */
export function resolveNotifyClinicDisplayName(clinicName, configuredName = '') {
  const id = normalizeClinicId(clinicName);
  if (id === CLINIC_SHENANDOAH) {
    return 'OxyHyperbaric/Regenoxy';
  }
  const configured = String(configuredName || '').trim();
  if (configured && !/^regenoxy/i.test(configured)) {
    return configured;
  }
  return getClinicDefaultName(id);
}

export function isPublicClinic(clinic) {
  const id = normalizeClinicId(clinic);
  return ALL_CLINICS.includes(id);
}

export function getClinicTheme(clinic) {
  const meta = getClinicMeta(clinic);
  if (meta.accent === 'blue') {
    return {
      banner: 'bg-blue-800 border-blue-900',
      active: 'bg-blue-600',
      badge: 'bg-blue-50 text-blue-700 border-blue-200',
      flag: meta.flag,
    };
  }
  if (meta.accent === 'teal') {
    return {
      banner: 'bg-teal-700 border-teal-800',
      active: 'bg-teal-600',
      badge: 'bg-teal-50 text-teal-700 border-teal-200',
      flag: meta.flag,
    };
  }
  return {
    banner: 'bg-emerald-700 border-emerald-800',
    active: 'bg-emerald-600',
    badge: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    flag: meta.flag,
  };
}

/** Filas sin columna clinic (legacy) se tratan como Oxygengdl. */
export function rowMatchesClinic(row, clinicId) {
  const normalized = normalizeClinicId(clinicId);
  const rowClinic = row?.clinic;
  if (!rowClinic || rowClinic === LEGACY_GDL_CLINIC) {
    return normalized === CLINIC_OXYGENDGL;
  }
  return normalizeClinicId(rowClinic) === normalized;
}

export function filterRowsByClinic(rows, clinicId) {
  return (rows || []).filter((row) => rowMatchesClinic(row, clinicId));
}

function isMissingClinicColumnError(error) {
  return !!error?.message && /column|schema cache/i.test(error.message);
}

/** Select con filtro por clinic; fallback client-side si la columna aún no existe. */
export async function staffDbSelectByClinic(clinicDb, table, clinicId, buildQuery) {
  const id = normalizeClinicId(clinicId);
  let res = await buildQuery(clinicDb.from(table).select('*').eq('clinic', id));
  if (res.error && isMissingClinicColumnError(res.error)) {
    res = await buildQuery(clinicDb.from(table).select('*'));
    if (res.data) {
      res = { ...res, data: filterRowsByClinic(res.data, id) };
    }
  }
  return res;
}

export function gdlStaffClinicAccess(gdlStaff) {
  return {
    allowedClinics: [...GDL_CLINICS],
    clinicProfiles: {
      [CLINIC_OXYGENDGL]: gdlStaff,
      [CLINIC_OXYGENDGL2]: gdlStaff,
    },
  };
}
