import { getSupabaseAdmin } from './supabaseAdmin.js';

const CHUNK = 250;

/**
 * One-time (idempotent) DB migration:
 * - all patients prefers_sms = false
 * - appointments prefers_sms = false (if column exists)
 * - clinic non-first SMS defaults off; first stays email+SMS
 *
 * Marker: company_config.notify_sms_opt_in_migrated_at
 */
export async function migrateClinicSmsOptIn(clinicName) {
  const sb = getSupabaseAdmin(clinicName);

  let configs = [];
  {
    const withMarker = await sb
      .from('company_config')
      .select('id, clinic, notify_sms_opt_in_migrated_at')
      .limit(5);
    if (withMarker.error && /notify_sms_opt_in_migrated_at/.test(withMarker.error.message || '')) {
      const bare = await sb.from('company_config').select('id, clinic').limit(5);
      if (bare.error) throw new Error(bare.error.message);
      configs = bare.data || [];
    } else if (withMarker.error) {
      throw new Error(withMarker.error.message);
    } else {
      configs = withMarker.data || [];
      const already = configs.length > 0 && configs.every((row) => row.notify_sms_opt_in_migrated_at);
      if (already) {
        return { clinic: clinicName, skipped: true, reason: 'already_migrated' };
      }
    }
  }

  const { data: patients, error: pErr } = await sb.from('patients').select('id, prefers_sms');
  if (pErr) throw new Error(`patients: ${pErr.message}`);
  const fixPatients = (patients || []).filter((p) => p.prefers_sms !== false);
  for (let i = 0; i < fixPatients.length; i += CHUNK) {
    const ids = fixPatients.slice(i, i + CHUNK).map((p) => p.id);
    const { error } = await sb.from('patients').update({ prefers_sms: false }).in('id', ids);
    if (error) throw new Error(`patients update: ${error.message}`);
  }

  let appointmentsFixed = 0;
  const { data: apps, error: aErr } = await sb.from('appointments').select('id, prefers_sms');
  if (!aErr) {
    const fixApps = (apps || []).filter((a) => a.prefers_sms !== false);
    appointmentsFixed = fixApps.length;
    for (let i = 0; i < fixApps.length; i += CHUNK) {
      const ids = fixApps.slice(i, i + CHUNK).map((a) => a.id);
      const { error } = await sb.from('appointments').update({ prefers_sms: false }).in('id', ids);
      if (error) {
        // Column may not exist on some clinics — ignore.
        appointmentsFixed = 0;
        break;
      }
    }
  }

  const migratedAt = new Date().toISOString();
  const patch = {
    notify_use_sms_booking: false,
    notify_use_sms_reschedule: false,
    notify_use_sms_cancel: false,
    notify_use_sms_reminder: false,
    notify_use_sms_first: true,
    notify_use_email_first: true,
    notify_use_email_booking: true,
    notify_use_email_reschedule: true,
    notify_use_email_cancel: true,
    notify_use_email_reminder: true,
    notify_sms_opt_in_migrated_at: migratedAt,
  };

  for (const row of configs || []) {
    const { error } = await sb.from('company_config').update(patch).eq('id', row.id);
    if (error) {
      // Marker column may be missing — still apply SMS defaults without marker.
      const { notify_sms_opt_in_migrated_at, ...withoutMarker } = patch;
      const { error: e2 } = await sb.from('company_config').update(withoutMarker).eq('id', row.id);
      if (e2) throw new Error(`company_config: ${e2.message}`);
    }
  }

  return {
    clinic: clinicName,
    skipped: false,
    patientsFixed: fixPatients.length,
    appointmentsFixed,
    configs: (configs || []).length,
    migratedAt,
  };
}
