import { normalizeStr } from './ensurePatient.js';
import { getMinutes } from './publicBookingSlots.js';

/**
 * Sortable key for appointment wall time: YYYY-MM-DD + minutes-from-midnight.
 * Future bookings must NOT count as “prior” vs an earlier first visit (e.g. Friday
 * booked first must not block today’s Houston confirmation SMS).
 */
export function appointmentChronoKey(fullDate, timeStr) {
  const d = String(fullDate || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return null;
  const mins = getMinutes(timeStr || '12:00 AM');
  const safeMins = Number.isFinite(mins) ? Math.max(0, mins) : 0;
  return `${d}T${String(safeMins).padStart(4, '0')}`;
}

/**
 * True when the patient already has another non-cancelled appointment that starts
 * *before* this one (by date+time), or any earlier visit when no reference time is given.
 * Phone is NOT used alone — families often share numbers.
 */
export function patientHasPriorClinicVisits({
  patientName,
  patientId = null,
  appointments = [],
  excludeAppointmentId = null,
  /** Current appointment date — only earlier starts count as prior. */
  beforeFullDate = null,
  beforeTime = null,
  normalize = normalizeStr,
} = {}) {
  const nameKey = normalize(patientName);
  const idKey = patientId != null && patientId !== '' ? String(patientId) : '';
  const excludeKey = excludeAppointmentId != null && excludeAppointmentId !== ''
    ? String(excludeAppointmentId)
    : '';
  const beforeKey = beforeFullDate
    ? appointmentChronoKey(beforeFullDate, beforeTime)
    : null;

  return (appointments || []).some((a) => {
    if (excludeKey && String(a.id) === excludeKey) return false;
    if (String(a.check_in_status || '') === 'Cancelado') return false;

    const appPid = a.patient_id ?? a.patientId;
    const samePatient = (idKey && appPid != null && String(appPid) === idKey)
      || (nameKey && normalize(a.patient) === nameKey);
    if (!samePatient) return false;

    if (!beforeKey) return true;

    const otherKey = appointmentChronoKey(a.full_date || a.fullDate, a.time);
    if (!otherKey) return false;
    return otherKey < beforeKey;
  });
}

/**
 * Should this appointment show the ⭐ new-patient star?
 * History / historico wins over the sticky `is_new_patient` column (often wrong).
 */
export function resolveNewPatientStar({
  patientName,
  patientId = null,
  appointments = [],
  excludeAppointmentId = null,
  fullDate = null,
  time = null,
  historicoSesiones = 0,
  /** When there is no history: honor staff checkbox / draft flag. */
  manualFlag = null,
  justCreated = false,
  normalize = normalizeStr,
} = {}) {
  if ((Number(historicoSesiones) || 0) > 0) return false;
  if (patientHasPriorClinicVisits({
    patientName,
    patientId,
    appointments,
    excludeAppointmentId,
    beforeFullDate: fullDate,
    beforeTime: time,
    normalize,
  })) {
    return false;
  }
  if (manualFlag === false && !justCreated) return false;
  return true;
}

/**
 * Enrich appointments for calendar display: recompute ⭐ from real history.
 */
export function withResolvedNewPatientStars(appointments = [], patients = [], normalize = normalizeStr) {
  const list = appointments || [];
  const byId = new Map((patients || []).map((p) => [String(p.id), p]));

  return list.map((app) => {
    const pid = app.patient_id ?? app.patientId ?? null;
    const pat = (pid != null && byId.get(String(pid)))
      || (patients || []).find((p) => normalize(p.patient) === normalize(app.patient))
      || null;
    const isNew = resolveNewPatientStar({
      patientName: app.patient,
      patientId: pid || pat?.id || null,
      appointments: list,
      excludeAppointmentId: app.id,
      fullDate: app.full_date || app.fullDate,
      time: app.time,
      historicoSesiones: pat?.historicoSesiones ?? pat?.historico_sesiones ?? 0,
      normalize,
    });
    return { ...app, is_new_patient: isNew };
  });
}
