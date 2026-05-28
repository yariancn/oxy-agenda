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

export function getPromoFromUrl() {
  if (typeof window === 'undefined') return '';
  const params = new URLSearchParams(window.location.search);
  return normalizePromoCode(params.get('promo') || params.get('ref') || '');
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

export function buildPortalBookingNotes({ portalTag, promoter, userNotes = '', locale = 'es' }) {
  const labels = locale === 'en'
    ? { portal: 'Portal', promoter: 'Promoter', promoterCode: 'Promoter (code)', comments: 'Comments' }
    : { portal: 'Portal', promoter: 'Promotor', promoterCode: 'Promotor (código)', comments: 'Comentarios' };

  const parts = [`${labels.portal} ${portalTag}`];
  if (promoter?.code) {
    if (promoter.recognized && promoter.name) {
      parts.push(`${labels.promoter}: ${promoter.name} (${promoter.code})`);
    } else {
      parts.push(`${labels.promoterCode}: ${promoter.code}`);
    }
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
