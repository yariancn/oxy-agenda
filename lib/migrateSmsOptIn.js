import { getSupabaseAdmin } from './supabaseAdmin.js';

const CHUNK = 250;

/**
 * One-time (idempotent) DB migration for SMS split prefs:
 * - prefers_sms = false (scheduling/changes opt-in)
 * - prefers_sms_reminder = true (reminders default on)
 * - clinic SMS channels + auto-reminder enabled
 *
 * Marker: company_config.notify_sms_reminder_split_at
 */
export async function migrateClinicSmsReminderSplit(clinicName) {
  const sb = getSupabaseAdmin(clinicName);

  let configs = [];
  {
    const withMarker = await sb
      .from('company_config')
      .select('id, clinic, notify_sms_reminder_split_at')
      .limit(5);
    if (withMarker.error && /notify_sms_reminder_split_at/.test(withMarker.error.message || '')) {
      const bare = await sb.from('company_config').select('id, clinic').limit(5);
      if (bare.error) throw new Error(bare.error.message);
      configs = bare.data || [];
    } else if (withMarker.error) {
      throw new Error(withMarker.error.message);
    } else {
      configs = withMarker.data || [];
      const already = configs.length > 0 && configs.every((row) => row.notify_sms_reminder_split_at);
      if (already) {
        return { clinic: clinicName, skipped: true, reason: 'already_migrated' };
      }
    }
  }

  const { data: patients, error: pErr } = await sb
    .from('patients')
    .select('id, prefers_sms, prefers_sms_reminder');
  if (pErr && /prefers_sms_reminder/.test(pErr.message || '')) {
    // Column missing — skip patient reminder backfill; SQL script must run first.
  } else if (pErr) {
    throw new Error(`patients: ${pErr.message}`);
  } else {
    const fixScheduling = (patients || []).filter((p) => p.prefers_sms !== false);
    for (let i = 0; i < fixScheduling.length; i += CHUNK) {
      const ids = fixScheduling.slice(i, i + CHUNK).map((p) => p.id);
      const { error } = await sb.from('patients').update({ prefers_sms: false }).in('id', ids);
      if (error) throw new Error(`patients prefers_sms: ${error.message}`);
    }
    const fixReminder = (patients || []).filter((p) => p.prefers_sms_reminder === false || p.prefers_sms_reminder == null);
    // Only null → true; leave explicit false alone? User wants default ON for everyone
    // who hasn't opted out. Treat null as on; keep false as opt-out.
    const nullReminder = (patients || []).filter((p) => p.prefers_sms_reminder == null);
    for (let i = 0; i < nullReminder.length; i += CHUNK) {
      const ids = nullReminder.slice(i, i + CHUNK).map((p) => p.id);
      const { error } = await sb.from('patients').update({ prefers_sms_reminder: true }).in('id', ids);
      if (error && /prefers_sms_reminder/.test(error.message || '')) break;
      if (error) throw new Error(`patients prefers_sms_reminder: ${error.message}`);
    }
    void fixReminder;
  }

  const migratedAt = new Date().toISOString();
  const patch = {
    notify_use_sms_booking: true,
    notify_use_sms_reschedule: true,
    notify_use_sms_cancel: true,
    notify_use_sms_reminder: true,
    notify_use_sms_first: true,
    notify_use_email_first: true,
    notify_use_email_booking: true,
    notify_use_email_reschedule: true,
    notify_use_email_cancel: true,
    notify_use_email_reminder: true,
    notify_auto_reminder: true,
    notify_channel_email: true,
    notify_channel_sms: true,
    notify_sms_reminder_split_at: migratedAt,
  };

  for (const row of configs || []) {
    const { error } = await sb.from('company_config').update(patch).eq('id', row.id);
    if (error) {
      const { notify_sms_reminder_split_at, ...withoutMarker } = patch;
      const { error: e2 } = await sb.from('company_config').update(withoutMarker).eq('id', row.id);
      if (e2) throw new Error(`company_config: ${e2.message}`);
    }
  }

  return {
    clinic: clinicName,
    skipped: false,
    configs: (configs || []).length,
    migratedAt,
  };
}

/** @deprecated use migrateClinicSmsReminderSplit */
export async function migrateClinicSmsOptIn(clinicName) {
  return migrateClinicSmsReminderSplit(clinicName);
}
