import { getMinutes, formatSlotTime } from './publicBookingSlots.js';
import {
  getDaySchedule,
  weekdayKeyFromIsoDate,
  WEEKDAY_KEYS,
} from './clinicWeeklySchedule.js';

/** Normaliza "09:00:00" o "9:00 AM" → "09:00" para inputs type="time". */
export function normalizeTimeInput(value) {
  if (!value) return '';
  const raw = String(value).trim();
  const match = raw.match(/(\d{1,2}):(\d{2})/);
  if (!match) return '';
  return `${match[1].padStart(2, '0')}:${match[2]}`;
}

export function minutesToTimeInput(mins) {
  const safe = Math.max(0, Math.min((24 * 60) - 1, Number(mins) || 0));
  const h = Math.floor(safe / 60);
  const m = safe % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function getServiceBlockMins(service, fallbackDuration = 60, fallbackBuffer = 30) {
  const duration = Number(service?.duration) || fallbackDuration;
  const buffer = Number(service?.buffer ?? fallbackBuffer);
  return duration + Math.max(0, buffer);
}

/** Última sesión posible a partir del fin de ventana operativa. */
export function lastSessionFromEndTime(endTime, duration = 60, buffer = 30) {
  const end = normalizeTimeInput(endTime);
  if (!end) return '';
  const block = getServiceBlockMins({ duration, buffer }, duration, buffer);
  return minutesToTimeInput(getMinutes(end) - block);
}

/** Fin de ventana = última sesión + duración + buffer. */
export function endTimeFromLastSession(lastSession, duration = 60, buffer = 30) {
  const last = normalizeTimeInput(lastSession);
  if (!last) return '';
  const block = getServiceBlockMins({ duration, buffer }, duration, buffer);
  return minutesToTimeInput(getMinutes(last) + block);
}

export function serviceHasDayOverrides(weeklySchedule) {
  if (!weeklySchedule || typeof weeklySchedule !== 'object') return false;
  return WEEKDAY_KEYS.some((key) => {
    const day = weeklySchedule[key];
    if (!day || typeof day !== 'object') return false;
    return day.custom_hours === true || day.open === false;
  });
}

/** Resumen corto de overrides (ej. "Sáb 09:30–12:30"). */
export function formatServiceDayOverrides(weeklySchedule, duration = 60, buffer = 30, locale = 'es') {
  if (!serviceHasDayOverrides(weeklySchedule)) return '';
  const short = locale === 'en'
    ? { mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri', sat: 'Sat', sun: 'Sun' }
    : { mon: 'Lun', tue: 'Mar', wed: 'Mié', thu: 'Jue', fri: 'Vie', sat: 'Sáb', sun: 'Dom' };
  const parts = [];
  for (const key of WEEKDAY_KEYS) {
    const day = weeklySchedule[key];
    if (!day || typeof day !== 'object') continue;
    if (day.open === false) {
      parts.push(`${short[key]} ${locale === 'en' ? 'closed' : 'cerrado'}`);
      continue;
    }
    if (day.custom_hours !== true) continue;
    const start = normalizeTimeInput(day.start_time);
    const last = lastSessionFromEndTime(day.end_time, duration, buffer);
    if (start && last) parts.push(`${short[key]} ${start}–${last}`);
  }
  return parts.join(' · ');
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

    const rawSchedule = service?.weekly_schedule;
    if (rawSchedule && typeof rawSchedule === 'object') {
      const key = weekdayKeyFromIsoDate(isoDate);
      const rawDay = rawSchedule[key];
      // Solo días con override explícito; el resto usa horario base del equipo.
      if (rawDay && typeof rawDay === 'object') {
        if (rawDay.open === false) {
          return {
            start_time: '00:00',
            end_time: '00:00',
            startMins: 0,
            endMins: 0,
            closed: true,
          };
        }
        if (rawDay.custom_hours === true) {
          const baseStart = normalizeTimeInput(service?.start_time) || normalizeTimeInput(clinicStart) || '07:00';
          const baseEnd = normalizeTimeInput(service?.end_time) || normalizeTimeInput(clinicEnd) || '20:00';
          const start_time = normalizeTimeInput(rawDay.start_time) || baseStart;
          const end_time = normalizeTimeInput(rawDay.end_time) || baseEnd;
          return {
            start_time,
            end_time,
            startMins: getMinutes(start_time),
            endMins: getMinutes(end_time),
            closed: false,
          };
        }
      }
    }
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
