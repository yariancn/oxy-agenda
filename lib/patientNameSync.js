import { digitsOnly, normalizeStr, resolvePatientForAppointment } from './ensurePatient.js';

/**
 * Las citas guardan `patient` como texto. Al renombrar un expediente hay que
 * propagar el nombre o la agenda y la bitácora quedan desincronizadas.
 */

/** Nombre usable en UI/BD — vacío o «Sin Nombre» no deben pisar un nombre real. */
export function usablePatientDisplayName(value) {
  const n = String(value || '').trim();
  if (!n) return '';
  if (normalizeStr(n) === 'sin nombre') return '';
  return n;
}

export function isStaleAppointmentPatientName(app, patient) {
  if (!app || !patient) return false;
  const chartName = usablePatientDisplayName(patient.patient);
  const appName = usablePatientDisplayName(app.patient);
  if (!chartName) return false;
  if (!appName) return true;
  return normalizeStr(appName) !== normalizeStr(chartName);
}

export async function syncAppointmentPatientName(supabase, appointmentId, canonicalName) {
  const name = usablePatientDisplayName(canonicalName);
  if (!appointmentId || !name) return { updated: false };
  const { error } = await supabase.from('appointments').update({ patient: name }).eq('id', appointmentId);
  if (error) throw error;
  return { updated: true };
}

export async function renamePatientAcrossClinic(supabase, { oldName, newName, phone } = {}) {
  const oldTrim = String(oldName || '').trim();
  const newTrim = usablePatientDisplayName(newName);
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

/**
 * Display name for calendar: never blank out a real appointment name with an empty chart.
 * Still fills blank appointments from a usable chart name (rename / orphan link).
 */
export function withCanonicalPatientName(app, patients) {
  const appName = usablePatientDisplayName(app?.patient);
  const pat = resolvePatientForAppointment(app, patients);
  const chartName = usablePatientDisplayName(pat?.patient);

  if (chartName && normalizeStr(chartName) !== normalizeStr(appName)) {
    return { ...app, patient: chartName };
  }
  if (!appName && chartName) {
    return { ...app, patient: chartName };
  }
  // Keep original text (even if only whitespace) so we don't invent «Sin Nombre» mid-render.
  return app;
}

/**
 * Heal blank appointment.patient rows from linked charts, and blank chart names from appointments.
 * Safe to run once after load; does not slow the initial agenda paint.
 */
export async function repairBlankPatientNames(supabase, {
  appointments = [],
  patients = [],
} = {}) {
  const patientById = new Map((patients || []).map((p) => [String(p.id), p]));
  let appointmentsFixed = 0;
  let chartsFixed = 0;

  for (const app of appointments || []) {
    if (usablePatientDisplayName(app.patient)) continue;
    const pid = app.patient_id ?? app.patientId;
    if (pid == null || String(pid).trim() === '') continue;
    const pat = patientById.get(String(pid));
    const chartName = usablePatientDisplayName(pat?.patient);
    if (!chartName) continue;
    try {
      const result = await syncAppointmentPatientName(supabase, app.id, chartName);
      if (result.updated) {
        appointmentsFixed += 1;
        app.patient = chartName;
      }
    } catch {
      /* ignore */
    }
  }

  // Charts with empty Name but appointments that still have the name (e.g. after bad overwrite).
  const nameVotes = new Map();
  for (const app of appointments || []) {
    const pid = app.patient_id ?? app.patientId;
    if (pid == null || String(pid).trim() === '') continue;
    const appName = usablePatientDisplayName(app.patient);
    if (!appName) continue;
    const id = String(pid);
    if (!nameVotes.has(id)) nameVotes.set(id, new Map());
    const votes = nameVotes.get(id);
    votes.set(appName, (votes.get(appName) || 0) + 1);
  }

  for (const [id, votes] of nameVotes) {
    const pat = patientById.get(id);
    if (!pat || usablePatientDisplayName(pat.patient)) continue;
    const best = [...votes.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
    if (!best) continue;
    let updated = false;
    for (const schema of [
      { name: 'Name' },
      { name: 'name' },
    ]) {
      const { error } = await supabase.from('patients').update({ [schema.name]: best }).eq('id', id);
      if (!error) {
        updated = true;
        break;
      }
      if (!/column|schema cache/i.test(error.message || '')) break;
    }
    if (updated) {
      chartsFixed += 1;
      pat.patient = best;
    }
  }

  return { appointmentsFixed, chartsFixed };
}
