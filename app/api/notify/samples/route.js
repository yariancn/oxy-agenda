import { NextResponse } from 'next/server';
import { buildNotifyContent } from '../../../../lib/appointmentNotify.js';
import { mergeEmailTemplates } from '../../../../lib/emailTemplates.js';
import { getResendApiKey, getResendFromAddress } from '../../../../lib/resendConfig.js';
import { sendPatientTextMessage, sendTwilioSms, textChannelLabel } from '../../../../lib/clinicMessaging.js';
import { buildPosTicketSmsText } from '../../../../lib/posTicket.js';
import { sendMexicoSms } from '../../../../lib/smsMexico.js';
import { toE164Phone } from '../../../../lib/appointmentNotify.js';
import { dispatchStaffBookingAlert } from '../../../../lib/staffBookingAlert.js';
import {
  getSessionInstructionsLabel,
  getSessionInstructionsUrl,
  defaultSmsIntros,
  resolveSessionInstructions,
} from '../../../../lib/notifySettings.js';
import { localeForClinic, normalizeClinicId, isShenandoah, selectCompanyConfigForClinic } from '../../../../lib/clinicRegistry.js';
import { getSupabaseAdmin } from '../../../../lib/supabaseAdmin.js';

const SUPREME_PIN = '1234567890';

function pickSmsIntros(config = {}, locale = 'es') {
  const defaults = defaultSmsIntros(locale);
  return {
    first: config.notify_sms_first || defaults.first,
    booking: config.notify_sms_booking || defaults.booking,
    reschedule: config.notify_sms_reschedule || defaults.reschedule,
    cancel: config.notify_sms_cancel || defaults.cancel,
  };
}

function pickEmailTemplates(config = {}) {
  return {
    notify_subject_first: config.notify_subject_first,
    notify_body_first: config.notify_body_first,
    notify_subject_booking: config.notify_subject_booking,
    notify_body_booking: config.notify_body_booking,
    notify_subject_reschedule: config.notify_subject_reschedule,
    notify_body_reschedule: config.notify_body_reschedule,
    notify_subject_cancel: config.notify_subject_cancel,
    notify_body_cancel: config.notify_body_cancel,
    notify_extra_info: config.notify_extra_info,
  };
}

async function sendEmail({ clinicName, locale, to, subject, html }) {
  const resendKey = getResendApiKey();
  if (!resendKey) return { channel: 'email', ok: false, status: 'Falta RESEND_API_KEY' };
  const fromEmail = getResendFromAddress(clinicName);
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${resendKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from: fromEmail, to: [to], subject, html }),
  });
  if (res.ok) return { channel: 'email', ok: true, status: 'Enviado correctamente' };
  const errBody = await res.text().catch(() => '');
  return { channel: 'email', ok: false, status: `Error Resend: ${errBody.slice(0, 120)}` };
}

async function sendSms({ clinicName, locale, phone, smsBody, notifyType, whatsappBodyParams }) {
  const result = await sendPatientTextMessage({
    clinicName,
    phone,
    smsBody,
    whatsappBodyParams,
    notifyType,
    locale,
  });
  const channel = textChannelLabel(clinicName, locale);
  if (result.ok) return { channel, ok: true, status: 'Enviado correctamente' };
  return { channel, ok: false, status: result.error || 'SMS_FAILED' };
}

export async function POST(request) {
  try {
    const body = await request.json();
    const pin = String(body.pin || '').trim();
    const expectedPin = String(process.env.STAFF_SUPREME_PIN || SUPREME_PIN).trim();
    if (!pin || pin !== expectedPin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const clinicName = normalizeClinicId(body.clinic || 'Oxygengdl');
    const locale = body.locale === 'en' ? 'en' : localeForClinic(clinicName);
    const phone = String(body.phone || '').trim();
    const email = String(body.email || '').trim();
    const patientName = String(body.patientName || (locale === 'en' ? 'Test Patient' : 'Paciente Prueba')).trim();

    if (!phone && !email) {
      return NextResponse.json({ error: 'PHONE_OR_EMAIL_REQUIRED' }, { status: 400 });
    }

    const supabase = getSupabaseAdmin(clinicName);
    const { data: companyConfig } = await selectCompanyConfigForClinic(supabase, clinicName);
    const cfg = companyConfig || {};
    const emailTemplates = pickEmailTemplates(cfg);
    const smsIntros = pickSmsIntros(cfg, locale);
    const merged = mergeEmailTemplates(emailTemplates, locale);

    const sampleDate = body.date || '2026-07-15';
    const sampleTime = body.time || '10:00 AM';
    const sampleEquipment = body.equipment || 'Cámara 1';
    const instructions = resolveSessionInstructions(cfg, locale, {
      equipment: sampleEquipment,
      services: [],
      isFirstSession: true,
    });

    const baseNotify = {
      locale,
      patientName,
      clinicName,
      clinicDisplayName: cfg.name,
      date: sampleDate,
      time: sampleTime,
      equipment: sampleEquipment,
      address: cfg.address,
      mapsUrl: cfg.maps_url,
      clinicPhone: cfg.phone,
      ticketMessage: cfg.ticket_message,
      emailTemplates: merged,
      instructionsLabel: getSessionInstructionsLabel(cfg, locale),
      sessionInstructionsUrl: getSessionInstructionsUrl(cfg, clinicName),
      durationMins: 60,
      bufferMins: 30,
      smsIntros,
    };

    const types = ['first', 'booking', 'reschedule', 'cancel'];
    const results = [];

    for (const notifyType of types) {
      const includeInstructions = notifyType === 'first';
      const content = buildNotifyContent({
        ...baseNotify,
        notifyType,
        instructions: includeInstructions ? instructions : '',
      });

      const entry = { notifyType, email: null, sms: null };

      if (email) {
        entry.email = await sendEmail({
          clinicName,
          locale,
          to: email,
          subject: `[PRUEBA ${notifyType.toUpperCase()}] ${content.subject}`,
          html: content.emailHtml,
        });
      }

      if (phone) {
        entry.sms = await sendSms({
          clinicName,
          locale,
          phone,
          smsBody: `[PRUEBA] ${content.smsBody}`,
          notifyType,
          whatsappBodyParams: content.whatsappBodyParams,
        });
      }

      results.push(entry);
    }

    let staff = null;
    if (body.includeStaff !== false) {
      const staffCfg = {
        ...cfg,
        notify_staff_on_booking: true,
        staff_alert_phones: phone || cfg.staff_alert_phones || '',
        staff_alert_emails: email || cfg.staff_alert_emails || '',
      };
      staff = await dispatchStaffBookingAlert({
        companyConfig: staffCfg,
        staffRoster: [],
        clinicName,
        clinicDisplayName: cfg.name,
        patientName,
        date: sampleDate,
        time: sampleTime,
        equipment: sampleEquipment,
        locale,
        source: 'staff',
        promoterCode: '',
      });
    }

    let posReceipt = null;
    if (body.includePosReceipt !== false && phone) {
      const smsBody = buildPosTicketSmsText({
        receipt: {
          patient: patientName,
          phone,
          email,
          date: sampleDate,
          serviceName: sampleEquipment,
          sessions: 5,
          price: 5000,
          unitPrice: 1000,
          paymentMethod: locale === 'en' ? 'Card' : 'Tarjeta',
          operator: locale === 'en' ? 'Reception' : 'Recepción',
          ticketNumber: 'PRUEBA-001',
          ticketNotes: locale === 'en' ? 'Sample POS receipt (test).' : 'Ticket de venta de prueba.',
        },
        companyConfig: cfg,
        clinicName,
        locale,
      });

      let smsResult;
      if (isShenandoah(clinicName)) {
        const to = toE164Phone(phone, clinicName);
        smsResult = await sendTwilioSms({ to, body: `[PRUEBA TICKET] ${smsBody}` });
      } else {
        smsResult = await sendMexicoSms({ to: phone, body: `[PRUEBA TICKET] ${smsBody}`, clinicName });
      }
      posReceipt = {
        ok: smsResult.ok,
        status: smsResult.ok ? 'Enviado correctamente' : (smsResult.error || 'SMS_FAILED'),
      };
    }

    return NextResponse.json({
      success: true,
      clinic: clinicName,
      phone: phone || null,
      email: email || null,
      results,
      staff,
      posReceipt,
    });
  } catch (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
