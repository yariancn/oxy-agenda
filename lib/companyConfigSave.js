import { NOTIFY_SETTING_FIELDS } from './notifySettings.js';
import { STAFF_ALERT_FIELDS } from './staffBookingAlert.js';

const SCHEDULE_KEYS = [
  'start_time',
  'end_time',
  'interval_mins',
  'booking_limit_hours',
  'cancel_limit_hours',
  'weekly_schedule',
];

const CALENDAR_FEED_KEYS = ['calendar_feed_enabled', 'calendar_feed_token'];

const GOOGLE_CALENDAR_KEYS = [
  'google_calendar_enabled',
  'google_calendar_id',
  'google_calendar_email',
];

const NOTIFY_KEYS = [
  'notify_on_booking',
  'reminder_hours',
  'confirmation_sms_enabled',
  'confirmation_hours_before',
  'confirmation_no_reply_hours',
  'confirmation_sms_body',
];

const EMAIL_TEMPLATE_KEYS = [
  'notify_subject_first',
  'notify_body_first',
  'notify_subject_booking',
  'notify_body_booking',
  'notify_subject_reschedule',
  'notify_body_reschedule',
  'notify_subject_cancel',
  'notify_body_cancel',
  'notify_subject_reminder',
  'notify_body_reminder',
  'notify_extra_info',
];

const COLUMN_TO_SCRIPT = {
  weekly_schedule: 'scripts/supabase-weekly-schedule.sql',
  calendar_feed_enabled: 'scripts/supabase-calendar-feed.sql',
  calendar_feed_token: 'scripts/supabase-calendar-feed.sql',
  google_calendar_enabled: 'scripts/supabase-google-calendar-sync.sql',
  google_calendar_id: 'scripts/supabase-google-calendar-sync.sql',
  google_calendar_email: 'scripts/supabase-google-calendar-sync.sql',
  maps_url: 'scripts/supabase-company-config-full.sql',
  notify_staff_on_booking: 'scripts/supabase-company-config-full.sql',
  staff_alert_first_sessions_only: 'scripts/supabase-staff-alerts.sql',
  staff_alert_phones: 'scripts/supabase-company-config-full.sql',
  staff_alert_emails: 'scripts/supabase-company-config-full.sql',
};

function isMissingColumnError(error) {
  if (!error?.message) return false;
  return /column|schema cache/i.test(error.message);
}

function extractMissingColumn(error) {
  if (!error?.message) return null;
  const msg = error.message;
  const quoted = msg.match(/Could not find the '([^']+)' column/i);
  if (quoted) return quoted[1];
  const dotted = msg.match(/column company_config\.(\w+) does not exist/i);
  if (dotted) return dotted[1];
  return null;
}

function omitKeys(obj, keys) {
  const next = { ...obj };
  for (const key of keys) delete next[key];
  return next;
}

function scriptsForOmittedColumns(omitted) {
  const scripts = new Set();
  let needsFull = false;

  for (const col of omitted) {
    if (COLUMN_TO_SCRIPT[col]) {
      scripts.add(COLUMN_TO_SCRIPT[col]);
    } else if (EMAIL_TEMPLATE_KEYS.includes(col)) {
      scripts.add('scripts/supabase-email-templates.sql');
      needsFull = true;
    } else if (NOTIFY_SETTING_FIELDS.includes(col) || NOTIFY_KEYS.includes(col) || String(col).startsWith('notify_use_')) {
      scripts.add('scripts/supabase-notify-channels.sql');
      scripts.add('scripts/supabase-notify-settings.sql');
      needsFull = true;
    } else if (STAFF_ALERT_FIELDS.includes(col)) {
      scripts.add('scripts/supabase-company-config-full.sql');
    } else if (SCHEDULE_KEYS.includes(col)) {
      if (col === 'weekly_schedule') scripts.add('scripts/supabase-weekly-schedule.sql');
      else needsFull = true;
    }
  }

  if (needsFull) scripts.add('scripts/supabase-company-config-full.sql');
  if (scripts.size === 0) scripts.add('scripts/supabase-admin-setup.sql');

  return [...scripts].sort();
}

function buildPartialSaveWarning(omitted, locale = 'es') {
  const scripts = scriptsForOmittedColumns(omitted);
  const list = scripts.map((s) => `• ${s}`).join('\n');
  const cols = omitted.length ? omitted.join(', ') : '?';
  const isNotifyOnly = omitted.every((c) => (
    NOTIFY_SETTING_FIELDS.includes(c)
    || NOTIFY_KEYS.includes(c)
    || EMAIL_TEMPLATE_KEYS.includes(c)
    || String(c).startsWith('notify_')
  ));

  if (locale === 'en') {
    return (
      `Saved partially — Supabase is missing these columns:\n${cols}\n\n`
      + `Open Supabase → SQL Editor (GDL and Houston) and run:\n${list}\n\n`
      + (isNotifyOnly
        ? 'Tip: run scripts/supabase-notify-channels.sql in the SQL Editor, then save again.'
        : 'Then save again in Admin.')
    );
  }

  return (
    `Se guardó parcialmente — faltan estas columnas en Supabase:\n${cols}\n\n`
    + `Abre Supabase → SQL Editor (GDL y Houston) y ejecuta:\n${list}\n\n`
    + (isNotifyOnly
      ? 'Tip: copia y pega scripts/supabase-notify-channels.sql en el SQL Editor. Luego guarda otra vez.'
      : 'Luego guarda otra vez en Admin.')
  );
}

async function saveWithColumnFallback(runSave, payload) {
  const omitted = [];
  let current = { ...payload };

  for (let attempt = 0; attempt < 24; attempt += 1) {
    const { error } = await runSave(current);
    if (!error) {
      return { error: null, omitted };
    }
    if (!isMissingColumnError(error)) {
      return { error, omitted };
    }

    const missing = extractMissingColumn(error);
    if (missing && missing in current) {
      omitted.push(missing);
      current = omitKeys(current, [missing]);
      continue;
    }

    const fallbackKeys = [
      ...SCHEDULE_KEYS,
      ...CALENDAR_FEED_KEYS,
      ...GOOGLE_CALENDAR_KEYS,
      ...NOTIFY_KEYS,
      ...EMAIL_TEMPLATE_KEYS,
      ...NOTIFY_SETTING_FIELDS,
      ...STAFF_ALERT_FIELDS,
    ];
    const stripNext = fallbackKeys.find((key) => key in current);
    if (!stripNext) {
      return { error, omitted };
    }
    omitted.push(stripNext);
    current = omitKeys(current, [stripNext]);
  }

  return { error: new Error('No se pudo guardar la configuración'), omitted };
}

export async function saveCompanyConfigRow(supabase, { id, clinic, payload, locale = 'es' }) {
  if (id) {
    const { error, omitted } = await saveWithColumnFallback(
      (row) => supabase.from('company_config').update(row).eq('id', id),
      payload,
    );
    if (!error && omitted.length === 0) return { error: null, warning: null };
    if (!error) {
      return { error: null, warning: buildPartialSaveWarning(omitted, locale) };
    }
    return { error, warning: null };
  }

  const { error, omitted } = await saveWithColumnFallback(
    (row) => supabase.from('company_config').insert([{ ...row, clinic }]),
    payload,
  );
  if (!error && omitted.length === 0) return { error: null, warning: null };
  if (!error) {
    return { error: null, warning: buildPartialSaveWarning(omitted, locale) };
  }
  return { error, warning: null };
}

export async function checkCompanyConfigSchema(supabase) {
  const { error } = await supabase
    .from('company_config')
    .select('id, start_time, end_time, interval_mins, notify_on_booking')
    .limit(1);
  return !error;
}
