/** Capacitaciones = full-day courses that do NOT block equipment columns. */

export const CAPACITACION_BAND_HEIGHT_PX = 28;

export const CAPACITACION_LIST_COLUMNS =
  'id, clinic, full_date, title, start_time, end_time, location, notes, attendees, created_at, updated_at';

export function newAttendeeId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return `a-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function normalizeAttendees(raw) {
  const list = Array.isArray(raw) ? raw : [];
  return list
    .map((row) => {
      if (!row || typeof row !== 'object') return null;
      const name = String(row.name || '').trim();
      const phone = String(row.phone || '').trim();
      if (!name && !phone) return null;
      return {
        id: String(row.id || newAttendeeId()),
        name: name || phone,
        phone,
        email: String(row.email || '').trim(),
        confirmation_status: String(row.confirmation_status || 'none'),
        confirmation_sent_at: row.confirmation_sent_at || null,
        reminder_sent_at: row.reminder_sent_at || null,
      };
    })
    .filter(Boolean);
}

export function normalizeCapacitacion(row) {
  if (!row) return null;
  return {
    id: row.id,
    clinic: row.clinic || '',
    full_date: String(row.full_date || '').slice(0, 10),
    title: String(row.title || '').trim() || 'Capacitación',
    start_time: String(row.start_time || '9:00 AM').trim() || '9:00 AM',
    end_time: String(row.end_time || '5:00 PM').trim() || '5:00 PM',
    location: String(row.location || '').trim(),
    notes: String(row.notes || '').trim(),
    attendees: normalizeAttendees(row.attendees),
    created_at: row.created_at || null,
    updated_at: row.updated_at || null,
  };
}

export function capacitacionesForDay(list = [], fullDate) {
  const day = String(fullDate || '').slice(0, 10);
  if (!day) return [];
  return (list || [])
    .map(normalizeCapacitacion)
    .filter((c) => c && c.full_date === day)
    .sort((a, b) => String(a.title).localeCompare(String(b.title), 'es'));
}

export function emptyCapacitacionDraft({ clinic = 'Oxygengdl', fullDate = '' } = {}) {
  return {
    id: null,
    clinic,
    full_date: String(fullDate || '').slice(0, 10),
    title: '',
    start_time: '9:00 AM',
    end_time: '5:00 PM',
    location: '',
    notes: '',
    attendees: [],
  };
}

function formatDateLabel(ymd, locale = 'es') {
  const d = String(ymd || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return d;
  try {
    const [y, m, day] = d.split('-').map(Number);
    return new Date(y, m - 1, day).toLocaleDateString(locale === 'en' ? 'en-US' : 'es-MX', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
    });
  } catch {
    return d;
  }
}

/** Patient-facing confirmation SMS (training attendance). */
export function buildCapacitacionConfirmationSms({
  attendeeName,
  title,
  fullDate,
  startTime,
  endTime,
  location,
  clinicPhone,
  locale = 'es',
}) {
  const when = formatDateLabel(fullDate, locale);
  const place = String(location || '').trim();
  const phone = String(clinicPhone || '').trim();
  if (locale === 'en') {
    return `Hi ${attendeeName}, please confirm the training “${title}” on ${when}, ${startTime}–${endTime}${place ? ` · ${place}` : ''}.${phone ? ` Questions: ${phone}.` : ''}`;
  }
  return `Hola ${attendeeName}, confirma tu asistencia a la capacitación «${title}» el ${when}, ${startTime}–${endTime}${place ? ` · ${place}` : ''}.${phone ? ` Dudas: ${phone}.` : ''}`;
}

/** Reminder SMS the day before / same morning. */
export function buildCapacitacionReminderSms({
  attendeeName,
  title,
  fullDate,
  startTime,
  endTime,
  location,
  locale = 'es',
}) {
  const when = formatDateLabel(fullDate, locale);
  const place = String(location || '').trim();
  if (locale === 'en') {
    return `Reminder: training “${title}” on ${when}, ${startTime}–${endTime}${place ? ` · ${place}` : ''}. See you there, ${attendeeName}.`;
  }
  return `Recordatorio: capacitación «${title}» el ${when}, ${startTime}–${endTime}${place ? ` · ${place}` : ''}. Te esperamos, ${attendeeName}.`;
}

export function attendeeConfirmStats(attendees = []) {
  const list = normalizeAttendees(attendees);
  let pending = 0;
  let sent = 0;
  let reminded = 0;
  for (const a of list) {
    if (a.confirmation_sent_at) sent += 1;
    else pending += 1;
    if (a.reminder_sent_at) reminded += 1;
  }
  return { total: list.length, pending, sent, reminded };
}
