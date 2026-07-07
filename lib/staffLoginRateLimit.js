import { normalizeStaffEmail } from './staffEmail.js';

const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 15 * 60 * 1000;

function isMissingTableError(error) {
  return !!error?.message && /staff_login_attempts|schema cache|does not exist/i.test(error.message);
}

export async function assertLoginNotLocked(supabase, email) {
  const emailKey = normalizeStaffEmail(email);
  if (!emailKey || !supabase) return { ok: true };

  const { data, error } = await supabase
    .from('staff_login_attempts')
    .select('fail_count, locked_until')
    .eq('email_key', emailKey)
    .maybeSingle();

  if (error) {
    if (isMissingTableError(error)) return { ok: true, tableMissing: true };
    return { ok: true };
  }

  if (data?.locked_until) {
    const lockedUntil = new Date(data.locked_until);
    if (lockedUntil > new Date()) {
      return { ok: false, error: 'locked', lockedUntil: lockedUntil.toISOString() };
    }
  }

  return { ok: true };
}

export async function recordLoginFailure(supabase, email) {
  const emailKey = normalizeStaffEmail(email);
  if (!emailKey || !supabase) return;

  const { data, error } = await supabase
    .from('staff_login_attempts')
    .select('fail_count')
    .eq('email_key', emailKey)
    .maybeSingle();

  if (error && isMissingTableError(error)) return;

  const nextCount = (data?.fail_count || 0) + 1;
  const payload = {
    email_key: emailKey,
    fail_count: nextCount,
    locked_until: nextCount >= MAX_ATTEMPTS
      ? new Date(Date.now() + LOCKOUT_MS).toISOString()
      : null,
    updated_at: new Date().toISOString(),
  };

  await supabase.from('staff_login_attempts').upsert(payload, { onConflict: 'email_key' });
}

export async function clearLoginAttempts(supabase, email) {
  const emailKey = normalizeStaffEmail(email);
  if (!emailKey || !supabase) return;
  await supabase.from('staff_login_attempts').delete().eq('email_key', emailKey);
}

export function lockoutMinutesRemaining(lockedUntilIso) {
  const ms = new Date(lockedUntilIso).getTime() - Date.now();
  return Math.max(1, Math.ceil(ms / 60000));
}
