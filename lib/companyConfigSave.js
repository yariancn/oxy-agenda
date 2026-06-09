const SCHEDULE_KEYS = [
  'start_time',
  'end_time',
  'interval_mins',
  'booking_limit_hours',
  'cancel_limit_hours',
];

const NOTIFY_KEYS = ['notify_on_booking', 'reminder_hours'];

function isMissingColumnError(error) {
  if (!error?.message) return false;
  return /column|schema cache/i.test(error.message);
}

function omitKeys(obj, keys) {
  const next = { ...obj };
  for (const key of keys) delete next[key];
  return next;
}

export async function saveCompanyConfigRow(supabase, { id, clinic, payload }) {
  if (id) {
    let { error } = await supabase.from('company_config').update(payload).eq('id', id);
    if (!error) return { error: null, warning: null };

    if (isMissingColumnError(error)) {
      let partial = omitKeys(payload, [...SCHEDULE_KEYS, ...NOTIFY_KEYS]);
      ({ error } = await supabase.from('company_config').update(partial).eq('id', id));
      if (!error) {
        return {
          error: null,
          warning: 'Se guardó parcialmente. Ejecuta scripts/supabase-company-config.sql en Supabase para habilitar horarios y notificaciones.',
        };
      }
    }
    return { error, warning: null };
  }

  let { error } = await supabase.from('company_config').insert([{ ...payload, clinic }]);
  if (!error) return { error: null, warning: null };

  if (isMissingColumnError(error)) {
    let partial = omitKeys(payload, [...SCHEDULE_KEYS, ...NOTIFY_KEYS]);
    ({ error } = await supabase.from('company_config').insert([{ ...partial, clinic }]));
    if (!error) {
      return {
        error: null,
        warning: 'Se guardó parcialmente. Ejecuta scripts/supabase-company-config.sql en Supabase para habilitar horarios y notificaciones.',
      };
    }
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
