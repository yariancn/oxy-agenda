import { getMinutes, formatSlotTime } from './publicBookingSlots.js';
import { getDaySchedule } from './clinicWeeklySchedule.js';

/** Normaliza "09:00:00" o "9:00 AM" → "09:00" para inputs type="time". */
export function normalizeTimeInput(value) {
  if (!value) return '';
  const raw = String(value).trim();
  const match = raw.match(/(\d{1,2}):(\d{2})/);
  if (!match) return '';
  return `${match[1].padStart(2, '0')}:${match[2]}`;
}

export function getServiceBlockMins(service, fallbackDuration = 60, fallbackBuffer = 30) {
  const duration = Number(service?.duration) || fallbackDuration;
  const buffer = Number(service?.buffer ?? fallbackBuffer);
  return duration + Math.max(0, buffer);
}

export function getServiceScheduleBounds(service, companyConfig = {}, isoDate = null) {
  let clinicStart = companyConfig.start_time;
  let clinicEnd = companyConfig.end_time;

  if (isoDate) {
    const day = getDaySchedule(companyConfig, isoDate);
    if (!day.open) {
      return {
        start_time: '00:00',
        end_time: '00:00',
        startMins: 0,
        endMins: 0,
        closed: true,
      };
    }
    clinicStart = day.start_time;
    clinicEnd = day.end_time;
  }

  const start_time = normalizeTimeInput(service?.start_time) || normalizeTimeInput(clinicStart) || '07:00';
  const end_time = normalizeTimeInput(service?.end_time) || normalizeTimeInput(clinicEnd) || '20:00';
  return {
    start_time,
    end_time,
    startMins: getMinutes(start_time),
    endMins: getMinutes(end_time),
    closed: false,
  };
}

/** Genera horarios disponibles dentro del rango del servicio. */
export function buildAvailabilitySlotTimes({
  service,
  companyConfig = {},
  isoDate = null,
  duration = 60,
  buffer = 0,
  stepByBlock = false,
  allowPastEnd = false,
}) {
  const { startMins, endMins, closed } = getServiceScheduleBounds(service, companyConfig, isoDate);
  if (closed) return [];
  const block = (Number(duration) || 60) + (Number(buffer) || 0);
  const step = stepByBlock
    ? block
    : (Number(companyConfig.interval_mins) || 30);
  const times = [];
  const limit = allowPastEnd ? endMins : endMins - block + 1;
  for (let m = startMins; m < limit; m += step) {
    if (!allowPastEnd && m + block > endMins) break;
    times.push(formatSlotTime(m));
  }
  return times;
}

/** Horarios para modal staff: bloques del equipo o rejilla libre fuera de horario. */
export function buildStaffAppointmentTimeOptions({
  service,
  companyConfig = {},
  isoDate = null,
  duration = 60,
  buffer = 30,
  outsideNormalHours = false,
}) {
  const block = (Number(duration) || 60) + (Number(buffer) ?? 0);

  if (outsideNormalHours) {
    return buildAvailabilitySlotTimes({
      service: {},
      companyConfig,
      isoDate,
      duration,
      buffer,
      stepByBlock: false,
      allowPastEnd: true,
    });
  }

  return buildAvailabilitySlotTimes({
    service: service || {},
    companyConfig,
    isoDate,
    duration,
    buffer,
    stepByBlock: true,
  });
}
