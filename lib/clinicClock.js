export { getClinicTimezone, localeForClinic } from './clinicRegistry.js';
import { getClinicTimezone } from './clinicRegistry.js';

export function formatClinicDateIso(date, clinic) {
  const value = date instanceof Date ? date : new Date(date);
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: getClinicTimezone(clinic),
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(value);
}

export function getClinicNow(clinic) {
  const tz = getClinicTimezone(clinic);
  const localStr = new Date().toLocaleString('en-US', { timeZone: tz });
  const d = new Date(localStr);
  return {
    date: d,
    mins: d.getHours() * 60 + d.getMinutes(),
    dateStr: formatClinicDateIso(d, clinic),
  };
}
