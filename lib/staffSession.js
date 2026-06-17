import { createHmac, timingSafeEqual } from 'crypto';

export const STAFF_SESSION_COOKIE = 'oxy_staff_session';
const SESSION_TTL_MS = 1000 * 60 * 60 * 12;

function getSessionSecret() {
  const secret = String(process.env.STAFF_SESSION_SECRET || '').trim();
  if (!secret) throw new Error('Missing STAFF_SESSION_SECRET');
  return secret;
}

function signPayload(payloadB64, secret) {
  return createHmac('sha256', secret).update(payloadB64).digest('base64url');
}

export function createStaffSessionToken(user) {
  const secret = getSessionSecret();
  const payload = {
    user,
    exp: Date.now() + SESSION_TTL_MS,
  };
  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = signPayload(payloadB64, secret);
  return `${payloadB64}.${signature}`;
}

export function verifyStaffSessionToken(token) {
  if (!token) return null;
  const secret = getSessionSecret();
  const [payloadB64, signature] = String(token).split('.');
  if (!payloadB64 || !signature) return null;

  const expected = signPayload(payloadB64, secret);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  try {
    const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
    if (!payload?.user || !payload?.exp || Date.now() > payload.exp) return null;
    return payload.user;
  } catch {
    return null;
  }
}

export function staffSessionCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_TTL_MS / 1000,
  };
}

export function readStaffSessionFromRequest(request) {
  const cookieHeader = request.headers.get('cookie') || '';
  const match = cookieHeader.match(new RegExp(`(?:^|; )${STAFF_SESSION_COOKIE}=([^;]*)`));
  if (!match) return null;
  return verifyStaffSessionToken(decodeURIComponent(match[1]));
}
