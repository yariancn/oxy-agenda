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

/** Previous calendar days only — same-day earlier hours are allowed for staff. */
export function isPastCalendarDay(dateStr, todayIso) {
  if (!dateStr || !todayIso) return false;
  return String(dateStr) < String(todayIso);
}

/**
 * True when the slot is before "now" in clinic time.
 * Staff create/move for *today* should use isPastCalendarDay instead —
 * same-day earlier hours are allowed without a code.
 */
export function isPastDateTime(dateStr, timeMins, clinicNow = {}) {
  if (!dateStr || !clinicNow.dateStr) return false;
  if (isPastCalendarDay(dateStr, clinicNow.dateStr)) return true;
  if (dateStr === clinicNow.dateStr && Number(timeMins) < Number(clinicNow.mins || 0)) return true;
  return false;
}
