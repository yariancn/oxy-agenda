import { CLINIC_OXYGENDGL, CLINIC_SHENANDOAH } from './clinicRegistry.js';
import { getSupabaseAdmin } from './supabaseAdmin.js';
import { runLabsMobileBalanceAlert } from './labsMobileBalanceAlert.js';
import { runAppointmentConfirmationCron } from './appointmentConfirmation.js';
import { runAppointmentReminderCron } from './appointmentReminder.js';
import { runWeeklySalesReportGdl } from './weeklySalesReport.js';

const CRON_TIMEZONE = 'America/Mexico_City';

export function isMondayInTimezone(timeZone = CRON_TIMEZONE, date = new Date()) {
  const dayName = new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'long' }).format(date);
  return dayName === 'Monday';
}

async function runRemindersForClinic(clinicName) {
  const supabase = getSupabaseAdmin(clinicName);
  const { data: config } = await supabase
    .from('company_config')
    .select('*')
    .eq('clinic', clinicName)
    .maybeSingle();

  return runAppointmentReminderCron({
    supabase,
    clinicName,
    companyConfig: config || {},
  });
}

async function safeTask(name, fn) {
  try {
    return { ok: true, result: await fn() };
  } catch (error) {
    return { ok: false, error: error?.message || String(error) };
  }
}

export async function runLabsMobileCronTask() {
  return runLabsMobileBalanceAlert();
}

export async function runAppointmentCronTasks() {
  const supabaseTx = getSupabaseAdmin(CLINIC_SHENANDOAH);
  const confirmation = await runAppointmentConfirmationCron({
    supabase: supabaseTx,
    clinicName: CLINIC_SHENANDOAH,
  });

  const reminders = {
    [CLINIC_SHENANDOAH]: await runRemindersForClinic(CLINIC_SHENANDOAH),
    [CLINIC_OXYGENDGL]: await runRemindersForClinic(CLINIC_OXYGENDGL),
  };

  return { confirmation, reminders };
}

/**
 * Single daily cron (Hobby plan: one schedule).
 * Each task is isolated — one failure does not block the others.
 */
export async function runDailyCron({ forceWeeklyReport = false, skipWeeklyReport = false } = {}) {
  const ranAt = new Date().toISOString();
  const tasks = {};

  tasks.labsMobileBalance = await safeTask('labsMobileBalance', runLabsMobileCronTask);

  tasks.appointments = await safeTask('appointments', runAppointmentCronTasks);

  const shouldRunWeekly = !skipWeeklyReport && (forceWeeklyReport || isMondayInTimezone());
  if (shouldRunWeekly) {
    tasks.weeklySalesReport = await safeTask('weeklySalesReport', runWeeklySalesReportGdl);
  } else {
    tasks.weeklySalesReport = { ok: true, skipped: true, reason: 'not_monday' };
  }

  const failed = Object.entries(tasks).filter(([, v]) => v?.ok === false);
  return {
    ok: failed.length === 0,
    ranAt,
    timezone: CRON_TIMEZONE,
    isMonday: isMondayInTimezone(),
    tasks,
    failedTasks: failed.map(([name]) => name),
  };
}
