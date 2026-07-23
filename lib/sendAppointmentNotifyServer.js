import { buildNotifyContent } from './appointmentNotify.js';
import { sendPatientTextMessage, textChannelLabel } from './clinicMessaging.js';
import { getResendApiKey, getResendFromAddress } from './resendConfig.js';
import {
  getSessionInstructionsLabel,
  getSessionInstructionsUrl,
  isAutoNotifyEnabled,
  resolveNotifyChannelsForPatient,
  resolveSessionInstructions,
} from './notifySettings.js';
import { localeForClinic } from './i18n.js';
import { getSupabaseAdmin } from './supabaseAdmin.js';

async function loadPatientNotifyPrefs(clinicName, appointment) {
  const patientId = appointment?.patient_id;
  if (!patientId) {
    return {
      prefers_email: appointment?.prefers_email !== false,
      prefers_sms: appointment?.prefers_sms === true,
      email: appointment?.email || '',
      phone: appointment?.phone || '',
    };
  }
  try {
    const sb = getSupabaseAdmin(clinicName);
    const { data } = await sb
      .from('patients')
      .select('*')
      .eq('id', patientId)
      .maybeSingle();
    if (!data) {
      return {
        prefers_email: true,
        prefers_sms: false,
        email: appointment?.email || '',
        phone: appointment?.phone || '',
      };
    }
    return {
      prefers_email: data.prefers_email !== false,
      prefers_sms: data.prefers_sms === true,
      email: data.email || data.Email || appointment?.email || '',
      phone: data.phone || data.Phone || appointment?.phone || '',
    };
  } catch {
    return {
      prefers_email: true,
      prefers_sms: false,
      email: appointment?.email || '',
      phone: appointment?.phone || '',
    };
  }
}

/**
 * Server-side appointment notify (cancel / reschedule after patient self-manage).
 * Channels follow the patient chart prefs — not appointment-level prefers_*.
 */
export async function sendAppointmentNotifyServer({
  appointment,
  companyConfig = {},
  clinicName,
  notifyType = 'booking',
  services = [],
} = {}) {
  if (!appointment || !clinicName) {
    return { skipped: true, reason: 'missing_appointment' };
  }
  if (!isAutoNotifyEnabled(companyConfig, notifyType)) {
    return { skipped: true, reason: 'notify_disabled' };
  }

  const patientPrefs = await loadPatientNotifyPrefs(clinicName, appointment);
  const { sendEmail, sendSms } = resolveNotifyChannelsForPatient(companyConfig, notifyType, {
    prefers_email: patientPrefs.prefers_email,
    prefers_sms: patientPrefs.prefers_sms,
  });
  if (!sendEmail && !sendSms) {
    return { skipped: true, reason: 'channels_off' };
  }

  const locale = localeForClinic(clinicName);
  const includeFirstSessionNotes = notifyType === 'first';
  const notifyEmail = patientPrefs.email || appointment.email;
  const notifyPhone = patientPrefs.phone || appointment.phone;
  const { subject, emailHtml, smsBody, whatsappBodyParams } = buildNotifyContent({
    locale,
    notifyType,
    patientName: appointment.patient,
    clinicName,
    clinicDisplayName: companyConfig.name,
    date: appointment.full_date,
    time: appointment.time,
    equipment: appointment.equipment,
    instructions: resolveSessionInstructions(companyConfig, locale, {
      equipment: appointment.equipment,
      services,
      isFirstSession: includeFirstSessionNotes,
    }),
    address: companyConfig.address,
    mapsUrl: companyConfig.maps_url,
    clinicPhone: companyConfig.phone,
    ticketMessage: companyConfig.ticket_message,
    emailTemplates: companyConfig,
    instructionsLabel: getSessionInstructionsLabel(companyConfig, locale),
    sessionInstructionsUrl: getSessionInstructionsUrl(companyConfig, clinicName),
    durationMins: appointment.duration || 60,
    bufferMins: appointment.buffer || 0,
    smsIntros: {
      first: companyConfig.notify_sms_first,
      booking: companyConfig.notify_sms_booking,
      reschedule: companyConfig.notify_sms_reschedule,
      cancel: companyConfig.notify_sms_cancel,
      reminder: companyConfig.notify_sms_reminder,
    },
    appointmentId: appointment.id,
    cancelLimitHours: Number(companyConfig.cancel_limit_hours) || 24,
  });

  const report = { email: 'skipped', sms: 'skipped', textChannel: textChannelLabel(clinicName, locale) };

  if (sendEmail && notifyEmail) {
    const resendKey = getResendApiKey();
    if (!resendKey) {
      report.email = 'missing_resend';
    } else {
      const emailReq = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${resendKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: getResendFromAddress(clinicName),
          to: [notifyEmail],
          subject,
          html: emailHtml,
        }),
      });
      report.email = emailReq.ok
        ? 'sent'
        : `error:${(await emailReq.text().catch(() => '')).slice(0, 80)}`;
    }
  }

  if (sendSms && notifyPhone) {
    const result = await sendPatientTextMessage({
      clinicName,
      phone: notifyPhone,
      smsBody,
      whatsappBodyParams,
      notifyType,
      locale,
    });
    report.sms = result.ok ? 'sent' : (result.error || 'failed');
  }

  return { skipped: false, report };
}
