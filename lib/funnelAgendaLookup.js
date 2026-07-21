import { getSupabaseAdmin } from './supabaseAdmin.js';

const CLINIC = 'Shenandoah';

function digitsOnly(value) {
  return String(value || '').replace(/\D/g, '');
}

function phoneLast10(value) {
  const digits = digitsOnly(value);
  if (digits.length >= 11 && digits.startsWith('1')) return digits.slice(-10);
  return digits.length >= 10 ? digits.slice(-10) : digits;
}

function isCancelledStatus(status) {
  return /cancel|cancelad|no.?show|noshow/i.test(String(status || ''));
}

/**
 * True if Shenandoah agenda already has a non-cancelled appointment for this
 * email or phone in the last ~7 days (proof they booked).
 */
export async function hasRecentAgendaAppointment({ email = '', phone = '' } = {}) {
  const normalizedEmail = String(email || '').trim().toLowerCase();
  const last10 = phoneLast10(phone);
  if (!normalizedEmail && last10.length < 10) {
    return { booked: false, reason: 'no_identity' };
  }

  const supabase = getSupabaseAdmin(CLINIC);
  const sinceDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const candidates = [];

  if (normalizedEmail) {
    const { data, error } = await supabase
      .from('appointments')
      .select('id, patient, phone, email, full_date, check_in_status, created_at')
      .ilike('email', normalizedEmail)
      .gte('full_date', sinceDate)
      .limit(10);
    if (error && !/column .*email|schema cache/i.test(error.message || '')) {
      throw error;
    }
    if (Array.isArray(data)) candidates.push(...data);
  }

  if (last10.length >= 10) {
    const { data, error } = await supabase
      .from('appointments')
      .select('id, patient, phone, email, full_date, check_in_status, created_at')
      .ilike('phone', `%${last10}%`)
      .gte('full_date', sinceDate)
      .limit(15);
    if (error) throw error;
    for (const row of data || []) {
      if (phoneLast10(row.phone) !== last10) continue;
      if (!candidates.some((c) => String(c.id) === String(row.id))) {
        candidates.push(row);
      }
    }
  }

  const active = candidates.filter((row) => !isCancelledStatus(row.check_in_status));
  if (!active.length) {
    return { booked: false, checked: candidates.length };
  }

  const match = active[0];
  return {
    booked: true,
    appointmentId: match.id,
    fullDate: match.full_date,
    patient: match.patient,
    checked: candidates.length,
  };
}
