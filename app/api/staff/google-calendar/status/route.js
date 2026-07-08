import { NextResponse } from 'next/server';
import { canManageGoogleCalendar, isGoogleCalendarOAuthConfigured } from '../../../../../lib/googleCalendar.js';
import { loadGoogleCalendarConfig } from '../../../../../lib/googleCalendarSync.js';
import { readStaffSessionFromRequest } from '../../../../../lib/staffSession.js';
import { getSupabaseAdmin } from '../../../../../lib/supabaseAdmin.js';
import { normalizeClinicId } from '../../../../../lib/clinicRegistry.js';

export async function GET(request) {
  const user = readStaffSessionFromRequest(request);
  if (!user || !canManageGoogleCalendar(user)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const clinic = normalizeClinicId(searchParams.get('clinic') || user.clinic || 'Oxygengdl');
  const supabase = getSupabaseAdmin(clinic);
  const { data, error, columnMissing } = await loadGoogleCalendarConfig(supabase, clinic);

  if (columnMissing) {
    return NextResponse.json({
      configured: isGoogleCalendarOAuthConfigured(),
      connected: false,
      sqlRequired: true,
    });
  }

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const connected = Boolean(String(data?.google_calendar_refresh_token || '').trim());

  return NextResponse.json({
    configured: isGoogleCalendarOAuthConfigured(),
    connected,
    enabled: data?.google_calendar_enabled === true,
    email: data?.google_calendar_email || '',
    calendarId: data?.google_calendar_id || 'primary',
    sqlRequired: false,
  });
}
