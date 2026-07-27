import { normalizeStr } from './ensurePatient.js';

/**
 * True when the patient already has another non-cancelled appointment in this clinic
 * (by patient_id or exact name). Phone is NOT used alone — families often share numbers.
 */
export function patientHasPriorClinicVisits({
  patientName,
  patientId = null,
  appointments = [],
  excludeAppointmentId = null,
  normalize = normalizeStr,
} = {}) {
  const nameKey = normalize(patientName);
  const idKey = patientId != null && patientId !== '' ? String(patientId) : '';
  const excludeKey = excludeAppointmentId != null && excludeAppointmentId !== ''
    ? String(excludeAppointmentId)
    : '';

  return (appointments || []).some((a) => {
    if (excludeKey && String(a.id) === excludeKey) return false;
    if (String(a.check_in_status || '') === 'Cancelado') return false;

    const appPid = a.patient_id ?? a.patientId;
    if (idKey && appPid != null && String(appPid) === idKey) return true;
    if (nameKey && normalize(a.patient) === nameKey) return true;
    return false;
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
      historicoSesiones: pat?.historicoSesiones ?? pat?.historico_sesiones ?? 0,
      normalize,
    });
    return { ...app, is_new_patient: isNew };
  });
}
