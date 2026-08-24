import { formatClinicDateIso, getClinicNow } from '../clinicClock.js';
import { normalizeAppointmentDate, normalizeAppointmentTime } from '../screenshotAppointmentParse.js';
import { digitsOnly } from '../ensurePatient.js';
import {
  extractLoosePatientName,
  foldAgentText,
  stripPatientSearchPrefix,
  tokenizeAgentText,
} from './textUnderstand.js';

export function extractPatientSearchQuery(message) {
  const text = String(message || '').trim();
  const loose = extractLoosePatientName(text);
  if (loose) return loose;
  return stripPatientSearchPrefix(text);
}

export function parseMessageParams(message, { referenceDate, clinic } = {}) {
  const text = String(message || '').trim();
  const blob = foldAgentText(text);

  let fullDate = '';
  if (/\bhoy\b|\btoday\b/.test(blob)) {
    fullDate = referenceDate || formatClinicDateIso(new Date(), clinic);
  } else if (/\bmanana\b|\btomorrow\b/.test(blob)) {
    fullDate = normalizeAppointmentDate('mañana', referenceDate);
  } else {
    const iso = text.match(/\b(20\d{2}-\d{2}-\d{2})\b/);
    if (iso) fullDate = iso[1];
    const dmy = text.match(/\b(\d{1,2}[\/\-.]\d{1,2}(?:[\/\-.]\d{2,4})?)\b/);
    if (!fullDate && dmy) fullDate = normalizeAppointmentDate(dmy[1], referenceDate);
  }

  let time = '';
  const timeMatch = text.match(/\b(\d{1,2})\s*[:.]\s*(\d{2})\s*(am|pm)?\b/i);
  if (timeMatch) {
    time = normalizeAppointmentTime(`${timeMatch[1]}:${timeMatch[2]} ${timeMatch[3] || ''}`.trim());
  }

  let phone = '';
  const phoneMatch = text.match(/\b(\d{10,13})\b/);
  if (phoneMatch) phone = phoneMatch[1];

  let patient = extractLoosePatientName(text);
  if (!patient) {
    const tokens = tokenizeAgentText(text);
    const paraIdx = tokens.indexOf('para');
    if (paraIdx >= 0 && tokens.length > paraIdx + 1) {
      patient = tokens.slice(paraIdx + 1).join(' ');
    }
  }

  let equipment = '';
  const cam = blob.match(/camara\s*(\d+)/);
  if (cam) equipment = `camara ${cam[1]}`;

  let appointmentId = '';
  const idMatch = text.match(/\bid\s*[:#]?\s*([a-f0-9-]{8,})/i);
  if (idMatch) appointmentId = idMatch[1];

  return {
    fullDate,
    time,
    phone,
    patient,
    equipment,
    appointmentId,
    query: text,
  };
}

export function todayForClinic(clinic) {
  return getClinicNow(clinic).dateStr;
}

export function normalizePatientRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    patient: String(row.Name || row.name || row.patient || '').trim(),
    phone: String(row.Phone || row.phone || '').trim(),
    email: String(row.Email || row.email || '').trim(),
    protocol: row.protocol || 'Wellness',
    is_blocked: !!row.is_blocked,
    block_reason: String(row.block_reason || '').trim(),
  };
}

export function normalizeAppointmentRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    patient: row.patient,
    phone: row.phone || '',
    time: row.time || row.appointment_time || '',
    full_date: row.full_date || row.appointment_date || '',
    equipment: row.equipment || '',
    check_in_status: row.check_in_status || '',
    notes: row.notes || '',
    attendant: row.attendant || '',
  };
}

export function phoneLast10(value) {
  return digitsOnly(value).slice(-10);
}
