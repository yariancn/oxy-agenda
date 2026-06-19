import { getMinutes } from './publicBookingSlots.js';
import { normalizeTimeInput } from './serviceSchedule.js';

export const WEEKDAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

const WEEKDAY_KEYS_BY_JS_DAY = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

export function getWeekdayLabels(locale = 'es') {
  if (locale === 'en') {
    return {
      mon: 'Monday',
      tue: 'Tuesday',
      wed: 'Wednesday',
      thu: 'Thursday',
      fri: 'Friday',
      sat: 'Saturday',
      sun: 'Sunday',
    };
  }
  return {
    mon: 'Lunes',
    tue: 'Martes',
    wed: 'Miércoles',
    thu: 'Jueves',
    fri: 'Viernes',
    sat: 'Sábado',
    sun: 'Domingo',
  };
}

export function weekdayKeyFromIsoDate(isoDate) {
  const d = new Date(`${isoDate}T12:00:00`);
  return WEEKDAY_KEYS_BY_JS_DAY[d.getDay()];
}

export function buildDefaultWeeklySchedule({
  start_time = '07:00',
  end_time = '20:00',
} = {}) {
  const schedule = {};
  for (const key of WEEKDAY_KEYS) {
    const open = key !== 'sun';
    schedule[key] = {
      open,
      custom_hours: false,
      start_time: normalizeTimeInput(start_time) || '07:00',
      end_time: normalizeTimeInput(end_time) || '20:00',
    };
  }
  return schedule;
}

function normalizeDayEntry(rawDay, defaults) {
  const fallbackStart = normalizeTimeInput(defaults.start_time) || '07:00';
  const fallbackEnd = normalizeTimeInput(defaults.end_time) || '20:00';
  const open = rawDay?.open !== false;
  const custom_hours = rawDay?.custom_hours === true;
  const start_time = normalizeTimeInput(rawDay?.start_time) || fallbackStart;
  const end_time = normalizeTimeInput(rawDay?.end_time) || fallbackEnd;

  return {
    open,
    custom_hours,
    start_time,
    end_time,
  };
}

export function normalizeWeeklySchedule(raw, defaults = {}) {
  const base = buildDefaultWeeklySchedule(defaults);
  if (!raw || typeof raw !== 'object') return base;

  const next = { ...base };
  for (const key of WEEKDAY_KEYS) {
    if (raw[key] && typeof raw[key] === 'object') {
      next[key] = normalizeDayEntry(raw[key], defaults);
    }
  }
  return next;
}

export function getDaySchedule(companyConfig = {}, isoDate) {
  const defaults = {
    start_time: companyConfig.start_time,
    end_time: companyConfig.end_time,
  };
  const schedule = normalizeWeeklySchedule(companyConfig.weekly_schedule, defaults);
  const key = weekdayKeyFromIsoDate(isoDate);
  const day = schedule[key] || schedule.mon;

  if (!day.open) {
    return {
      open: false,
      key,
      start_time: '',
      end_time: '',
      custom_hours: false,
    };
  }

  const useCustom = day.custom_hours === true;
  return {
    open: true,
    key,
    custom_hours: useCustom,
    start_time: useCustom
      ? (normalizeTimeInput(day.start_time) || normalizeTimeInput(defaults.start_time) || '07:00')
      : (normalizeTimeInput(defaults.start_time) || '07:00'),
    end_time: useCustom
      ? (normalizeTimeInput(day.end_time) || normalizeTimeInput(defaults.end_time) || '20:00')
      : (normalizeTimeInput(defaults.end_time) || '20:00'),
  };
}

export function isClinicOpenOnDate(companyConfig, isoDate) {
  return getDaySchedule(companyConfig, isoDate).open;
}

export function resolveCompanyConfigForDate(companyConfig = {}, isoDate) {
  const day = getDaySchedule(companyConfig, isoDate);
  if (!day.open) {
    return { ...companyConfig, _dayClosed: true };
  }
  return {
    ...companyConfig,
    start_time: day.start_time,
    end_time: day.end_time,
  };
}

export function getClinicCalendarGridBounds(companyConfig = {}) {
  const defaults = {
    start_time: companyConfig.start_time,
    end_time: companyConfig.end_time,
  };
  const schedule = normalizeWeeklySchedule(companyConfig.weekly_schedule, defaults);
  const fallbackStart = normalizeTimeInput(defaults.start_time) || '07:00';
  const fallbackEnd = normalizeTimeInput(defaults.end_time) || '20:00';

  let minStart = null;
  let maxEnd = null;

  for (const key of WEEKDAY_KEYS) {
    const day = schedule[key];
    if (!day?.open) continue;

    const start = day.custom_hours
      ? (normalizeTimeInput(day.start_time) || fallbackStart)
      : fallbackStart;
    const end = day.custom_hours
      ? (normalizeTimeInput(day.end_time) || fallbackEnd)
      : fallbackEnd;
    const startMins = getMinutes(start);
    const endMins = getMinutes(end);

    if (minStart === null || startMins < minStart) minStart = startMins;
    if (maxEnd === null || endMins > maxEnd) maxEnd = endMins;
  }

  const start_time = fallbackStart;
  const end_time = fallbackEnd;
  const startMins = minStart ?? getMinutes(fallbackStart);
  const endMins = maxEnd ?? getMinutes(fallbackEnd);

  return { start_time, end_time, startMins, endMins };
}
