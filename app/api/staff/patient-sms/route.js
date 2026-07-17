import { NextResponse } from 'next/server';
import { normalizeClinicId } from '../../../../lib/clinicRegistry.js';
import { readStaffSessionFromRequest } from '../../../../lib/staffSession.js';
import { getSupabaseAdmin } from '../../../../lib/supabaseAdmin.js';
import { listPatientSmsPresets, sendStaffPatientSms } from '../../../../lib/patientStaffSms.js';

const ERROR_MESSAGES = {
  custom_note_required: 'Add a short note for the custom message.',
  custom_note_blocked: 'That note uses wording or links not allowed for SMS.',
  invalid_phone: 'Invalid or missing phone number.',
  sms_failed: 'SMS could not be sent.',
  prefers_sms_off: 'Patient has SMS notifications turned off.',
  not_found: 'Appointment not found.',
};

export async function GET() {
  return NextResponse.json({
    presets: listPatientSmsPresets('en'),
    presetsEs: listPatientSmsPresets('es'),
    maxCustomChars: 120,
  });
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
    // email no existe en appointments (GDL/TX); el correo vive en patients.
    const { data: app, error } = await supabase
      .from('appointments')
      .select('id, patient, phone, time, full_date, equipment, prefers_sms, patient_id')
      .eq('id', appointmentId)
      .maybeSingle();

    if (error) throw error;
    if (!app) {
      return NextResponse.json({ ok: false, error: 'not_found', message: ERROR_MESSAGES.not_found }, { status: 404 });
    }

    let phone = app.phone;
    let prefersSms = app.prefers_sms;
    let patientName = app.patient;

    if (app.patient_id) {
      const { data: pat } = await supabase
        .from('patients')
        .select('*')
        .eq('id', app.patient_id)
        .maybeSingle();
      if (pat) {
        phone = phone || pat.Phone || pat.phone;
        if (prefersSms == null) prefersSms = pat.prefers_sms;
        patientName = patientName || pat.Name || pat.name || pat.patient;
      }
    }

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
