import { NextResponse } from 'next/server';
import { buildGoogleOAuthUrl, canManageGoogleCalendar, isGoogleCalendarOAuthConfigured } from '../../../../../lib/googleCalendar.js';
import { readStaffSessionFromRequest } from '../../../../../lib/staffSession.js';
import { normalizeClinicId } from '../../../../../lib/clinicRegistry.js';

export async function GET(request) {
  const user = readStaffSessionFromRequest(request);
  if (!user || !canManageGoogleCalendar(user)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!isGoogleCalendarOAuthConfigured()) {
    return NextResponse.json(
      { error: 'GOOGLE_OAUTH_NOT_CONFIGURED' },
      { status: 503 },
    );
  }

  const { searchParams } = new URL(request.url);
  const clinic = normalizeClinicId(searchParams.get('clinic') || user.clinic || 'Oxygengdl');

  try {
    const url = buildGoogleOAuthUrl({ clinic });
    return NextResponse.redirect(url);
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
