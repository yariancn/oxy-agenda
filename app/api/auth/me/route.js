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
  try {
    let user = readStaffSessionFromRequest(request);
    if (!user) {
      return NextResponse.json({ user: null });
    }

    try {
      const refreshed = await refreshStaffSessionUser(user);
      if (refreshed === null) {
        // Explicit invalid/deactivated only — clear cookie.
        const response = NextResponse.json({ user: null });
        response.cookies.set(STAFF_SESSION_COOKIE, '', { ...staffSessionCookieOptions(), maxAge: 0 });
        return response;
      }
      if (refreshed) {
        user = normalizeStaffSessionUser(refreshed, { roleLevel: refreshed?.accessLevel });
      }
    } catch {
      /* keep existing session on transient refresh errors */
      user = normalizeStaffSessionUser(user, { roleLevel: user?.accessLevel });
    }

    const response = NextResponse.json({ user });
    try {
      response.cookies.set(STAFF_SESSION_COOKIE, createStaffSessionToken(user), staffSessionCookieOptions());
    } catch {
      /* cookie attach failed — still return user so UI can open */
    }
    return response;
  } catch (error) {
    return NextResponse.json({ user: null, error: error.message || 'auth_me_failed' }, { status: 200 });
  }
}
