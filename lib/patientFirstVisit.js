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

function pushChronoEntry(map, key, entry) {
  if (!key) return;
  const list = map.get(key);
  if (list) list.push(entry);
  else map.set(key, [entry]);
}

function hasEarlierVisit(entries, beforeKey, excludeId) {
  if (!entries?.length) return false;
  const exclude = excludeId != null && excludeId !== '' ? String(excludeId) : '';
  if (!beforeKey) {
    return entries.some((e) => !exclude || String(e.id) !== exclude);
  }
  for (const e of entries) {
    if (exclude && String(e.id) === exclude) continue;
    if (e.key < beforeKey) return true;
    // lists are sorted ascending by chrono key
    if (e.key >= beforeKey) break;
  }
  return false;
}

/**
 * Enrich appointments for calendar display: recompute ⭐ from real history.
 * O(n log n) via indexed prior visits — not O(n²) per appointment scan.
 */
export function withResolvedNewPatientStars(appointments = [], patients = [], normalize = normalizeStr) {
  const list = appointments || [];
  const byId = new Map((patients || []).map((p) => [String(p.id), p]));
  const byName = new Map();
  for (const p of patients || []) {
    const k = normalize(p.patient);
    if (k && !byName.has(k)) byName.set(k, p);
  }

  const keysByPid = new Map();
  const keysByName = new Map();
  for (const a of list) {
    if (String(a.check_in_status || '') === 'Cancelado') continue;
    const key = appointmentChronoKey(a.full_date || a.fullDate, a.time);
    if (!key) continue;
    const entry = { key, id: a.id };
    const pid = a.patient_id ?? a.patientId;
    if (pid != null && pid !== '') pushChronoEntry(keysByPid, String(pid), entry);
    const nameKey = normalize(a.patient);
    if (nameKey) pushChronoEntry(keysByName, nameKey, entry);
  }
  for (const arr of keysByPid.values()) arr.sort((a, b) => a.key.localeCompare(b.key));
  for (const arr of keysByName.values()) arr.sort((a, b) => a.key.localeCompare(b.key));

  return list.map((app) => {
    const pid = app.patient_id ?? app.patientId ?? null;
    const pat = (pid != null && byId.get(String(pid)))
      || byName.get(normalize(app.patient))
      || null;
    const historico = pat?.historicoSesiones ?? pat?.historico_sesiones ?? 0;
    if ((Number(historico) || 0) > 0) {
      return { ...app, is_new_patient: false };
    }

    const beforeKey = appointmentChronoKey(app.full_date || app.fullDate, app.time);
    const idKey = pid != null && pid !== '' ? String(pid) : '';
    const nameKey = normalize(app.patient);
    const prior = (idKey && hasEarlierVisit(keysByPid.get(idKey), beforeKey, app.id))
      || (nameKey && hasEarlierVisit(keysByName.get(nameKey), beforeKey, app.id));

    return { ...app, is_new_patient: !prior };
  });
}
