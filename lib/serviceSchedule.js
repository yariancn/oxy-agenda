import { getMinutes, formatSlotTime } from './publicBookingSlots.js';

export function getServiceScheduleBounds(service, companyConfig = {}) {
  const start_time = service?.start_time || companyConfig.start_time || '07:00';
  const end_time = service?.end_time || companyConfig.end_time || '20:00';
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
