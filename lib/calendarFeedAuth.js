const CONFIG_CORE_FIELDS = [
  'calendar_feed_enabled',
  'calendar_feed_token',
  'name',
  'address',
  'maps_url',
  'start_time',
  'end_time',
  'interval_mins',
  'booking_limit_hours',
].join(', ');

const CONFIG_WITH_SCHEDULE = `${CONFIG_CORE_FIELDS}, weekly_schedule`;

function isMissingColumnError(error) {
  return !!error?.message && /column|schema cache/i.test(error.message);
}

export async function loadCompanyConfigForFeed(supabase, clinic) {
  let result = await supabase
    .from('company_config')
    .select(CONFIG_WITH_SCHEDULE)
    .eq('clinic', clinic)
    .maybeSingle();

  if (result.error && isMissingColumnError(result.error)) {
    result = await supabase
      .from('company_config')
      .select(CONFIG_CORE_FIELDS)
      .eq('clinic', clinic)
      .maybeSingle();
  }

  if (result.error && isMissingColumnError(result.error)) {
    result = await supabase
      .from('company_config')
      .select('calendar_feed_enabled, calendar_feed_token, name, address, maps_url')
      .eq('clinic', clinic)
      .maybeSingle();
  }

  return result;
}

export async function resolvePromoterFeedToken(supabase, token) {
  let result = await supabase
    .from('promoters')
    .select('code, calendar_feed_token, is_active')
    .eq('calendar_feed_token', token)
    .maybeSingle();

  if (result.error && isMissingColumnError(result.error)) {
    return { data: null, error: result.error, columnMissing: true };
  }

  return { ...result, columnMissing: false };
}
