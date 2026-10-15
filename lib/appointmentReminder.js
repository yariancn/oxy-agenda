import { buildNotifyContent } from './appointmentNotify.js';
import { appointmentStartMs } from './appointmentConfirmation.js';
import { sendPatientTextMessage, textChannelLabel } from './clinicMessaging.js';
import { getClinicTimezone, normalizeClinicId } from './clinicRegistry.js';
import { getResendApiKey, getResendFromAddress } from './resendConfig.js';
import {
  getSessionInstructionsLabel,
  getSessionInstructionsUrl,
  isAutoNotifyEnabled,
  resolveNotifyChannelsForPatient,
  resolveReminderHours,
} from './notifySettings.js';
import { localeForClinic } from './i18n.js';
import { patientHasSmsOptOut } from './smsOptOut.js';
import { selectWithColumnFallback } from './supabaseSelectSafe.js';

const TERMINAL_STATUSES = new Set([
  'Finalizado',
  'Cancelado',
  'Pendiente cancelación',
  'Devuelto',
  'No Asistió',
  'Falta Justificada',
  'Completed',
  'Cancelled',
]);

/**
 * Daily Hobby cron (~06:00 clinic): cover the full day + next morning.
 * Uses clinic timezone + AM/PM-aware start (same as confirmation SMS).
 */
export function isAppointmentInReminderWindow(
  app,
  reminderHours = 24,
  now = new Date(),
  timezone = 'America/Mexico_City',
) {
  const startMs = appointmentStartMs(app?.full_date, app?.time, timezone);
  if (!startMs) return false;
  const nowMs = now instanceof Date ? now.getTime() : Number(now);
  if (!Number.isFinite(nowMs)) return false;
  const hoursUntil = (startMs - nowMs) / (1000 * 60 * 60);
  const horizon = Math.max(Number(reminderHours) || 24, 24) + 12;
  return hoursUntil > 0 && hoursUntil <= horizon;
}

async function enrichAppsFromPatients(supabase, apps = []) {
  const patientIds = [...new Set(apps.map((a) => a.patient_id).filter(Boolean))];
  if (patientIds.length === 0) {
    return apps.map((app) => ({
      ...app,
      prefers_email: app.prefers_email !== false,
      prefers_sms: app.prefers_sms === true,
      prefers_sms_reminder: true,
      patientNotes: app.notes || '',
    }));
  }

  const { data: pats } = await selectWithColumnFallback(
    (cols) => supabase.from('patients').select(cols).in('id', patientIds),
    ['id', 'Phone', 'phone', 'Email', 'email', 'notes', 'Notes', 'prefers_email', 'prefers_sms', 'prefers_sms_reminder'],
  );

  const byId = new Map((pats || []).map((p) => [String(p.id), p]));
  return apps.map((app) => {
    const pat = app.patient_id ? byId.get(String(app.patient_id)) : null;
    if (!pat) {
      return {
        ...app,
        prefers_email: app.prefers_email !== false,
        prefers_sms: app.prefers_sms === true,
        prefers_sms_reminder: true,
        patientNotes: app.notes || '',
      };
    }
    return {
      ...app,
      phone: app.phone || pat.Phone || pat.phone || '',
      email: app.email || pat.Email || pat.email || '',
      prefers_email: pat.prefers_email !== false,
      prefers_sms: pat.prefers_sms === true,
      prefers_sms_reminder: true,
      patientNotes: pat.notes || pat.Notes || '',
    };
  });
}

async function sendReminderChannels({
  app,
  companyConfig,
  clinicName,
  locale,
}) {
  if (patientHasSmsOptOut({
    notes: app.patientNotes,
    patientNotes: app.notes,
    confirmation_reply: app.confirmation_reply,
  })) {
    return { email: 'skipped', sms: 'skipped', reason: 'sms_opt_out' };
  }

  const { sendEmail, sendSms } = resolveNotifyChannelsForPatient(companyConfig, 'reminder', {
    prefers_email: app.prefers_email,
    prefers_sms: app.prefers_sms,
    prefers_sms_reminder: true,
  });
  if (!sendEmail && !sendSms) {
    return { email: 'skipped', sms: 'skipped', reason: 'patient_channels_off' };
  }

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

  if (sendEmail && app.email) {
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

  if (sendSms && app.phone) {
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
  } else if (sendSms && !app.phone) {
    report.sms = 'missing_phone';
  }

  return report;
}

function channelDelivered(report) {
  return report?.email === 'sent' || report?.sms === 'sent';
}

export async function runAppointmentReminderCron({
  supabase,
  clinicName,
  companyConfig = {},
} = {}) {
  if (!supabase || !clinicName) {
    return { ok: false, error: 'missing_supabase' };
  }

  const clinicId = normalizeClinicId(clinicName);
  let config = { ...companyConfig };

  // Mantener recordatorios automáticos encendidos (GDL/TX).
  if (config.notify_auto_reminder === false || config.notify_use_sms_reminder === false) {
    const heal = {
      notify_auto_reminder: true,
      notify_use_sms_reminder: true,
      notify_channel_sms: config.notify_channel_sms === false ? true : config.notify_channel_sms,
    };
    const { data: healed } = await supabase
      .from('company_config')
      .update(heal)
      .eq('clinic', clinicId)
      .select('*')
      .maybeSingle();
    if (healed) config = healed;
    else config = { ...config, ...heal };
  }

  if (!isAutoNotifyEnabled(config, 'reminder')) {
    return { ok: true, skipped: true, reason: 'reminders_disabled', sent: 0 };
  }

  const clinicWideEmail = config.notify_channel_email !== false;
  const clinicWideSms = config.notify_channel_sms !== false;
  if (!clinicWideEmail && !clinicWideSms) {
    return { ok: true, skipped: true, reason: 'channels_off', sent: 0 };
  }

  const locale = localeForClinic(clinicName);
  const timezone = getClinicTimezone(clinicName);
  const reminderHours = resolveReminderHours(config, clinicName);
  const now = new Date();
  const lookAheadDays = Math.ceil((Math.max(reminderHours, 24) + 12) / 24) + 1;
  const end = new Date(now.getTime() + lookAheadDays * 24 * 60 * 60 * 1000);
  const startDate = now.toISOString().slice(0, 10);
  const endDate = end.toISOString().slice(0, 10);

  const { data: rows, error } = await selectWithColumnFallback(
    (cols) => supabase
      .from('appointments')
      .select(cols)
      .gte('full_date', startDate)
      .lte('full_date', endDate)
      .is('reminder_sent_at', null)
      .limit(400),
    [
      'id', 'patient', 'phone', 'time', 'full_date', 'equipment', 'duration', 'buffer',
      'check_in_status', 'reminder_sent_at', 'notes',
      'prefers_email', 'prefers_sms', 'email', 'patient_id', 'confirmation_reply',
    ],
  );

  if (error) {
    if (/reminder_sent_at|column/i.test(error.message || '')) {
      return { ok: false, error: 'missing_reminder_sent_at_column', detail: error.message };
    }
    throw error;
  }

  const windowed = (rows || []).filter((app) => {
    if (TERMINAL_STATUSES.has(String(app.check_in_status || ''))) return false;
    return isAppointmentInReminderWindow(app, reminderHours, now, timezone);
  });

  const candidates = await enrichAppsFromPatients(supabase, windowed);

  let sent = 0;
  let skipped = 0;
  const failures = [];
  const reports = [];

  for (const app of candidates) {
    try {
      const report = await sendReminderChannels({
        app,
        companyConfig: config,
        clinicName,
        locale,
      });
      reports.push({ id: app.id, ...report });

      if (!channelDelivered(report)) {
        skipped += 1;
        // No marcar reminder_sent_at si no salió ningún canal (reintentar mañana / siguiente cron)
        continue;
      }

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
    skipped,
    candidates: candidates.length,
    failures,
    reminderHours,
    timezone,
  };
}
