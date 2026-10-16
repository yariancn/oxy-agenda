import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '../../../../lib/supabaseAdmin.js';
import {
  buildConfirmationSms,
  DEFAULT_GDL_CONFIRMATION_SMS,
  defaultConfirmationHoursBefore,
  ensureAppointmentConfirmationCode,
  GDL_CONFIRMATION_STAFF_PHONE,
  sendConfirmationSmsForAppointment,
} from '../../../../lib/appointmentConfirmation.js';
import {
  getClinicTimezone,
  isShenandoah,
  localeForClinic,
  normalizeClinicId,
  selectCompanyConfigForClinic,
} from '../../../../lib/clinicRegistry.js';

const SUPREME_PIN = '1234567890';

/**
 * PIN-protected: reset a confirmation (clear false NO) and send the live SMS.
 * For messaging QA before/after copy changes — not for routine patient ops.
 *
 * POST { pin, clinic, patient?, date?, appointmentId?, phone?, send?: true }
 */
export async function POST(request) {
  try {
    const body = await request.json();
    const pin = String(body.pin || '').trim();
    const expectedPin = String(process.env.STAFF_SUPREME_PIN || SUPREME_PIN).trim();
    if (!pin || pin !== expectedPin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const clinicName = normalizeClinicId(body.clinic || 'Oxygengdl');
    const supabase = getSupabaseAdmin(clinicName);
    const date = String(body.date || '').trim();
    const patientQ = String(body.patient || '').trim();
    let appointmentId = body.appointmentId || null;

    if (!appointmentId) {
      if (!date || !patientQ) {
        return NextResponse.json({
          error: 'appointmentId_or_patient_date_required',
          message: 'Pass appointmentId, or patient + date (YYYY-MM-DD).',
        }, { status: 400 });
      }
      let q = supabase
        .from('appointments')
        .select('id, patient, phone, full_date, time, equipment, check_in_status, confirmation_status, confirmation_code')
        .eq('full_date', date)
        .ilike('patient', `%${patientQ}%`)
        .order('time', { ascending: true })
        .limit(10);
      if (body.phone) {
        const digits = String(body.phone).replace(/\D/g, '').slice(-10);
        if (digits.length === 10) q = q.ilike('phone', `%${digits}%`);
      }
      const { data: matches, error } = await q;
      if (error) throw error;
      if (!matches?.length) {
        return NextResponse.json({ ok: false, error: 'not_found', matches: [] }, { status: 404 });
      }
      if (matches.length > 1 && !body.pickFirst) {
        return NextResponse.json({
          ok: false,
          error: 'multiple_matches',
          matches,
          message: 'Pass appointmentId or pickFirst:true',
        }, { status: 409 });
      }
      appointmentId = matches[0].id;
    }

    const shouldSend = body.send !== false;
    const result = await sendConfirmationSmsForAppointment({
      supabase,
      appointmentId,
      clinicName,
      force: true,
      resend: true,
      resetReply: true,
    });

    const { data: appt } = await supabase
      .from('appointments')
      .select('id, patient, phone, full_date, time, equipment, check_in_status, confirmation_status, confirmation_code, confirmation_sent_at, confirmation_enabled')
      .eq('id', appointmentId)
      .maybeSingle();

    const cfgRes = await selectCompanyConfigForClinic(supabase, clinicName);
    const cfg = cfgRes.data || {};
    const timezone = getClinicTimezone(clinicName);
    const locale = localeForClinic(clinicName);
    const shortCode = appt?.confirmation_code
      || await ensureAppointmentConfirmationCode(supabase, appointmentId, '');
    const preview = buildConfirmationSms({
      patientName: appt?.patient || '',
      time: appt?.time || '',
      clinicDisplayName: cfg.name || (isShenandoah(clinicName) ? 'OxyHyperbaric' : 'OXYGENGDL'),
      hoursBefore: Number(cfg.confirmation_hours_before) || defaultConfirmationHoursBefore(clinicName),
      noReplyHours: Number(cfg.confirmation_no_reply_hours) || 1,
      customBody: cfg.confirmation_sms_body || (isShenandoah(clinicName) ? '' : DEFAULT_GDL_CONFIRMATION_SMS),
      locale,
      clinicPhone: cfg.phone || (isShenandoah(clinicName) ? '7135913379' : GDL_CONFIRMATION_STAFF_PHONE),
      fullDate: appt?.full_date || date,
      timezone,
      appointmentId,
      clinicName,
      shortCode,
    });

    if (!shouldSend) {
      return NextResponse.json({
        ok: true,
        dryRun: true,
        appointment: appt,
        smsPreview: preview,
        sendResult: null,
      });
    }

    return NextResponse.json({
      ok: result.ok,
      error: result.error || null,
      appointment: appt,
      smsPreview: preview,
      sendResult: result,
      note: 'Open SI/NO on the phone: first screen is read-only; tap Confirmar to apply.',
    });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
