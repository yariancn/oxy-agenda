import { normalizeTimeInput } from './serviceSchedule.js';

import { resolveClinicLocation } from './clinicLocation.js';
import { getClinicTimezone } from './clinicRegistry.js';

export function timezoneForClinic(clinicName) {
  return getClinicTimezone(clinicName);
}

export function getAppBaseUrl() {
  const explicit = String(process.env.NEXT_PUBLIC_APP_URL || process.env.CANONICAL_HOST || '').trim();
  if (explicit.startsWith('http')) return explicit.replace(/\/$/, '');
  if (explicit) return `https://${explicit.replace(/\/$/, '')}`;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return 'https://oxy-agenda.vercel.app';
}

function parseLocalDateTime(dateStr, timeStr) {
  const date = String(dateStr || '').trim();
  const time = normalizeTimeInput(timeStr);
  if (!date || !time) return null;
  const [year, month, day] = date.split('-').map(Number);
  const [hour, minute] = time.split(':').map(Number);
  if (!year || !month || !day || Number.isNaN(hour) || Number.isNaN(minute)) return null;
  return { year, month, day, hour, minute };
}

function pad(n) {
  return String(n).padStart(2, '0');
}

function formatLocalStamp({ year, month, day, hour, minute }) {
  return `${year}${pad(month)}${pad(day)}T${pad(hour)}${pad(minute)}00`;
}

function addMinutes(parts, totalMins) {
  const start = new Date(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, 0);
  const end = new Date(start.getTime() + totalMins * 60_000);
  return {
    year: end.getFullYear(),
    month: end.getMonth() + 1,
    day: end.getDate(),
    hour: end.getHours(),
    minute: end.getMinutes(),
  };
}

export function buildAppointmentTimes({ date, time, durationMins = 60, bufferMins = 0 }) {
  const startParts = parseLocalDateTime(date, time);
  if (!startParts) return null;
  const totalMins = Math.max(15, (Number(durationMins) || 60) + Math.max(0, Number(bufferMins) || 0));
  const endParts = addMinutes(startParts, totalMins);
  return {
    startParts,
    endParts,
    startStamp: formatLocalStamp(startParts),
    endStamp: formatLocalStamp(endParts),
    totalMins,
  };
}


export function buildGoogleCalendarUrl({
  title,
  startStamp,
  endStamp,
  timezone,
  details = '',
  location = '',
}) {
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: title,
    dates: `${startStamp}/${endStamp}`,
    ctz: timezone,
  });
  if (details) params.set('details', details);
  if (location) params.set('location', location);
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

export function buildOutlookCalendarUrl({
  title,
  date,
  time,
  durationMins,
  details = '',
  location = '',
}) {
  const window = buildAppointmentTimes({ date, time, durationMins, bufferMins: 0 });
  if (!window) return '';
  const startIso = `${date}T${normalizeTimeInput(time)}:00`;
  const endHour = window.endParts.hour;
  const endMin = window.endParts.minute;
  const endDate = `${window.endParts.year}-${pad(window.endParts.month)}-${pad(window.endParts.day)}`;
  const endIso = `${endDate}T${pad(endHour)}:${pad(endMin)}:00`;
  const params = new URLSearchParams({
    subject: title,
    startdt: startIso,
    enddt: endIso,
    body: details,
    location,
  });
  return `https://outlook.live.com/calendar/0/deeplink/compose?${params.toString()}`;
}

export function buildIcsDownloadUrl({
  baseUrl,
  date,
  time,
  durationMins,
  bufferMins,
  title,
  details = '',
  location = '',
  timezone,
}) {
  const params = new URLSearchParams({
    date,
    time: normalizeTimeInput(time),
    duration: String(durationMins || 60),
    buffer: String(bufferMins || 0),
    title,
    details,
    location,
    tz: timezone,
  });
  return `${baseUrl.replace(/\/$/, '')}/api/calendar/ics?${params.toString()}`;
}

export function buildIcsContent({
  title,
  startStamp,
  endStamp,
  details = '',
  location = '',
  timezone,
  uid,
}) {
  const stamp = `${startStamp.slice(0, 4)}${startStamp.slice(4, 6)}${startStamp.slice(6, 8)}T${startStamp.slice(9, 11)}${startStamp.slice(11, 13)}00`;
  const end = `${endStamp.slice(0, 4)}${endStamp.slice(4, 6)}${endStamp.slice(6, 8)}T${endStamp.slice(9, 11)}${endStamp.slice(11, 13)}00`;
  const eventUid = uid || `${stamp}-${Math.random().toString(36).slice(2)}@oxy-agenda`;
  const fold = (line) => line.replace(/\n/g, '\\n');

  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Oxy Agenda//Appointment//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${eventUid}`,
    `DTSTAMP:${stamp}`,
    `DTSTART;TZID=${timezone}:${stamp}`,
    `DTEND;TZID=${timezone}:${end}`,
    `SUMMARY:${fold(title)}`,
    details ? `DESCRIPTION:${fold(details)}` : '',
    location ? `LOCATION:${fold(location)}` : '',
    'END:VEVENT',
    'END:VCALENDAR',
  ].filter(Boolean).join('\r\n');
}

export function buildCalendarEmailBlock({
  locale = 'es',
  clinicName,
  clinicDisplayName,
  patientName,
  date,
  time,
  equipment,
  address = '',
  mapsUrl = '',
  durationMins = 60,
  bufferMins = 0,
  notifyType = 'booking',
  baseUrl = getAppBaseUrl(),
}) {
  if (notifyType === 'cancel' || !date || !time) return '';

  const es = locale !== 'en';
  const timezone = timezoneForClinic(clinicName);
  const location = resolveClinicLocation({ address, mapsUrl });
  const window = buildAppointmentTimes({ date, time, durationMins, bufferMins });
  if (!window) return '';

  const clinic = clinicDisplayName || clinicName || '';
  const title = es
    ? `Cita — ${clinic}`
    : `Appointment — ${clinic}`;
  const details = [
    es ? `Paciente: ${patientName}` : `Patient: ${patientName}`,
    equipment ? (es ? `Servicio: ${equipment}` : `Service: ${equipment}`) : '',
    location.mapsUrl ? (es ? `Mapa: ${location.mapsUrl}` : `Map: ${location.mapsUrl}`) : '',
  ].filter(Boolean).join('\n');

  const calendarLocation = location.address || location.mapsUrl;

  const googleUrl = buildGoogleCalendarUrl({
    title,
    startStamp: window.startStamp,
    endStamp: window.endStamp,
    timezone,
    details,
    location: calendarLocation,
  });
  const outlookUrl = buildOutlookCalendarUrl({
    title,
    date,
    time,
    durationMins: window.totalMins,
    details,
    location: calendarLocation,
  });
  const icsUrl = buildIcsDownloadUrl({
    baseUrl,
    date,
    time,
    durationMins,
    bufferMins,
    title,
    details,
    location: calendarLocation,
    timezone,
  });

  const heading = es ? 'Agregar al calendario' : 'Add to calendar';
  const googleLabel = 'Google Calendar';
  const outlookLabel = 'Outlook';
  const appleLabel = es ? 'Apple / Descargar .ics' : 'Apple / Download .ics';

  return `
    <div style="margin: 24px 0 8px; padding: 16px; background-color: #f0fdf4; border: 1px solid #86efac; border-radius: 8px;">
      <p style="margin: 0 0 12px; font-size: 11px; font-weight: 800; text-transform: uppercase; color: #166534;">📅 ${heading}</p>
      <p style="margin: 0 0 12px; font-size: 13px; color: #14532d; line-height: 1.5;">
        ${es ? 'Guarda tu cita en el calendario de tu teléfono o computadora:' : 'Save this appointment to your phone or computer calendar:'}
      </p>
      <div style="display: flex; flex-wrap: wrap; gap: 8px;">
        <a href="${googleUrl}" style="display: inline-block; padding: 10px 14px; background-color: #059669; color: #ffffff; text-decoration: none; border-radius: 6px; font-size: 12px; font-weight: 700;">${googleLabel}</a>
        <a href="${outlookUrl}" style="display: inline-block; padding: 10px 14px; background-color: #2563eb; color: #ffffff; text-decoration: none; border-radius: 6px; font-size: 12px; font-weight: 700;">${outlookLabel}</a>
        <a href="${icsUrl}" style="display: inline-block; padding: 10px 14px; background-color: #475569; color: #ffffff; text-decoration: none; border-radius: 6px; font-size: 12px; font-weight: 700;">${appleLabel}</a>
      </div>
    </div>
  `;
}
