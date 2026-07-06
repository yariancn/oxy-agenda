/** Códigos por clínica (fallback si la tabla `promoters` no existe aún en Supabase). */
export const PROMOTERS_FALLBACK = {
  Guadalajara: [],
  Shenandoah: [],
};

export function normalizePromoCode(code) {
  return String(code || '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '');
}

/** Extrae código de promotor desde notas de cita o expediente (portal público). */
export function extractPromoterCodeFromNotes(notes = '') {
  const text = String(notes || '');
  const withName = text.match(/Promot(?:or|er):\s*[^(]*\(([A-Z0-9]+)\)/i);
  if (withName) return normalizePromoCode(withName[1]);
  const codeOnly = text.match(/Promot(?:or|er)\s*\([^)]+\):\s*([A-Z0-9]+)/i);
  if (codeOnly) return normalizePromoCode(codeOnly[1]);
  return '';
}

export function resolvePromoterContext({ promoterCode, notes, promoterList }) {
  const code = normalizePromoCode(promoterCode) || extractPromoterCodeFromNotes(notes);
  if (!code) return null;

  const match = (promoterList || []).find((p) => normalizePromoCode(p.code) === code);
  return {
    code,
    name: String(match?.name || '').trim(),
    notes: String(match?.notes || '').trim(),
    recognized: Boolean(match),
  };
}

export function getBookingPortalPath(clinicName) {
  return clinicName === 'Shenandoah' ? '/booking/us' : '/booking/mx';
}

export function buildPromoterBookingUrl(clinicName, code, origin = '') {
  const base = `${String(origin || '').replace(/\/$/, '')}${getBookingPortalPath(clinicName)}`;
  const normalized = normalizePromoCode(code);
  if (!normalized) return base;
  return `${base}?promo=${encodeURIComponent(normalized)}`;
}

export async function fetchAllPromotersAdmin(supabase) {
  let { data, error } = await supabase
    .from('promoters')
    .select('id, code, name, notes, calendar_feed_token, is_active, created_at')
    .order('code');

  if (error && /calendar_feed_token|column|schema cache/i.test(error.message || '')) {
    ({ data, error } = await supabase
      .from('promoters')
      .select('id, code, name, notes, is_active, created_at')
      .order('code'));
  }

  return { data: data || [], error };
}

export function getPromoFromUrl() {
  if (typeof window === 'undefined') return '';
  const params = new URLSearchParams(window.location.search);
  return normalizePromoCode(params.get('promo') || params.get('ref') || '');
}

const SERVICE_URL_ALIASES = {
  infrabaldan: 'InfraBaldan',
  'red-light': 'InfraBaldan',
  redlight: 'InfraBaldan',
};

/** Pre-select equipment from ?service=InfraBaldan (or alias) on public booking links. */
export function getServiceFromUrl() {
  if (typeof window === 'undefined') return '';
  const params = new URLSearchParams(window.location.search);
  const raw = String(params.get('service') || '').trim();
  if (!raw) return '';
  const key = raw.toLowerCase();
  return SERVICE_URL_ALIASES[key] || raw;
}

export async function fetchPromoters(supabase, clinicName) {
  const { data, error } = await supabase
    .from('promoters')
    .select('code, name')
    .eq('is_active', true);

  if (!error && data?.length) {
    return data.map((row) => ({
      code: normalizePromoCode(row.code),
      name: String(row.name || '').trim(),
    }));
  }

  return PROMOTERS_FALLBACK[clinicName] || [];
}

export function resolvePromoter(code, promoterList) {
  const normalized = normalizePromoCode(code);
  if (!normalized) {
    return { code: '', name: '', recognized: false, noteLine: '' };
  }

  const match = (promoterList || []).find((p) => p.code === normalized);
  if (match) {
    return {
      code: normalized,
      name: match.name,
      recognized: true,
      noteLine: '',
    };
  }

  return {
    code: normalized,
    name: '',
    recognized: false,
    noteLine: '',
  };
}

export function buildPortalBookingNotes({ portalTag, promoter, userNotes = '', locale = 'es', smsConsent }) {
  const labels = locale === 'en'
    ? { portal: 'Portal', promoter: 'Promoter', promoterCode: 'Promoter (code)', comments: 'Comments', smsOptIn: 'SMS opt-in', smsYes: 'yes', smsNo: 'no' }
    : { portal: 'Portal', promoter: 'Promotor', promoterCode: 'Promotor (código)', comments: 'Comentarios', smsOptIn: 'SMS opt-in', smsYes: 'sí', smsNo: 'no' };

  const parts = [`${labels.portal} ${portalTag}`];
  if (promoter?.code) {
    if (promoter.recognized && promoter.name) {
      parts.push(`${labels.promoter}: ${promoter.name} (${promoter.code})`);
    } else {
      parts.push(`${labels.promoterCode}: ${promoter.code}`);
    }
  }
  if (smsConsent !== undefined) {
    parts.push(`${labels.smsOptIn}: ${smsConsent ? labels.smsYes : labels.smsNo}`);
  }
  const extra = String(userNotes || '').trim();
  if (extra) parts.push(`${labels.comments}: ${extra}`);
  return parts.join(' · ');
}

export function buildPromoterNoteLine(code, name, recognized, locale = 'es') {
  const normalized = normalizePromoCode(code);
  if (!normalized) return '';
  if (recognized && name) {
    const label = locale === 'en' ? 'Promoter' : 'Promotor';
    return `${label}: ${name} (${normalized})`;
  }
  const label = locale === 'en' ? 'Promoter (code)' : 'Promotor (código)';
  return `${label}: ${normalized}`;
}
