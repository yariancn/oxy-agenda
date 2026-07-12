/** Identificadores de clínica / sede (company_config.clinic y columna clinic en citas). */
export const CLINIC_OXYGENDGL = 'Oxygengdl';
export const CLINIC_OXYGENDGL2 = 'Oxygengdl2';
export const CLINIC_SHENANDOAH = 'Shenandoah';
/** Alias legacy en BD y localStorage previo a multi-sede GDL. */
export const LEGACY_GDL_CLINIC = 'Guadalajara';

export const ALL_CLINICS = [CLINIC_OXYGENDGL, CLINIC_OXYGENDGL2, CLINIC_SHENANDOAH];

/** Sedes ocultas en la app (reservas, selector, acceso staff). Los datos en BD pueden quedar. */
export const DISABLED_CLINICS = [CLINIC_OXYGENDGL2];

export const GDL_CLINICS = [CLINIC_OXYGENDGL];
export const ACTIVE_CLINICS = ALL_CLINICS.filter((id) => !DISABLED_CLINICS.includes(id));

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

const CLINIC_ID_ALIASES = {
  [LEGACY_GDL_CLINIC]: CLINIC_OXYGENDGL,
  Guadalajara: CLINIC_OXYGENDGL,
  gdl: CLINIC_OXYGENDGL,
  GDL: CLINIC_OXYGENDGL,
  'GDL 1': CLINIC_OXYGENDGL,
  GDL1: CLINIC_OXYGENDGL,
  gdl1: CLINIC_OXYGENDGL,
  OXYGENDGL: CLINIC_OXYGENDGL,
  gdl2: CLINIC_OXYGENDGL2,
  GDL2: CLINIC_OXYGENDGL2,
  'GDL 2': CLINIC_OXYGENDGL2,
  OXYGENDGL2: CLINIC_OXYGENDGL2,
  tx: CLINIC_SHENANDOAH,
  TX: CLINIC_SHENANDOAH,
  Houston: CLINIC_SHENANDOAH,
  HOUSTON: CLINIC_SHENANDOAH,
  Regenoxy: CLINIC_SHENANDOAH,
  REGENOXY: CLINIC_SHENANDOAH,
};

export function normalizeClinicId(clinic) {
  const raw = String(clinic || '').trim();
  if (!raw) return CLINIC_OXYGENDGL;
  if (ALL_CLINICS.includes(raw)) return raw;
  if (CLINIC_ID_ALIASES[raw]) return CLINIC_ID_ALIASES[raw];
  const lower = raw.toLowerCase();
  if (lower === 'guadalajara' || lower === 'oxygengdl') return CLINIC_OXYGENDGL;
  if (lower === 'oxygengdl2') return CLINIC_OXYGENDGL2;
  if (lower === 'shenandoah' || lower === 'houston' || lower === 'regenoxy') return CLINIC_SHENANDOAH;
  return raw;
}

export function uniqueCanonicalClinicIds(clinics = []) {
  return [...new Set((clinics || []).map(normalizeClinicId).filter((c) => ALL_CLINICS.includes(c)))];
}

export function isClinicEnabled(clinic) {
  const id = normalizeClinicId(clinic);
  return ALL_CLINICS.includes(id) && !DISABLED_CLINICS.includes(id);
}

/** Orden fijo del selector de sedes en la barra lateral (solo sedes activas). */
export const CLINIC_SELECTOR_ORDER = [...ACTIVE_CLINICS];

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
  return isClinicEnabled(clinic);
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

/** Filas sin columna clinic (legacy) se tratan como sede por defecto de esa BD. */
export function rowMatchesClinic(row, clinicId) {
  const normalized = normalizeClinicId(clinicId);
  const rowClinic = row?.clinic;
  if (!rowClinic || rowClinic === LEGACY_GDL_CLINIC) {
    if (normalized === CLINIC_SHENANDOAH) return true;
    return normalized === CLINIC_OXYGENDGL;
  }
  return normalizeClinicId(rowClinic) === normalized;
}

export function filterRowsByClinic(rows, clinicId) {
  return (rows || []).filter((row) => rowMatchesClinic(row, clinicId));
}

function isMissingClinicColumnError(error) {
  if (!error?.message) return false;
  return /column.*clinic|clinic.*does not exist|schema cache/i.test(error.message);
}

export { isMissingClinicColumnError };

export function shouldScopeTableByClinic(clinicId) {
  return isGdlCluster(clinicId);
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

function stripClinicFromSelect(select) {
  const cols = String(select || '*')
    .split(',')
    .map((col) => col.trim())
    .filter((col) => col && col !== 'clinic');
  return cols.length ? cols.join(', ') : '*';
}

/** Citas activas; omite columna clinic del SELECT si no existe (p. ej. TX legacy). */
export async function selectActiveAppointments(
  supabase,
  columns = 'equipment, full_date, time, duration, buffer, check_in_status, clinic',
) {
  let res = await supabase
    .from('appointments')
    .select(columns)
    .neq('check_in_status', 'Cancelado');
  if (res.error && isMissingClinicColumnError(res.error)) {
    res = await supabase
      .from('appointments')
      .select(stripClinicFromSelect(columns))
      .neq('check_in_status', 'Cancelado');
  }
  return res;
}

/** company_config por sede; fallback a primera fila si falta columna clinic. */
export async function selectCompanyConfigForClinic(supabase, clinicId) {
  const id = normalizeClinicId(clinicId);
  let res = await supabase.from('company_config').select('*').eq('clinic', id).maybeSingle();
  if (res.error && isMissingClinicColumnError(res.error)) {
    res = await supabase.from('company_config').select('*').limit(1).maybeSingle();
  }
  return res;
}

export function gdlStaffClinicAccess(gdlStaff) {
  return {
    allowedClinics: [...GDL_CLINICS],
    clinicProfiles: {
      [CLINIC_OXYGENDGL]: gdlStaff,
    },
  };
}
