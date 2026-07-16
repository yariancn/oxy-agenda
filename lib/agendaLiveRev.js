import { normalizeClinicId } from './clinicRegistry.js';
import { computeLiveSyncToken } from './liveSyncToken.js';

const LIVE_BUMP_TABLES = new Set([
  'appointments',
  'blocked_slots',
  'services',
  'company_config',
  'patients',
  'session_groups',
]);

export function shouldBumpAgendaLiveRev(table) {
  return LIVE_BUMP_TABLES.has(table);
}

/**
 * Lightweight ping token: company_config.agenda_rev.
 * Falls back to the heavy snapshot hash if the column is missing.
 */
export async function readAgendaLiveToken({ supabase, clinicName }) {
  const clinicId = normalizeClinicId(clinicName);
  const { data, error } = await supabase
    .from('company_config')
    .select('agenda_rev')
    .eq('clinic', clinicId)
    .maybeSingle();

  if (error) {
    if (/agenda_rev|column|schema cache/i.test(error.message || '')) {
      const snapshot = await computeLiveSyncToken({ supabase, clinicName });
      return { ...snapshot, mode: 'hash-fallback' };
    }
    throw error;
  }

  const rev = Math.max(0, Number(data?.agenda_rev) || 0);
  return {
    token: `rev:${rev}`,
    at: new Date().toISOString(),
    mode: 'rev',
    rev,
  };
}

/**
 * O(1) bump so other open sessions notice the change on the next ping.
 * Safe no-op if column is missing.
 */
export async function bumpAgendaLiveRev(supabase, clinicName) {
  if (!supabase) return { ok: false, reason: 'missing_supabase' };
  const clinicId = normalizeClinicId(clinicName);

  const { data, error } = await supabase
    .from('company_config')
    .select('agenda_rev')
    .eq('clinic', clinicId)
    .maybeSingle();

  if (error) {
    if (/agenda_rev|column|schema cache/i.test(error.message || '')) {
      return { ok: false, reason: 'missing_column' };
    }
    return { ok: false, reason: error.message };
  }

  if (!data) return { ok: false, reason: 'missing_config' };

  const next = Math.max(0, Number(data.agenda_rev) || 0) + 1;
  const { error: updErr } = await supabase
    .from('company_config')
    .update({ agenda_rev: next })
    .eq('clinic', clinicId);

  if (updErr) {
    if (/agenda_rev|column|schema cache/i.test(updErr.message || '')) {
      return { ok: false, reason: 'missing_column' };
    }
    return { ok: false, reason: updErr.message };
  }

  return { ok: true, rev: next };
}
