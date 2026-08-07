import { NextResponse } from 'next/server';
import { resolveStaffLoginServer } from '../../../../lib/resolveStaffLoginServer.js';
import {
  attachStaffSessionCookie,
  resolveStaffApiUser,
} from '../../../../lib/staffApiSession.js';

/** Re-confirms the PIN of the staff member already signed in on this device. */
export async function POST(request) {
  try {
    const sessionUser = await resolveStaffApiUser(request);
    if (!sessionUser) {
      return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const pin = String(body?.pin || '').trim();
    if (!pin) {
      return NextResponse.json({ ok: false, error: 'empty' }, { status: 400 });
    }

    const result = await resolveStaffLoginServer({
      email: sessionUser.email || '',
      pin,
      request,
    });

    if (!result.user) {
      return NextResponse.json(
        {
          ok: false,
          error: result.error || 'invalid',
          lockedMinutes: result.lockedMinutes || null,
        },
        { status: result.error === 'locked' ? 429 : 401 },
      );
    }

    const response = NextResponse.json({
      ok: true,
      name: result.user.name || sessionUser.name || '',
    });
    try {
      return attachStaffSessionCookie(response, sessionUser);
    } catch {
      return response;
    }
  } catch (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
