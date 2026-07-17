import { selectWithColumnFallback } from './supabaseSelectSafe.js';
import { digitsOnly } from './ensurePatient.js';
import { listPatientSmsPresets, sendStaffPatientSms } from './patientStaffSms.js';

export { listPatientSmsPresets };

const ERROR_MESSAGES = {
  custom_note_required: 'Add a short note for the custom message.',
  custom_note_blocked: 'That note uses wording or links not allowed for SMS.',
  invalid_phone: 'Invalid or missing phone number.',
  sms_failed: 'SMS could not be sent.',
  prefers_sms_off: 'Patient has SMS notifications turned off.',
  not_found: 'Appointment not found.',
};

/** Core appointment columns present on GDL + TX (no email/prefers_* on GDL). */
export const APPOINTMENT_SELECT_COLS = [
  'id',
  'patient',
  'phone',
  'time',
  'full_date',
  'equipment',
  'patient_id',
];

export async function loadPatientPreferSms(supabase, { patientId, phone }) {
  if (patientId) {
    const { data: pat } = await supabase
      .from('patients')
      .select('*')
      .eq('id', patientId)
      .maybeSingle();
    if (pat) {
      return {
        phone: pat.Phone || pat.phone || '',
        prefersSms: pat.prefers_sms,
        patientName: pat.Name || pat.name || pat.patient || '',
        found: true,
      };
    }
  }

  const last10 = digitsOnly(phone).slice(-10);
  if (last10.length === 10) {
    for (const col of ['Phone', 'phone']) {
      const { data: rows, error } = await supabase
        .from('patients')
        .select('*')
        .ilike(col, `%${last10}%`)
        .limit(20);
      if (error) continue;
      const match = (rows || []).find(
        (row) => digitsOnly(row.Phone || row.phone).slice(-10) === last10,
      );
      if (match) {
        return {
          phone: match.Phone || match.phone || '',
          prefersSms: match.prefers_sms,
          patientName: match.Name || match.name || match.patient || '',
          found: true,
        };
      }
    }
  }

  return { phone: '', prefersSms: undefined, patientName: '', found: false };
}

/**
 * Core staff SMS flow. Injectable deps for verification without live SMS/DB.
 * @returns {{ status: number, body: object }}
 */
export async function runStaffPatientSms({
  supabase,
  user,
  clinicName,
  appointmentId,
  preset = 'reminder',
  customNote = '',
  locale = 'es',
  sendSms = sendStaffPatientSms,
}) {
  if (!appointmentId) {
    return { status: 400, body: { error: 'appointmentId required' } };
  }

  const { data: app, error } = await selectWithColumnFallback(
    (cols) => supabase
      .from('appointments')
      .select(cols)
      .eq('id', appointmentId)
      .maybeSingle(),
    APPOINTMENT_SELECT_COLS,
  );

  if (error) throw error;
  if (!app) {
    return {
      status: 404,
      body: { ok: false, error: 'not_found', message: ERROR_MESSAGES.not_found },
    };
  }

  const fromPatient = await loadPatientPreferSms(supabase, {
    patientId: app.patient_id,
    phone: app.phone,
  });

  const phone = app.phone || fromPatient.phone;
  const prefersSms = fromPatient.prefersSms;
  const patientName = app.patient || fromPatient.patientName;

  if (prefersSms === false) {
    return {
      status: 400,
      body: {
        ok: false,
        error: 'prefers_sms_off',
        message: ERROR_MESSAGES.prefers_sms_off,
      },
    };
  }

  const { data: config } = await supabase
    .from('company_config')
    .select('name, phone')
    .eq('clinic', clinicName)
    .maybeSingle();

  const result = await sendSms({
    clinicName,
    phone,
    locale,
    preset,
    patientName,
    clinicDisplayName: config?.name || clinicName,
    date: app.full_date,
    time: app.time,
    equipment: app.equipment,
    clinicPhone: config?.phone || '',
    customNote,
  });

  if (!result.ok) {
    return {
      status: 400,
      body: {
        ok: false,
        error: result.error,
        message: ERROR_MESSAGES[result.error] || result.error,
      },
    };
  }

  // Audit is best-effort. Never fail after SMS already sent.
  // Await the builder result — do not chain .catch() (Supabase builders have no .catch).
  const { error: auditError } = await supabase.from('audit_logs').insert([{
    appointment_id: app.id,
    patient_name: patientName || app.patient,
    action: locale === 'en' ? 'Staff SMS' : 'SMS staff',
    changed_by: user?.name || user?.email || 'staff',
    details: `${preset}: ${result.body}`.slice(0, 500),
  }]);
  if (auditError) {
    console.warn('[patient-sms] audit_logs insert skipped:', auditError.message);
  }

  return {
    status: 200,
    body: {
      ok: true,
      body: result.body,
      preset: result.preset,
      channel: result.channel,
    },
  };
}
