import { NextResponse } from 'next/server';
import {
  exchangeGoogleAuthCode,
  fetchGoogleUserEmail,
  verifyGoogleOAuthState,
} from '../../../../../lib/googleCalendar.js';
import { getAppBaseUrl } from '../../../../../lib/calendarLinks.js';
import { getSupabaseAdmin } from '../../../../../lib/supabaseAdmin.js';
import { normalizeClinicId } from '../../../../../lib/clinicRegistry.js';

function adminRedirect(params) {
  const base = getAppBaseUrl();
  const qs = new URLSearchParams(params).toString();
  return NextResponse.redirect(`${base}/?${qs}`);
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  const state = searchParams.get('state');
  const oauthError = searchParams.get('error');

  if (oauthError) {
    return adminRedirect({ googleCalendar: 'error', reason: oauthError });
  }

  const statePayload = verifyGoogleOAuthState(state);
  if (!statePayload?.clinic) {
    return adminRedirect({ googleCalendar: 'error', reason: 'invalid_state' });
  }

  const clinic = normalizeClinicId(statePayload.clinic);
  const tokenResult = await exchangeGoogleAuthCode(code);
  if (!tokenResult.ok) {
    return adminRedirect({ googleCalendar: 'error', reason: tokenResult.error || 'token' });
  }

  const email = await fetchGoogleUserEmail(tokenResult.accessToken);
  const supabase = getSupabaseAdmin(clinic);

  const { error } = await supabase
    .from('company_config')
    .update({
      google_calendar_enabled: true,
      google_calendar_refresh_token: tokenResult.refreshToken,
      google_calendar_email: email || null,
      google_calendar_id: 'primary',
    })
    .eq('clinic', clinic);

  if (error) {
    if (/column|schema cache/i.test(error.message || '')) {
      return adminRedirect({ googleCalendar: 'error', reason: 'sql_required' });
    }
    return adminRedirect({ googleCalendar: 'error', reason: 'save_failed' });
  }

  return adminRedirect({ googleCalendar: 'connected', clinic });
}
