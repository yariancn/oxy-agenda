import { createHmac, timingSafeEqual } from 'crypto';
import { maskStaffEmail, normalizeStaffEmail } from './staffEmail.js';

export const STAFF_DEVICE_COOKIE = 'oxy_staff_device';
const DEVICE_TTL_MS = 1000 * 60 * 60 * 24 * 90;
/** En dispositivo recordado, el NIP solo se vuelve a pedir tras este intervalo. */
export const DEVICE_PIN_GRACE_MS = 1000 * 60 * 60 * 24;

function getSessionSecret() {
  const secret = String(process.env.STAFF_SESSION_SECRET || '').trim();
  if (!secret) throw new Error('Missing STAFF_SESSION_SECRET');
  return secret;
}

function signPayload(payloadB64, secret) {
  return createHmac('sha256', secret).update(payloadB64).digest('base64url');
}

export function createStaffDeviceToken(email, { pinVerifiedAt } = {}) {
  const normalized = normalizeStaffEmail(email);
  if (!normalized) return null;
  const secret = getSessionSecret();
  const payload = {
    email: normalized,
    v: 2,
    pinAt: Number(pinVerifiedAt) > 0 ? Number(pinVerifiedAt) : Date.now(),
    exp: Date.now() + DEVICE_TTL_MS,
  };
  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = signPayload(payloadB64, secret);
  return `${payloadB64}.${signature}`;
}

export function verifyStaffDeviceToken(token) {
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
    if (!payload?.email || !payload?.exp || Date.now() > payload.exp) return null;
    return {
      email: normalizeStaffEmail(payload.email),
      pinVerifiedAt: Number(payload.pinAt) || 0,
    };
  } catch {
    return null;
  }
}

export function staffDeviceCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: DEVICE_TTL_MS / 1000,
  };
}

export function readStaffDeviceFromRequest(request) {
  const cookieHeader = request.headers.get('cookie') || '';
  const match = cookieHeader.match(new RegExp(`(?:^|; )${STAFF_DEVICE_COOKIE}=([^;]*)`));
  if (!match) return null;
  return verifyStaffDeviceToken(decodeURIComponent(match[1]));
}

export function isDevicePinFresh(device) {
  if (!device?.pinVerifiedAt) return false;
  return Date.now() - device.pinVerifiedAt < DEVICE_PIN_GRACE_MS;
}

export function buildTrustedDeviceHint(email, device = null) {
  return {
    trusted: true,
    emailMasked: maskStaffEmail(email),
    pinFresh: device ? isDevicePinFresh(device) : false,
  };
}
