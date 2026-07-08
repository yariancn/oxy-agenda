import { buildAppointmentTimes, timezoneForClinic } from './calendarLinks.js';
import { parseAppointmentClockTime } from './calendarFeed.js';
import { resolveClinicLocation } from './clinicLocation.js';
import {
  deleteGoogleCalendarEvent,
  refreshGoogleAccessToken,
  upsertGoogleCalendarEvent,
} from './googleCalendar.js';

function pad(n) {
  return String(n).padStart(2, '0');
}

function toGoogleDateTime(parts) {
  if (!parts) return '';
  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}T${pad(parts.hour)}:${pad(parts.minute)}:00`;
}

export function buildGoogleEventFromAppointment(app, { clinicName, companyConfig = {} }) {
  if (!app?.full_date || !app?.time) return null;
  if (app.check_in_status === 'Cancelado') return null;

  const clock = parseAppointmentClockTime(app.time);
  const window = buildAppointmentTimes({
    date: app.full_date,
    time: clock,
    durationMins: Number(app.duration) || 60,
    bufferMins: Number(app.buffer) || 0,
  });
  if (!window) return null;

  const timezone = timezoneForClinic(clinicName);
  const location = resolveClinicLocation({
    address: companyConfig.address,
    mapsUrl: companyConfig.maps_url,
  });

  const patient = String(app.patient || 'Paciente').trim();
  const equipment = String(app.equipment || '').trim();
  const status = String(app.check_in_status || 'Agendado').trim();
  const summary = equipment ? `${patient} — ${equipment}` : patient;

  const description = [
    equipment ? `Servicio: ${equipment}` : '',
    `Estado: ${status}`,
    app.phone ? `Tel: ${app.phone}` : '',
    app.notes ? `Notas: ${app.notes}` : '',
    'Sincronizado desde Oxy Agenda',
  ].filter(Boolean).join('\n');

  return {
    summary,
    description,
    location: location.address || location.mapsUrl || '',
    start: {
      dateTime: toGoogleDateTime(window.startParts),
      timeZone: timezone,
    },
    end: {
      dateTime: toGoogleDateTime(window.endParts),
      timeZone: timezone,
    },
  };
}

export async function getGoogleAccessTokenForClinic(companyConfig) {
  const refreshToken = String(companyConfig?.google_calendar_refresh_token || '').trim();
  if (!refreshToken) return { ok: false, error: 'not_connected' };

  const refreshed = await refreshGoogleAccessToken(refreshToken);
  if (!refreshed.ok) return refreshed;
  return { ok: true, accessToken: refreshed.accessToken };
}

export async function syncAppointmentToGoogleCalendar({
  supabase,
  clinicName,
  companyConfig,
  appointment,
}) {
  if (companyConfig?.google_calendar_enabled !== true) {
    return { ok: true, skipped: true, reason: 'disabled' };
  }

  const tokenResult = await getGoogleAccessTokenForClinic(companyConfig);
  if (!tokenResult.ok) return tokenResult;

  const eventBody = buildGoogleEventFromAppointment(appointment, {
    clinicName,
    companyConfig,
  });
  if (!eventBody) {
    return { ok: true, skipped: true, reason: 'invalid_appointment' };
  }

  const calendarId = String(companyConfig.google_calendar_id || 'primary').trim() || 'primary';
  const existingEventId = String(appointment.google_calendar_event_id || '').trim();

  const result = await upsertGoogleCalendarEvent({
    accessToken: tokenResult.accessToken,
    calendarId,
    eventId: existingEventId || undefined,
    event: eventBody,
  });

  if (!result.ok) return result;

  if (result.eventId && result.eventId !== existingEventId && appointment.id) {
    await supabase
      .from('appointments')
      .update({ google_calendar_event_id: result.eventId })
      .eq('id', appointment.id);
  }

  return { ok: true, eventId: result.eventId };
}

export async function removeAppointmentFromGoogleCalendar({
  supabase,
  clinicName,
  companyConfig,
  appointment,
}) {
  if (companyConfig?.google_calendar_enabled !== true) {
    return { ok: true, skipped: true, reason: 'disabled' };
  }

  const eventId = String(appointment?.google_calendar_event_id || '').trim();
  if (!eventId) return { ok: true, skipped: true, reason: 'no_event_id' };

  const tokenResult = await getGoogleAccessTokenForClinic(companyConfig);
  if (!tokenResult.ok) return tokenResult;

  const calendarId = String(companyConfig.google_calendar_id || 'primary').trim() || 'primary';
  const result = await deleteGoogleCalendarEvent({
    accessToken: tokenResult.accessToken,
    calendarId,
    eventId,
  });

  if (result.ok && appointment?.id) {
    await supabase
      .from('appointments')
      .update({ google_calendar_event_id: null })
      .eq('id', appointment.id);
  }

  return result;
}

export async function loadGoogleCalendarConfig(supabase, clinic) {
  const { data, error } = await supabase
    .from('company_config')
    .select('id, google_calendar_enabled, google_calendar_refresh_token, google_calendar_id, google_calendar_email, name, address, maps_url')
    .eq('clinic', clinic)
    .maybeSingle();

  if (error && /column|schema cache/i.test(error.message || '')) {
    return { data: null, error, columnMissing: true };
  }

  return { data, error, columnMissing: false };
}
