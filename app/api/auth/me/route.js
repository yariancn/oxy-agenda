import { NextResponse } from 'next/server';
import { refreshStaffSessionUser } from '../../../../lib/resolveStaffLoginServer.js';
import { normalizeStaffSessionUser } from '../../../../lib/clinicAccess.js';
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
    user = normalizeStaffSessionUser(user, { roleLevel: user?.accessLevel });
  } catch {
    /* keep existing session */
  }

  const response = NextResponse.json({ user });
  response.cookies.set(STAFF_SESSION_COOKIE, createStaffSessionToken(user), staffSessionCookieOptions());
  return response;
}
