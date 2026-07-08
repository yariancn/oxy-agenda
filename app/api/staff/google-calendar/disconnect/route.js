import { NextResponse } from 'next/server';
import { canManageGoogleCalendar } from '../../../../../lib/googleCalendar.js';
import { readStaffSessionFromRequest } from '../../../../../lib/staffSession.js';
import { getSupabaseAdmin } from '../../../../../lib/supabaseAdmin.js';
import { normalizeClinicId } from '../../../../../lib/clinicRegistry.js';

export async function POST(request) {
  const user = readStaffSessionFromRequest(request);
  if (!user || !canManageGoogleCalendar(user)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const clinic = normalizeClinicId(body.clinic || user.clinic || 'Oxygengdl');
  const supabase = getSupabaseAdmin(clinic);

  const { error } = await supabase
    .from('company_config')
    .update({
      google_calendar_enabled: false,
      google_calendar_refresh_token: null,
      google_calendar_email: null,
    })
    .eq('clinic', clinic);

  if (error) {
    if (/column|schema cache/i.test(error.message || '')) {
      return NextResponse.json({ error: 'SQL_REQUIRED' }, { status: 400 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
