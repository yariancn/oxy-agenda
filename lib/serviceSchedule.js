import { getMinutes, formatSlotTime } from './publicBookingSlots.js';

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

export function getServiceScheduleBounds(service, companyConfig = {}) {
  const start_time = normalizeTimeInput(service?.start_time) || companyConfig.start_time || '07:00';
  const end_time = normalizeTimeInput(service?.end_time) || companyConfig.end_time || '20:00';
  return {
    start_time,
    end_time,
    startMins: getMinutes(start_time),
    endMins: getMinutes(end_time),
  };
}

/** Genera horarios disponibles dentro del rango del servicio. */
export function buildAvailabilitySlotTimes({
  service,
  companyConfig = {},
  duration = 60,
  buffer = 0,
  stepByBlock = false,
}) {
  const { startMins, endMins } = getServiceScheduleBounds(service, companyConfig);
  const block = (Number(duration) || 60) + (Number(buffer) || 0);
  const step = stepByBlock
    ? block
    : (Number(companyConfig.interval_mins) || 30);
  const times = [];
  for (let m = startMins; m + block <= endMins; m += step) {
    times.push(formatSlotTime(m));
  }
  return times;
}
