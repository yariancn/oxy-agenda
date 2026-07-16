import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '../../../../lib/supabaseAdmin.js';
import { CLINIC_OXYGENDGL, CLINIC_SHENANDOAH } from '../../../../lib/clinicRegistry.js';

async function probeSelect(supabase, table, columns) {
  const { error } = await supabase.from(table).select(columns).limit(1);
  return { ok: !error, error: error?.message || null };
}

async function probeTable(supabase, table) {
  const { error } = await supabase.from(table).select('*', { count: 'exact', head: true });
  return { ok: !error, error: error?.message || null };
}

async function countWhere(supabase, table, col, val) {
  const { count, error } = await supabase
    .from(table)
    .select('*', { count: 'exact', head: true })
    .eq(col, val);
  if (error) return { error: error.message, count: null };
  return { count: count || 0, error: null };
}

async function auditDatabase(clinicName, { includeGdlLocations = false } = {}) {
  const supabase = getSupabaseAdmin(clinicName);
  const checks = {};

  const set = (key, ok, detail = null) => {
    checks[key] = { ok, detail };
  };

  const apptClinic = await probeSelect(supabase, 'appointments', 'id, clinic');
  set('appointments_clinic_column', apptClinic.ok, apptClinic.error);

  const staffCols = await probeSelect(supabase, 'users_staff', 'id, email, phone, notify_on_booking');
  set('users_staff_profile', staffCols.ok, staffCols.error);

  if (clinicName === CLINIC_OXYGENDGL) {
    const loginTable = await probeTable(supabase, 'staff_login_attempts');
    set('staff_login_attempts_table', loginTable.ok, loginTable.error);
  }

  const firstNotes = await probeSelect(supabase, 'services', 'id, first_session_notes, use_custom_notes');
  set('services_first_session_notes', firstNotes.ok, firstNotes.error);

  const sessionGroups = await probeTable(supabase, 'session_groups');
  const sessionGroupCol = await probeSelect(supabase, 'patients', 'id, session_group_id');
  set(
    'session_groups',
    sessionGroups.ok && sessionGroupCol.ok,
    [sessionGroups.error, sessionGroupCol.error].filter(Boolean).join('; ') || null,
  );

  const overrides = await probeSelect(supabase, 'appointments', 'id, outside_normal_hours, is_extended_block');
  set('appointment_overrides', overrides.ok, overrides.error);

  const serviceHours = await probeSelect(supabase, 'services', 'id, start_time, end_time');
  set('service_hours', serviceHours.ok, serviceHours.error);

  const companyConfig = await probeSelect(
    supabase,
    'company_config',
    'id, weekly_schedule, notify_auto_booking, calendar_feed_enabled, staff_alert_phones',
  );
  set('company_config_full', companyConfig.ok, companyConfig.error);

  const notifyProbeCols = [
    'notify_use_email_first',
    'notify_use_sms_first',
    'notify_use_email_booking',
    'notify_use_sms_booking',
    'notify_use_email_reschedule',
    'notify_use_sms_reschedule',
    'notify_use_email_cancel',
    'notify_use_sms_cancel',
    'notify_use_email_reminder',
    'notify_use_sms_reminder',
    'notify_auto_reminder',
    'notify_sms_reminder',
    'notify_subject_reminder',
    'notify_body_reminder',
    'notify_auto_first',
    'notify_auto_booking',
    'notify_channel_email',
    'notify_channel_sms',
    'notify_sms_booking',
    'staff_alert_first_sessions_only',
  ];
  const notifyMissing = [];
  for (const col of notifyProbeCols) {
    const probe = await probeSelect(supabase, 'company_config', col);
    if (!probe.ok) notifyMissing.push(col);
  }
  set(
    'company_config_notify_channels',
    notifyMissing.length === 0,
    notifyMissing.length ? `missing: ${notifyMissing.join(', ')}` : null,
  );

  const reminderCol = await probeSelect(supabase, 'appointments', 'id, reminder_sent_at');
  set('appointments_reminder_sent_at', reminderCol.ok, reminderCol.error);

  const promoters = await probeSelect(supabase, 'promoters', 'id, calendar_feed_token, notes');
  set('promoters_feed', promoters.ok, promoters.error);

  if (includeGdlLocations) {
    const cfg2 = await countWhere(supabase, 'company_config', 'clinic', 'Oxygengdl2');
    const svc2 = await countWhere(supabase, 'services', 'clinic', 'Oxygengdl2');
    const gdl2Ready = apptClinic.ok && !cfg2.error && (cfg2.count || 0) > 0 && (svc2.count || 0) > 0;
    set(
      'gdl2_location',
      gdl2Ready,
      gdl2Ready
        ? `Oxygengdl2 config=${cfg2.count}, servicios=${svc2.count}`
        : [cfg2.error, !apptClinic.ok && 'sin columna clinic', (cfg2.count || 0) < 1 && 'sin config Oxygengdl2', (svc2.count || 0) < 1 && 'sin servicios Oxygengdl2'].filter(Boolean).join('; ') || null,
    );
  }

  const activeServices = await countWhere(supabase, 'services', 'is_active', true);
  set('active_services', !activeServices.error && (activeServices.count || 0) > 0, activeServices.error || `count=${activeServices.count || 0}`);

  return checks;
}

export async function GET() {
  try {
    const [gdl, tx] = await Promise.all([
      auditDatabase(CLINIC_OXYGENDGL, { includeGdlLocations: true }),
      auditDatabase(CLINIC_SHENANDOAH),
    ]);

    const missingGdl = Object.entries(gdl).filter(([, v]) => !v.ok).map(([k]) => k);
    const missingTx = Object.entries(tx).filter(([, v]) => !v.ok).map(([k]) => k);

    return NextResponse.json({
      buildSha: (process.env.VERCEL_GIT_COMMIT_SHA || 'dev').slice(0, 7),
      gdl,
      tx,
      missingGdl,
      missingTx,
      allOk: missingGdl.length === 0 && missingTx.length === 0,
    });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
