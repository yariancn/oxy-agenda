import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '../../../../lib/supabaseAdmin.js';
import {
  buildConfirmationReplyReceiptSms,
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
import { sendPatientTextMessage, sendTwilioSms } from '../../../../lib/clinicMessaging.js';
import { buildPosTicketSmsText } from '../../../../lib/posTicket.js';
import { saleTxIsoDate } from '../../../../lib/salesReportExport.js';
import { sendMexicoSms } from '../../../../lib/smsMexico.js';
import { toE164Phone } from '../../../../lib/appointmentNotify.js';

const SUPREME_PIN = '1234567890';

/**
 * PIN-protected: reset a confirmation (clear false NO) and optionally send SMS.
 * Messaging QA before/after copy changes.
 *
 * POST { pin, clinic, patient?, date?, appointmentId?, phone?, send?: true }
 * POST { pin, clinic, receiptSample: true, reply?: 'confirmed'|'declined', phone?, date?, time? }
 * POST { pin, clinic, posTicketToday: true, patient?, phone?, date? }
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
    const locale = localeForClinic(clinicName);

    // Ticket POS del día (última venta del paciente) → SMS
    if (body.posTicketToday === true) {
      const supabase = getSupabaseAdmin(clinicName);
      const patientQ = String(body.patient || '').trim();
      const phoneQ = String(body.phone || '').replace(/\D/g, '').slice(-10);
      const day = String(body.date || new Date().toISOString().slice(0, 10)).slice(0, 10);
      if (!patientQ && phoneQ.length !== 10) {
        return NextResponse.json({ ok: false, error: 'patient_or_phone_required' }, { status: 400 });
      }

      let pq = supabase
        .from('patients')
        .select('id, name, phone, email, package_history')
        .limit(10);
      if (patientQ) pq = pq.ilike('name', `%${patientQ}%`);
      if (phoneQ.length === 10) pq = pq.ilike('phone', `%${phoneQ}%`);
      const { data: pats, error: patErr } = await pq;
      if (patErr) throw patErr;
      if (!pats?.length) {
        return NextResponse.json({ ok: false, error: 'patient_not_found' }, { status: 404 });
      }
      const patient = pats[0];
      const hist = Array.isArray(patient.package_history) ? patient.package_history : [];
      const todaySales = hist
        .filter((tx) => saleTxIsoDate(tx) === day)
        .sort((a, b) => {
          const ta = Number(a.id) || Date.parse(a.createdAt || a.created_at || a.date || 0) || 0;
          const tb = Number(b.id) || Date.parse(b.createdAt || b.created_at || b.date || 0) || 0;
          return tb - ta;
        });
      if (!todaySales.length) {
        return NextResponse.json({
          ok: false,
          error: 'no_sale_today',
          patient: { id: patient.id, name: patient.name, phone: patient.phone },
          day,
          historyCount: hist.length,
        }, { status: 404 });
      }

      const sale = todaySales[0];
      const toPhone = String(body.overridePhone || patient.phone || phoneQ).trim();
      const cfgRes = await selectCompanyConfigForClinic(supabase, clinicName);
      const cfg = cfgRes.data || {};
      const smsBody = buildPosTicketSmsText({
        receipt: {
          patient: patient.name,
          phone: toPhone,
          email: patient.email,
          date: day,
          serviceName: sale.serviceName || sale.service || sale.equipment || sale.package || '',
          sessions: sale.sessions ?? sale.qty ?? 1,
          price: sale.price ?? sale.total ?? sale.amount ?? 0,
          unitPrice: sale.unitPrice ?? sale.unit_price,
          paymentMethod: sale.paymentMethod || sale.payment_method || sale.method || '',
          paymentSplits: sale.paymentSplits || sale.payment_splits,
          operator: sale.operator || sale.staff || sale.soldBy || '',
          ticketNumber: sale.ticketNumber || sale.ticket_number || sale.id,
          ticketNotes: sale.ticketNotes || sale.notes || '',
        },
        companyConfig: cfg,
        clinicName,
        locale,
      });

      if (body.send === false) {
        return NextResponse.json({
          ok: true,
          dryRun: true,
          smsPreview: smsBody,
          sale,
          patient: { id: patient.id, name: patient.name, phone: toPhone },
        });
      }

      let sendResult;
      if (isShenandoah(clinicName)) {
        const to = toE164Phone(toPhone, clinicName);
        sendResult = to
          ? await sendTwilioSms({ to, body: smsBody })
          : { ok: false, error: 'INVALID_PHONE' };
      } else {
        sendResult = await sendMexicoSms({ to: toPhone, body: smsBody, clinicName });
      }

      return NextResponse.json({
        ok: sendResult?.ok === true,
        smsPreview: smsBody,
        sendResult,
        saleSummary: {
          id: sale.id,
          sessions: sale.sessions ?? sale.qty,
          price: sale.price ?? sale.total ?? sale.amount,
          service: sale.serviceName || sale.service || sale.package,
        },
        patient: { id: patient.id, name: patient.name, phone: toPhone },
      });
    }

    // Solo acuse SI/NO (sin resetear cita) — para QA de copy
    if (body.receiptSample === true) {
      const reply = body.reply === 'confirmed' ? 'confirmed' : 'declined';
      const phone = String(body.phone || '3328332686').trim();
      const smsBody = buildConfirmationReplyReceiptSms({
        reply,
        patientName: body.patient || 'Yarian',
        fullDate: body.date || '2026-10-23',
        time: body.time || '07:30 AM',
        locale,
        clinicPhone: body.clinicPhone || GDL_CONFIRMATION_STAFF_PHONE,
      });
      if (body.send === false) {
        return NextResponse.json({ ok: true, dryRun: true, reply, smsPreview: smsBody });
      }
      const sendResult = await sendPatientTextMessage({
        clinicName,
        phone,
        smsBody,
        notifyType: 'confirmation',
        locale,
      });
      return NextResponse.json({
        ok: sendResult?.ok === true,
        reply,
        smsPreview: smsBody,
        sendResult,
      });
    }

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
    let result = null;
    if (shouldSend) {
      result = await sendConfirmationSmsForAppointment({
        supabase,
        appointmentId,
        clinicName,
        force: true,
        resend: true,
        resetReply: true,
      });
    }

    const { data: appt } = await supabase
      .from('appointments')
      .select('id, patient, phone, full_date, time, equipment, check_in_status, confirmation_status, confirmation_code, confirmation_sent_at, confirmation_enabled')
      .eq('id', appointmentId)
      .maybeSingle();

    const cfgRes = await selectCompanyConfigForClinic(supabase, clinicName);
    const cfg = cfgRes.data || {};
    const timezone = getClinicTimezone(clinicName);
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
      ok: result?.ok === true,
      error: result?.error || null,
      appointment: appt,
      smsPreview: preview,
      sendResult: result,
      note: 'Open SI/NO on the phone: first screen is read-only; tap Confirmar to apply.',
    });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
