import { buildNotifyContent } from './appointmentNotify.js';
import { sendPatientTextMessage, textChannelLabel } from './clinicMessaging.js';
import { getResendApiKey, getResendFromAddress } from './resendConfig.js';
import {
  getSessionInstructionsLabel,
  getSessionInstructionsUrl,
  isAutoNotifyEnabled,
  resolveNotifyChannels,
  resolveSessionInstructions,
} from './notifySettings.js';
import { localeForClinic } from './i18n.js';

/**
 * Server-side appointment notify (cancel / reschedule after patient self-manage).
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

  const { sendEmail, sendSms } = resolveNotifyChannels(companyConfig, notifyType);
  if (!sendEmail && !sendSms) {
    return { skipped: true, reason: 'channels_off' };
  }

  const locale = localeForClinic(clinicName);
  const includeFirstSessionNotes = notifyType === 'first';
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

  if (sendEmail && appointment.email && appointment.prefers_email !== false) {
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
          to: [appointment.email],
          subject,
          html: emailHtml,
        }),
      });
      report.email = emailReq.ok
        ? 'sent'
        : `error:${(await emailReq.text().catch(() => '')).slice(0, 80)}`;
    }
  }

  if (sendSms && appointment.phone && appointment.prefers_sms !== false) {
    const result = await sendPatientTextMessage({
      clinicName,
      phone: appointment.phone,
      smsBody,
      whatsappBodyParams,
      notifyType,
      locale,
    });
    report.sms = result.ok ? 'sent' : (result.error || 'failed');
  }

  return { skipped: false, report };
}
