/**
 * Best-effort audit_logs insert for staff + public/server flows.
 * Never throws — callers should not fail the main action if audit fails.
 */

export async function insertAuditLog(supabase, {
  appointmentId = null,
  patientName,
  action,
  changedBy = 'Sistema',
  details = '',
} = {}) {
  if (!supabase || !patientName || !action) {
    return { ok: false, skipped: true };
  }

  try {
    const { error } = await supabase.from('audit_logs').insert([{
      appointment_id: appointmentId || null,
      patient_name: String(patientName).trim(),
      action: String(action).trim(),
      changed_by: String(changedBy || 'Sistema').trim(),
      details: String(details || '').slice(0, 1000),
    }]);
    if (error) {
      console.warn('[audit_logs] insert skipped:', error.message);
      return { ok: false, error };
    }
    return { ok: true };
  } catch (err) {
    console.warn('[audit_logs] insert failed:', err?.message || err);
    return { ok: false, error: err };
  }
}

export function publicBookingAuditLabels(locale = 'es') {
  const es = locale !== 'en';
  return {
    action: es ? 'RESERVA ONLINE' : 'ONLINE BOOKING',
    changedBy: es ? 'Paciente (portal)' : 'Patient (portal)',
  };
}

export function publicCancelAuditLabels(locale = 'es', source = 'manage') {
  const es = locale !== 'en';
  if (source === 'sms_no') {
    return {
      action: es ? 'CANCELACIÓN SMS (NO)' : 'SMS CANCEL (NO)',
      changedBy: es ? 'Paciente (SMS)' : 'Patient (SMS)',
    };
  }
  return {
    action: es ? 'CANCELACIÓN ONLINE' : 'ONLINE CANCEL',
    changedBy: es ? 'Paciente (portal)' : 'Patient (portal)',
  };
}

export function publicRescheduleAuditLabels(locale = 'es') {
  const es = locale !== 'en';
  return {
    action: es ? 'REPROGRAMACIÓN ONLINE' : 'ONLINE RESCHEDULE',
    changedBy: es ? 'Paciente (portal)' : 'Patient (portal)',
  };
}
