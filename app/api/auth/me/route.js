import { NextResponse } from 'next/server';
import {
  createStaffSessionToken,
  readStaffSessionFromRequest,
  staffSessionCookieOptions,
  STAFF_SESSION_COOKIE,
} from '../../../../lib/staffSession.js';

export async function GET(request) {
  const user = readStaffSessionFromRequest(request);
  if (!user) {
    return NextResponse.json({ user: null });
  }

  const response = NextResponse.json({ user });
  response.cookies.set(STAFF_SESSION_COOKIE, createStaffSessionToken(user), staffSessionCookieOptions());
  return response;
}
