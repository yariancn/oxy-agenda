import { digitsOnly, normalizeStr, resolvePatientForAppointment } from './ensurePatient.js';

/**
 * Las citas guardan `patient` como texto. Al renombrar un expediente hay que
 * propagar el nombre o la agenda y la bitácora quedan desincronizadas.
 */

export function isStaleAppointmentPatientName(app, patient) {
  if (!app || !patient) return false;
  return normalizeStr(app.patient) !== normalizeStr(patient.patient);
}

export async function syncAppointmentPatientName(supabase, appointmentId, canonicalName) {
  const name = String(canonicalName || '').trim();
  if (!appointmentId || !name) return { updated: false };
  const { error } = await supabase.from('appointments').update({ patient: name }).eq('id', appointmentId);
  if (error) throw error;
  return { updated: true };
}

export async function renamePatientAcrossClinic(supabase, { oldName, newName, phone } = {}) {
  const oldTrim = String(oldName || '').trim();
  const newTrim = String(newName || '').trim();
  const oldKey = normalizeStr(oldTrim);
  const newKey = normalizeStr(newTrim);
  if (!newTrim || oldKey === newKey) {
    return { appointments: 0, auditLogs: 0 };
  }

  let appointments = 0;
  let auditLogs = 0;
  const updatedApptIds = new Set();

  const last10 = digitsOnly(phone).slice(-10);
  if (last10.length === 10) {
    const { data: phoneRows, error: phoneErr } = await supabase
      .from('appointments')
      .select('id, patient, phone')
      .ilike('phone', `%${last10}%`);
    if (phoneErr) throw phoneErr;

    for (const row of phoneRows || []) {
      if (normalizeStr(row.patient) === newKey) continue;
      if (normalizeStr(row.patient) !== oldKey) continue;
      const { error } = await supabase.from('appointments').update({ patient: newTrim }).eq('id', row.id);
      if (error) throw error;
      updatedApptIds.add(row.id);
      appointments += 1;
    }
  }

  const { data: exactRows, error: apptErr } = await supabase
    .from('appointments')
    .update({ patient: newTrim })
    .eq('patient', oldTrim)
    .select('id');
  if (apptErr) throw apptErr;
  for (const row of exactRows || []) {
    if (!updatedApptIds.has(row.id)) appointments += 1;
  }

  const { data: auditRows, error: auditErr } = await supabase
    .from('audit_logs')
    .update({ patient_name: newTrim })
    .eq('patient_name', oldTrim)
    .select('id');
  if (!auditErr) auditLogs = auditRows?.length || 0;

  return { appointments, auditLogs };
}

/** Repara en BD citas activas cuyo nombre no coincide con el expediente (mismo teléfono). */
export async function repairStaleAppointmentNames(supabase, appointments = [], patients = []) {
  let repaired = 0;
  const activeStatuses = new Set(['Agendado', 'Llegó', 'En Sesión', 'Scheduled', 'Arrived', 'In Session']);
  for (const app of appointments) {
    if (!activeStatuses.has(app.check_in_status)) continue;
    const pat = resolvePatientForAppointment(app, patients);
    if (!pat || !isStaleAppointmentPatientName(app, pat)) continue;
    try {
      const result = await syncAppointmentPatientName(supabase, app.id, pat.patient);
      if (result.updated) repaired += 1;
    } catch {
      // no bloquear carga de agenda
    }
  }
  return repaired;
}

export function withCanonicalPatientName(app, patients) {
  const pat = resolvePatientForAppointment(app, patients);
  if (!pat || normalizeStr(pat.patient) === normalizeStr(app?.patient)) return app;
  return { ...app, patient: pat.patient };
}
