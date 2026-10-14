/** Capacitaciones = full-day courses that do NOT block equipment columns. */

export const CAPACITACION_BAND_HEIGHT_PX = 28;

export const CAPACITACION_LIST_COLUMNS =
  'id, clinic, full_date, title, start_time, end_time, location, notes, attendees, created_at, updated_at';

export function newAttendeeId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return `a-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function normalizeAttendeeEmail(raw) {
  return String(raw || '').trim().toLowerCase();
}

export function normalizeAttendees(raw) {
  const list = Array.isArray(raw) ? raw : [];
  return list
    .map((row) => {
      if (!row || typeof row !== 'object') return null;
      const name = String(row.name || '').trim();
      const phone = String(row.phone || '').trim();
      const email = normalizeAttendeeEmail(row.email);
      if (!name && !phone && !email) return null;
      return {
        id: String(row.id || newAttendeeId()),
        name: name || phone || email,
        phone,
        email,
        confirmation_status: String(row.confirmation_status || 'none'),
        confirmation_sent_at: row.confirmation_sent_at || null,
        confirmation_email_sent_at: row.confirmation_email_sent_at || null,
        reminder_sent_at: row.reminder_sent_at || null,
        reminder_email_sent_at: row.reminder_email_sent_at || null,
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

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Email subject + HTML for capacitacion confirmation / reminder. */
export function buildCapacitacionEmail({
  kind = 'confirmation',
  attendeeName,
  title,
  fullDate,
  startTime,
  endTime,
  location,
  clinicDisplayName,
  clinicPhone,
  locale = 'es',
}) {
  const when = formatDateLabel(fullDate, locale);
  const place = String(location || '').trim();
  const clinic = String(clinicDisplayName || '').trim() || (locale === 'en' ? 'Clinic' : 'Clínica');
  const phone = String(clinicPhone || '').trim();
  const isReminder = kind === 'reminder';
  const en = locale === 'en';

  const subject = en
    ? (isReminder
      ? `Reminder: training “${title}” · ${when}`
      : `Please confirm: training “${title}” · ${when}`)
    : (isReminder
      ? `Recordatorio: capacitación «${title}» · ${when}`
      : `Confirma tu asistencia: capacitación «${title}» · ${when}`);

  const intro = en
    ? (isReminder
      ? `Hi ${attendeeName}, this is a reminder of your upcoming training.`
      : `Hi ${attendeeName}, please confirm your attendance for this training.`)
    : (isReminder
      ? `Hola ${attendeeName}, te recordamos tu capacitación.`
      : `Hola ${attendeeName}, confirma tu asistencia a esta capacitación.`);

  const details = [
    en ? `<strong>Course:</strong> ${escapeHtml(title)}` : `<strong>Curso:</strong> ${escapeHtml(title)}`,
    en ? `<strong>Date:</strong> ${escapeHtml(when)}` : `<strong>Fecha:</strong> ${escapeHtml(when)}`,
    en ? `<strong>Time:</strong> ${escapeHtml(startTime)} – ${escapeHtml(endTime)}` : `<strong>Horario:</strong> ${escapeHtml(startTime)} – ${escapeHtml(endTime)}`,
    place ? (en ? `<strong>Location:</strong> ${escapeHtml(place)}` : `<strong>Ubicación:</strong> ${escapeHtml(place)}`) : '',
    `<strong>${escapeHtml(clinic)}</strong>${phone ? ` · ${escapeHtml(phone)}` : ''}`,
  ].filter(Boolean).join('<br/>');

  const html = `
    <div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.5;color:#0f172a">
      <p>${escapeHtml(intro)}</p>
      <p>${details}</p>
      <p style="color:#64748b;font-size:13px">${en ? 'If you cannot attend, please reply to this email or call the clinic.' : 'Si no puedes asistir, responde este correo o llama a la clínica.'}</p>
    </div>
  `.trim();

  const text = en
    ? `${intro}\n\n${title}\n${when} · ${startTime}–${endTime}${place ? `\n${place}` : ''}\n${clinic}${phone ? ` · ${phone}` : ''}`
    : `${intro}\n\n${title}\n${when} · ${startTime}–${endTime}${place ? `\n${place}` : ''}\n${clinic}${phone ? ` · ${phone}` : ''}`;

  return { subject, html, text };
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

export function formatCapacitacionDateLabel(ymd, locale = 'es') {
  return formatDateLabel(ymd, locale);
}

/** Sorted unique YYYY-MM-DD dates that have at least one training. */
export function capacitacionDateSet(list = []) {
  const set = new Set();
  for (const row of list || []) {
    const c = normalizeCapacitacion(row);
    if (c?.full_date) set.add(c.full_date);
  }
  return set;
}

/** All trainings sorted by date then title. */
export function sortedCapacitaciones(list = []) {
  return (list || [])
    .map(normalizeCapacitacion)
    .filter(Boolean)
    .sort((a, b) => {
      const byDate = String(a.full_date).localeCompare(String(b.full_date));
      if (byDate) return byDate;
      return String(a.title).localeCompare(String(b.title), 'es');
    });
}

/**
 * Build month grid cells for a mini calendar.
 * Returns { year, month, label, cells: [{ key, ymd|null, inMonth, dayNum }] }
 */
export function buildCapacitacionMonthGrid(year, month /* 0-11 */, locale = 'es') {
  const first = new Date(year, month, 1);
  const label = first.toLocaleDateString(locale === 'en' ? 'en-US' : 'es-MX', {
    month: 'long',
    year: 'numeric',
  });
  // Monday-first week
  const jsDow = first.getDay(); // 0 Sun .. 6 Sat
  const mondayOffset = (jsDow + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < mondayOffset; i += 1) {
    cells.push({ key: `pad-${i}`, ymd: null, inMonth: false, dayNum: null });
  }
  for (let day = 1; day <= daysInMonth; day += 1) {
    const ymd = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    cells.push({ key: ymd, ymd, inMonth: true, dayNum: day });
  }
  while (cells.length % 7 !== 0) {
    cells.push({ key: `trail-${cells.length}`, ymd: null, inMonth: false, dayNum: null });
  }
  return { year, month, label, cells };
}
