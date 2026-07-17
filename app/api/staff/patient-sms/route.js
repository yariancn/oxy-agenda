import { NextResponse } from 'next/server';
import { normalizeClinicId } from '../../../../lib/clinicRegistry.js';
import { readStaffSessionFromRequest } from '../../../../lib/staffSession.js';
import { getSupabaseAdmin } from '../../../../lib/supabaseAdmin.js';
import { listPatientSmsPresets, sendStaffPatientSms } from '../../../../lib/patientStaffSms.js';
import { selectWithColumnFallback } from '../../../../lib/supabaseSelectSafe.js';
import { digitsOnly } from '../../../../lib/ensurePatient.js';

const ERROR_MESSAGES = {
  custom_note_required: 'Add a short note for the custom message.',
  custom_note_blocked: 'That note uses wording or links not allowed for SMS.',
  invalid_phone: 'Invalid or missing phone number.',
  sms_failed: 'SMS could not be sent.',
  prefers_sms_off: 'Patient has SMS notifications turned off.',
  not_found: 'Appointment not found.',
};

/** Core appointment columns present on GDL + TX (verified: no email/prefers_* on GDL). */
const APPOINTMENT_SELECT_COLS = [
  'id',
  'patient',
  'phone',
  'time',
  'full_date',
  'equipment',
  'patient_id',
];

export async function GET() {
  return NextResponse.json({
    presets: listPatientSmsPresets('en'),
    presetsEs: listPatientSmsPresets('es'),
    maxCustomChars: 120,
  });
}

async function loadPatientPreferSms(supabase, { patientId, phone }) {
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

export async function POST(request) {
  try {
    const user = readStaffSessionFromRequest(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const clinicName = normalizeClinicId(body.clinic);
    const appointmentId = body.appointmentId;
    const preset = String(body.preset || 'reminder').trim();
    const customNote = body.customNote || '';
    const locale = body.locale === 'en' ? 'en' : 'es';

    if (!appointmentId) {
      return NextResponse.json({ error: 'appointmentId required' }, { status: 400 });
    }

    const supabase = getSupabaseAdmin(clinicName);
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
      return NextResponse.json({ ok: false, error: 'not_found', message: ERROR_MESSAGES.not_found }, { status: 404 });
    }

    const fromPatient = await loadPatientPreferSms(supabase, {
      patientId: app.patient_id,
      phone: app.phone,
    });

    let phone = app.phone || fromPatient.phone;
    // prefers_sms vive en patients (no en appointments en GDL).
    let prefersSms = fromPatient.prefersSms;
    const patientName = app.patient || fromPatient.patientName;

    if (prefersSms === false) {
      return NextResponse.json({
        ok: false,
        error: 'prefers_sms_off',
        message: ERROR_MESSAGES.prefers_sms_off,
      }, { status: 400 });
    }

    const { data: config } = await supabase
      .from('company_config')
      .select('name, phone')
      .eq('clinic', clinicName)
      .maybeSingle();

    const result = await sendStaffPatientSms({
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
      return NextResponse.json({
        ok: false,
        error: result.error,
        message: ERROR_MESSAGES[result.error] || result.error,
      }, { status: 400 });
    }

    await supabase.from('audit_logs').insert([{
      appointment_id: app.id,
      patient_name: patientName || app.patient,
      action: locale === 'en' ? 'Staff SMS' : 'SMS staff',
      changed_by: user.name || user.email || 'staff',
      details: `${preset}: ${result.body}`.slice(0, 500),
    }]).catch(() => null);

    return NextResponse.json({
      ok: true,
      body: result.body,
      preset: result.preset,
      channel: result.channel,
    });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
