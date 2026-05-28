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
      noteLine: `Promotor: ${match.name} (${normalized})`,
    };
  }

  return {
    code: normalized,
    name: '',
    recognized: false,
    noteLine: `Promotor (código): ${normalized}`,
  };
}

export function buildPortalBookingNotes({ portalTag, promoter, userNotes = '' }) {
  const parts = [`Portal ${portalTag}`];
  if (promoter?.noteLine) parts.push(promoter.noteLine);
  const extra = String(userNotes || '').trim();
  if (extra) parts.push(`Comentarios: ${extra}`);
  return parts.join(' · ');
}
