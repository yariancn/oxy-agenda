import { PUBLIC_SESSION } from './sessionPresets.js';
import { buildAvailabilitySlotTimes, getServiceScheduleBounds } from './serviceSchedule.js';

export function getMinutes(t) {
  if (!t) return 0;
  const cleanT = String(t).trim();
  const isPM = cleanT.toUpperCase().includes('PM');
  const isAM = cleanT.toUpperCase().includes('AM');
  let [h, m] = cleanT.replace(/AM|PM/gi, '').trim().split(':').map(Number);
  if (Number.isNaN(h)) h = 0;
  if (Number.isNaN(m)) m = 0;
  if (isPM && h !== 12) h += 12;
  if (isAM && h === 12) h = 0;
  return h * 60 + m;
}

export function formatSlotTime(m) {
  const h = Math.floor(m / 60);
  const mins = m % 60;
  const ampm = h >= 12 ? 'PM' : 'AM';
  const dispH = h > 12 ? h - 12 : h === 0 ? 12 : h;
  return `${dispH.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')} ${ampm}`;
}

function slotBlocked(timeStr, equipment, targetDate, dur, buf, dbAppointments, dbBlockedSlots, excludeAppointmentId = null) {
  const start1 = getMinutes(timeStr);
  const end1 = start1 + (Number(dur) || 60) + (Number(buf) || 0);

  const hasOverlap = dbAppointments.some((a) => {
    if (excludeAppointmentId && a.id === excludeAppointmentId) return false;
    if (a.check_in_status === 'Cancelado') return false;
    if (a.equipment !== equipment || a.full_date !== targetDate) return false;
    const start2 = getMinutes(a.time);
    const end2 = start2 + (Number(a.duration) || 60) + (Number(a.buffer) || 0);
    return start1 < end2 && end1 > start2;
  });
  if (hasOverlap) return 'occupied';

  const isBlocked = dbBlockedSlots.some((b) => {
    if (b.date !== targetDate) return false;
    if (!b.is_global && b.equipment !== equipment) return false;
    const bStart = getMinutes(b.start_time);
    const bEnd = getMinutes(b.end_time);
    return (
      (start1 >= bStart && start1 < bEnd)
      || (end1 > bStart && end1 <= bEnd)
      || (start1 <= bStart && end1 >= bEnd)
    );
  });
  if (isBlocked) return 'blocked';

  return null;
}

export function getAppointmentSlotBlockReason({
  time,
  equipment,
  full_date,
  duration = 60,
  buffer = 0,
  appointments = [],
  blockedSlots = [],
  excludeAppointmentId = null,
}) {
  if (!time || !equipment || !full_date) return null;
  return slotBlocked(
    time,
    equipment,
    full_date,
    duration,
    buffer,
    appointments,
    blockedSlots,
    excludeAppointmentId,
  );
}

/** Lista todos los horarios del día con estado (no solo los libres). */
export function buildDaySlots({
  dbConfig,
  selectedDate,
  equipmentName,
  service,
  dbAppointments,
  dbBlockedSlots,
  timezone,
  duration = PUBLIC_SESSION.duration,
  buffer = PUBLIC_SESSION.buffer,
}) {
  if (!dbConfig || !selectedDate || !equipmentName) return [];

  const localNow = new Date(new Date().toLocaleString('en-US', { timeZone: timezone }));
  const todayStr = `${localNow.getFullYear()}-${String(localNow.getMonth() + 1).padStart(2, '0')}-${String(localNow.getDate()).padStart(2, '0')}`;
  const currentMins = localNow.getHours() * 60 + localNow.getMinutes();
  const { startMins, endMins } = getServiceScheduleBounds(service || {}, dbConfig);
  const limitMins = (Number(dbConfig.booking_limit_hours) || 2) * 60;
  const blockMins = (Number(duration) || 60) + (Number(buffer) || 0);

  const slotTimes = buildAvailabilitySlotTimes({
    service: service || {},
    companyConfig: dbConfig,
    duration,
    buffer,
    stepByBlock: true,
  });

  const slots = [];
  for (const timeStr of slotTimes) {
    const m = getMinutes(timeStr);
    let status = 'available';

    if (m + blockMins > endMins || m < startMins) {
      continue;
    }

    if (selectedDate === todayStr && m <= currentMins + limitMins) {
      status = 'too_soon';
    } else {
      const blockReason = slotBlocked(
        timeStr,
        equipmentName,
        selectedDate,
        duration,
        buffer,
        dbAppointments,
        dbBlockedSlots,
      );
      if (blockReason === 'occupied') status = 'occupied';
      else if (blockReason === 'blocked') status = 'blocked';
    }

    slots.push({ time: timeStr, status });
  }

  return slots;
}

export function countAvailableSlots(slots) {
  return slots.filter((s) => s.status === 'available').length;
}
