import { buildNotifyContent } from './appointmentNotify.js';
import { sendPatientTextMessage, textChannelLabel } from './clinicMessaging.js';
import { getResendApiKey, getResendFromAddress } from './resendConfig.js';
import {
  getSessionInstructionsLabel,
  getSessionInstructionsUrl,
  isAutoNotifyEnabled,
  resolveNotifyChannels,
} from './notifySettings.js';
import { localeForClinic } from './i18n.js';

const TERMINAL_STATUSES = new Set([
  'Finalizado',
  'Cancelado',
  'Devuelto',
  'No Asistió',
  'Falta Justificada',
  'Completed',
  'Cancelled',
]);

function parseAppointmentStart(fullDate, time) {
  const date = String(fullDate || '').trim();
  const t = String(time || '00:00').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const match = t.match(/^(\d{1,2}):(\d{2})/);
  if (!match) return null;
  const hh = String(match[1]).padStart(2, '0');
  const mm = match[2];
  const d = new Date(`${date}T${hh}:${mm}:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Daily cron window: send when hours-until-start is within
 * [reminderHours - 24, reminderHours] so a once-daily Hobby cron still works.
 */
export function isAppointmentInReminderWindow(app, reminderHours = 24, now = new Date()) {
  const start = parseAppointmentStart(app?.full_date, app?.time);
  if (!start) return false;
  const hoursUntil = (start.getTime() - now.getTime()) / (1000 * 60 * 60);
  const hours = Math.max(1, Number(reminderHours) || 24);
  return hoursUntil <= hours && hoursUntil > hours - 24;
}

async function sendReminderChannels({
  app,
  companyConfig,
  clinicName,
  locale,
}) {
  const { sendEmail, sendSms } = resolveNotifyChannels(companyConfig, 'reminder');
  const { subject, emailHtml, smsBody, whatsappBodyParams } = buildNotifyContent({
    locale,
    notifyType: 'reminder',
    patientName: app.patient,
    clinicName,
    clinicDisplayName: companyConfig.name,
    date: app.full_date,
    time: app.time,
    equipment: app.equipment,
    instructions: '',
    address: companyConfig.address,
    mapsUrl: companyConfig.maps_url,
    clinicPhone: companyConfig.phone,
    ticketMessage: companyConfig.ticket_message,
    emailTemplates: companyConfig,
    instructionsLabel: getSessionInstructionsLabel(companyConfig, locale),
    sessionInstructionsUrl: getSessionInstructionsUrl(companyConfig, clinicName),
    durationMins: app.duration || 60,
    bufferMins: app.buffer || 0,
    smsIntros: {
      reminder: companyConfig.notify_sms_reminder,
      booking: companyConfig.notify_sms_booking,
    },
  });

  const report = { email: 'skipped', sms: 'skipped' };

  if (sendEmail && app.email && app.prefers_email !== false) {
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
          to: [app.email],
          subject,
          html: emailHtml,
        }),
      });
      report.email = emailReq.ok ? 'sent' : `error:${(await emailReq.text().catch(() => '')).slice(0, 80)}`;
    }
  }

  if (sendSms && app.phone && app.prefers_sms !== false) {
    const result = await sendPatientTextMessage({
      clinicName,
      phone: app.phone,
      smsBody,
      whatsappBodyParams,
      notifyType: 'reminder',
      locale,
    });
    report.sms = result.ok ? 'sent' : (result.error || 'failed');
    report.textChannel = textChannelLabel(clinicName, locale);
  }

  return report;
}

export async function runAppointmentReminderCron({
  supabase,
  clinicName,
  companyConfig = {},
} = {}) {
  if (!supabase || !clinicName) {
    return { ok: false, error: 'missing_supabase' };
  }

  if (!isAutoNotifyEnabled(companyConfig, 'reminder')) {
    return { ok: true, skipped: true, reason: 'reminders_disabled', sent: 0 };
  }

  const channels = resolveNotifyChannels(companyConfig, 'reminder');
  if (!channels.sendEmail && !channels.sendSms) {
    return { ok: true, skipped: true, reason: 'channels_off', sent: 0 };
  }

  const locale = localeForClinic(clinicName);
  const reminderHours = Number(companyConfig.reminder_hours) || 24;
  const now = new Date();
  const lookAheadDays = Math.ceil(reminderHours / 24) + 1;
  const end = new Date(now.getTime() + lookAheadDays * 24 * 60 * 60 * 1000);
  const startDate = now.toISOString().slice(0, 10);
  const endDate = end.toISOString().slice(0, 10);

  const { data: rows, error } = await supabase
    .from('appointments')
    .select('id, patient, phone, email, time, full_date, equipment, duration, buffer, prefers_email, prefers_sms, check_in_status, reminder_sent_at')
    .gte('full_date', startDate)
    .lte('full_date', endDate)
    .is('reminder_sent_at', null)
    .limit(200);

  if (error) {
    if (/reminder_sent_at|column/i.test(error.message || '')) {
      return { ok: false, error: 'missing_reminder_sent_at_column', detail: error.message };
    }
    throw error;
  }

  const candidates = (rows || []).filter((app) => {
    if (TERMINAL_STATUSES.has(String(app.check_in_status || ''))) return false;
    return isAppointmentInReminderWindow(app, reminderHours, now);
  });

  let sent = 0;
  const failures = [];

  for (const app of candidates) {
    try {
      await sendReminderChannels({ app, companyConfig, clinicName, locale });
      const sentAt = new Date().toISOString();
      const { error: updErr } = await supabase
        .from('appointments')
        .update({ reminder_sent_at: sentAt })
        .eq('id', app.id);
      if (updErr) throw updErr;
      sent += 1;
    } catch (err) {
      failures.push({ id: app.id, error: err?.message || String(err) });
    }
  }

  return {
    ok: true,
    sent,
    candidates: candidates.length,
    failures,
    reminderHours,
  };
}
