import { getAppointmentSlotBlockReason } from './publicBookingSlots.js';
import { isClinicOpenOnDate } from './clinicWeeklySchedule.js';

export const SLOT_UNAVAILABLE = 'SLOT_UNAVAILABLE';

export async function validateAppointmentSlot(
  supabase,
  payload,
  { excludeAppointmentId = null } = {},
) {
  const equipment = String(payload.equipment || '').trim();
  const full_date = String(payload.full_date || payload.appointment_date || '').trim();
  const time = String(payload.time || payload.appointment_time || '').trim();

  if (!equipment || !full_date || !time) {
    return { ok: true };
  }

  const { data: clinicConfig } = await supabase
    .from('company_config')
    .select('start_time, end_time, weekly_schedule')
    .limit(1)
    .maybeSingle();

  if (clinicConfig && !isClinicOpenOnDate(clinicConfig, full_date)) {
    return { ok: false, reason: 'closed', code: SLOT_UNAVAILABLE };
  }

  const [{ data: appointments, error: appsError }, { data: blockedSlots, error: blocksError }] = await Promise.all([
    supabase
      .from('appointments')
      .select('id, equipment, full_date, time, duration, buffer, check_in_status')
      .eq('full_date', full_date)
      .eq('equipment', equipment)
      .neq('check_in_status', 'Cancelado'),
    supabase
      .from('blocked_slots')
      .select('*')
      .eq('date', full_date),
  ]);

  if (appsError) return { ok: false, error: appsError };
  if (blocksError) return { ok: false, error: blocksError };

  const conflict = getAppointmentSlotBlockReason({
    time,
    equipment,
    full_date,
    duration: payload.duration,
    buffer: payload.buffer,
    appointments: appointments || [],
    blockedSlots: blockedSlots || [],
    excludeAppointmentId,
  });

  if (conflict) {
    return { ok: false, reason: conflict, code: SLOT_UNAVAILABLE };
  }

  return { ok: true };
}
