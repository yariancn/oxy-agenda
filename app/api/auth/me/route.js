import { NextResponse } from 'next/server';
import { refreshStaffSessionUser } from '../../../../lib/resolveStaffLoginServer.js';
import {
  createStaffSessionToken,
  readStaffSessionFromRequest,
  staffSessionCookieOptions,
  STAFF_SESSION_COOKIE,
} from '../../../../lib/staffSession.js';

export async function GET(request) {
  let user = readStaffSessionFromRequest(request);
  if (!user) {
    return NextResponse.json({ user: null });
  }

  try {
    user = await refreshStaffSessionUser(user);
  } catch {
    /* keep existing session */
  }

  const response = NextResponse.json({ user });
  response.cookies.set(STAFF_SESSION_COOKIE, createStaffSessionToken(user), staffSessionCookieOptions());
  return response;
}
