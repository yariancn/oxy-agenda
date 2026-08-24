import { blockedSlotAppliesToDate } from './blockedSlots.js';
import { getAppointmentSlotBlockReason } from './publicBookingSlots.js';
import { isClinicOpenOnDate } from './clinicWeeklySchedule.js';
import {
  filterRowsByClinic,
  normalizeClinicId,
  selectCompanyConfigForClinic,
  shouldScopeTableByClinic,
} from './clinicRegistry.js';

export const SLOT_UNAVAILABLE = 'SLOT_UNAVAILABLE';

export async function validateAppointmentSlot(
  supabase,
  payload,
  { excludeAppointmentId = null, clinicName = null } = {},
) {
  const equipment = String(payload.equipment || '').trim();
  const full_date = String(payload.full_date || payload.appointment_date || '').trim();
  const time = String(payload.time || payload.appointment_time || '').trim();
  const clinicId = normalizeClinicId(clinicName || payload.clinic);

  if (!equipment || !full_date || !time) {
    return { ok: true };
  }

  let clinicConfig = null;
  {
    const { data, error } = await selectCompanyConfigForClinic(supabase, clinicId);
    if (!error && data) clinicConfig = data;
  }

  if (clinicConfig && !isClinicOpenOnDate(clinicConfig, full_date)) {
    return { ok: false, reason: 'closed', code: SLOT_UNAVAILABLE };
  }

  let appointmentsRaw = null;
  let blockedRaw = null;

  const appsRes = await supabase
    .from('appointments')
    .select('*')
    .eq('full_date', full_date)
    .eq('equipment', equipment)
    .neq('check_in_status', 'Cancelado');

  if (appsRes.error) return { ok: false, error: appsRes.error };
  appointmentsRaw = appsRes.data;

  const blocksRes = await supabase
    .from('blocked_slots')
    .select('*')
    .lte('date', full_date);

  if (blocksRes.error) return { ok: false, error: blocksRes.error };
  blockedRaw = blocksRes.data;

  const appointments = shouldScopeTableByClinic(clinicId)
    ? filterRowsByClinic(appointmentsRaw || [], clinicId)
    : (appointmentsRaw || []);
  const blockedSlots = (shouldScopeTableByClinic(clinicId)
    ? filterRowsByClinic(blockedRaw || [], clinicId)
    : (blockedRaw || []))
    .filter((row) => blockedSlotAppliesToDate(row, full_date));

  const conflict = getAppointmentSlotBlockReason({
    time,
    equipment,
    full_date,
    duration: payload.duration,
    buffer: payload.buffer,
    appointments,
    blockedSlots,
    excludeAppointmentId,
  });

  if (conflict) {
    return { ok: false, reason: conflict, code: SLOT_UNAVAILABLE };
  }

  return { ok: true };
}
