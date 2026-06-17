import { NextResponse } from 'next/server';
import { resolveStaffLoginServer } from '../../../../lib/resolveStaffLoginServer.js';
import {
  createStaffSessionToken,
  staffSessionCookieOptions,
  STAFF_SESSION_COOKIE,
} from '../../../../lib/staffSession.js';

export async function POST(request) {
  try {
    const { pin } = await request.json();
    const result = await resolveStaffLoginServer(pin);
    if (!result.user) {
      return NextResponse.json({ success: false, error: 'invalid' }, { status: 401 });
    }

    const token = createStaffSessionToken(result.user);
    const response = NextResponse.json({ success: true, user: result.user });
    response.cookies.set(STAFF_SESSION_COOKIE, token, staffSessionCookieOptions());
    return response;
  } catch (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
