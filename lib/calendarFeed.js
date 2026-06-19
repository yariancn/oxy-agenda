import {
  buildAppointmentTimes,
  getAppBaseUrl,
  timezoneForClinic,
} from './calendarLinks.js';
import { resolveClinicLocation } from './clinicLocation.js';
import { buildDaySlots } from './publicBookingSlots.js';
import { extractPromoterCodeFromNotes, normalizePromoCode } from './promoters.js';

export function generateCalendarFeedToken() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return `${crypto.randomUUID().replace(/-/g, '')}${crypto.randomUUID().replace(/-/g, '')}`;
  }
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 14)}`;
}

export function buildCalendarFeedUrl({ clinic, token, baseUrl = getAppBaseUrl() }) {
  const params = new URLSearchParams({
    clinic,
    token,
  });
  return `${String(baseUrl).replace(/\/$/, '')}/api/calendar/feed?${params.toString()}`;
}

export function buildWebcalFeedUrl(feedUrl) {
  return String(feedUrl).replace(/^https?:/i, 'webcal:');
}

function icsEscape(text) {
  return String(text || '')
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n');
}

/** Convierte "02:30 PM" o "14:30" a "14:30". */
export function parseAppointmentClockTime(timeStr) {
  const raw = String(timeStr || '').trim();
  if (!raw) return '';
  const parts = raw.split(/\s+/);
  const [hRaw, mRaw] = parts[0].split(':');
  let h = Number(hRaw);
  let m = Number(mRaw);
  if (Number.isNaN(h)) h = 0;
  if (Number.isNaN(m)) m = 0;
  const meridiem = (parts[1] || '').toUpperCase();
  if (meridiem === 'PM' && h !== 12) h += 12;
  if (meridiem === 'AM' && h === 12) h = 0;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function formatUtcStamp(date = new Date()) {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

function addDaysIso(isoDate, days) {
  const d = new Date(`${isoDate}T12:00:00`);
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function iterateIsoDates(fromIso, toIso) {
  const dates = [];
  let cur = fromIso;
  while (cur <= toIso) {
    dates.push(cur);
    cur = addDaysIso(cur, 1);
  }
  return dates;
}

function todayIsoInTimezone(timezone) {
  const localNow = new Date(new Date().toLocaleString('en-US', { timeZone: timezone }));
  return `${localNow.getFullYear()}-${String(localNow.getMonth() + 1).padStart(2, '0')}-${String(localNow.getDate()).padStart(2, '0')}`;
}

/** Huecos libres por servicio (misma lógica que el portal público de reservas). */
export function buildAvailabilitySlotsForRange({
  companyConfig,
  services = [],
  appointments = [],
  blockedSlots = [],
  timezone,
  fromDate,
  toDate,
}) {
  if (!companyConfig || !fromDate || !toDate) return [];

  const todayStr = todayIsoInTimezone(timezone);
  const startDate = fromDate < todayStr ? todayStr : fromDate;
  if (startDate > toDate) return [];

  const activeServices = (services || []).filter((service) => service.is_active !== false);
  const slots = [];

  for (const date of iterateIsoDates(startDate, toDate)) {
    for (const service of activeServices) {
      const equipmentName = String(service.name || '').trim();
      if (!equipmentName) continue;

      const duration = Number(service.duration) || 60;
      const buffer = Number(service.buffer ?? 30);

      const daySlots = buildDaySlots({
        dbConfig: companyConfig,
        selectedDate: date,
        equipmentName,
        service,
        dbAppointments: appointments,
        dbBlockedSlots: blockedSlots,
        timezone,
        duration,
        buffer,
      });

      for (const slot of daySlots) {
        if (slot.status !== 'available') continue;
        slots.push({
          date,
          time: slot.time,
          equipment: equipmentName,
          duration,
          buffer,
        });
      }
    }
  }

  return slots;
}

export function filterAppointmentsForPromoter(appointments, promoterCode) {
  const code = normalizePromoCode(promoterCode);
  if (!code) return appointments || [];
  return (appointments || []).filter((app) => {
    if (normalizePromoCode(app.promoter_code) === code) return true;
    return extractPromoterCodeFromNotes(app.notes) === code;
  });
}

export function feedDateWindow({ pastDays = 7, futureDays = 120 } = {}) {
  const today = new Date();
  const todayIso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  return {
    from: addDaysIso(todayIso, -pastDays),
    to: addDaysIso(todayIso, futureDays),
  };
}

export function buildFeedIcsContent({
  clinicName,
  clinicDisplayName,
  address = '',
  mapsUrl = '',
  appointments = [],
  availabilitySlots = [],
}) {
  const timezone = timezoneForClinic(clinicName);
  const location = resolveClinicLocation({ address, mapsUrl });
  const calendarName = icsEscape(clinicDisplayName || clinicName || 'Oxy Agenda');
  const nowStamp = formatUtcStamp();
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Oxy Agenda//Clinic Feed//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${calendarName}`,
    'REFRESH-INTERVAL;VALUE=DURATION:PT1H',
    'X-PUBLISHED-TTL:PT1H',
  ];

  for (const slot of availabilitySlots) {
    if (!slot?.date || !slot?.time) continue;

    const clock = parseAppointmentClockTime(slot.time);
    const window = buildAppointmentTimes({
      date: slot.date,
      time: clock,
      durationMins: Number(slot.duration) || 60,
      bufferMins: Number(slot.buffer) || 0,
    });
    if (!window) continue;

    const equipment = String(slot.equipment || '').trim();
    const title = equipment ? `Disponible — ${equipment}` : 'Disponible';
    const uid = `oxy-avail-${slot.date}-${equipment.replace(/\W+/g, '_')}-${clock.replace(':', '')}@oxy-agenda.vercel.app`;
    const eventLocation = icsEscape(location.address || location.mapsUrl || '');

    lines.push(
      'BEGIN:VEVENT',
      `UID:${uid}`,
      `DTSTAMP:${nowStamp}`,
      `DTSTART;TZID=${timezone}:${window.startStamp}`,
      `DTEND;TZID=${timezone}:${window.endStamp}`,
      `SUMMARY:${icsEscape(title)}`,
      `DESCRIPTION:${icsEscape('Horario libre para agendar en la clínica')}`,
      eventLocation ? `LOCATION:${eventLocation}` : '',
      'TRANSP:TRANSPARENT',
      'CATEGORIES:DISPONIBILIDAD',
      'END:VEVENT',
    );
  }

  for (const app of appointments) {
    if (!app?.full_date || !app?.time) continue;
    if (app.check_in_status === 'Cancelado') continue;

    const clock = parseAppointmentClockTime(app.time);
    const window = buildAppointmentTimes({
      date: app.full_date,
      time: clock,
      durationMins: Number(app.duration) || 60,
      bufferMins: Number(app.buffer) || 0,
    });
    if (!window) continue;

    const patient = String(app.patient || 'Paciente').trim();
    const equipment = String(app.equipment || '').trim();
    const status = String(app.check_in_status || 'Agendado').trim();
    const title = equipment ? `${patient} — ${equipment}` : patient;
    const details = [
      equipment ? `Servicio: ${equipment}` : '',
      `Estado: ${status}`,
      app.phone ? `Tel: ${app.phone}` : '',
      app.notes ? `Notas: ${app.notes}` : '',
    ].filter(Boolean).join('\n');

    const uid = `oxy-appt-${app.id}@oxy-agenda.vercel.app`;
    const eventLocation = icsEscape(location.address || location.mapsUrl || '');

    lines.push(
      'BEGIN:VEVENT',
      `UID:${uid}`,
      `DTSTAMP:${nowStamp}`,
      `DTSTART;TZID=${timezone}:${window.startStamp}`,
      `DTEND;TZID=${timezone}:${window.endStamp}`,
      `SUMMARY:${icsEscape(title)}`,
      details ? `DESCRIPTION:${icsEscape(details)}` : '',
      eventLocation ? `LOCATION:${eventLocation}` : '',
      'END:VEVENT',
    );
  }

  lines.push('END:VCALENDAR');
  return `${lines.filter(Boolean).join('\r\n')}\r\n`;
}
