import { normalizeStaffSessionUser } from './clinicAccess.js';
import { refreshStaffSessionUser } from './resolveStaffLoginServer.js';
import {
  createStaffSessionToken,
  readStaffSessionFromRequest,
  staffSessionCookieOptions,
  STAFF_SESSION_COOKIE,
} from './staffSession.js';

/** Valida y renueva la sesión staff para rutas API (extiende cookie). */
export async function resolveStaffApiUser(request) {
  let user = readStaffSessionFromRequest(request);
  if (!user) return null;

  try {
    user = await refreshStaffSessionUser(user);
    if (!user) return null;
    user = normalizeStaffSessionUser(user, { roleLevel: user?.accessLevel });
  } catch {
    user = normalizeStaffSessionUser(user, { roleLevel: user?.accessLevel });
  }

  return user;
}

export function attachStaffSessionCookie(response, user) {
  if (!user) return response;
  response.cookies.set(
    STAFF_SESSION_COOKIE,
    createStaffSessionToken(user),
    staffSessionCookieOptions(),
  );
  return response;
}

export function isStaffAuthError(message = '') {
  return /unauthorized|access denied|sesión|session expired/i.test(String(message || ''));
}
