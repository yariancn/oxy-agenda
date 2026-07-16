import { createHmac, timingSafeEqual } from 'crypto';
import { maskStaffEmail, normalizeStaffEmail } from './staffEmail.js';

export const STAFF_DEVICE_COOKIE = 'oxy_staff_device';
const DEVICE_TTL_MS = 1000 * 60 * 60 * 24 * 90;
/**
 * Solo aplica a cookies antiguas (sin IP). Con IP conocida no se pide NIP
 * de nuevo mientras el dispositivo siga recordado (90 días).
 */
export const DEVICE_PIN_GRACE_MS = 1000 * 60 * 60 * 24;

function getSessionSecret() {
  const secret = String(process.env.STAFF_SESSION_SECRET || '').trim();
  if (!secret) throw new Error('Missing STAFF_SESSION_SECRET');
  return secret;
}

function signPayload(payloadB64, secret) {
  return createHmac('sha256', secret).update(payloadB64).digest('base64url');
}

export function hashClientIp(ip) {
  const normalized = String(ip || '').trim();
  if (!normalized) return '';
  return createHmac('sha256', getSessionSecret()).update(`staff-ip:${normalized}`).digest('base64url').slice(0, 24);
}

function safeEqualHash(a, b) {
  if (!a || !b) return false;
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

export function createStaffDeviceToken(email, { pinVerifiedAt, ip, ipHash: existingIpHash } = {}) {
  const normalized = normalizeStaffEmail(email);
  if (!normalized) return null;
  const secret = getSessionSecret();
  // Prefer live IP; if missing (proxy gap), keep previous hash so refresh does not wipe trust.
  const ipHash = hashClientIp(ip) || String(existingIpHash || '').trim();
  const payload = {
    email: normalized,
    v: 3,
    pinAt: Number(pinVerifiedAt) > 0 ? Number(pinVerifiedAt) : Date.now(),
    exp: Date.now() + DEVICE_TTL_MS,
    ...(ipHash ? { ipH: ipHash } : {}),
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
      ipHash: payload.ipH ? String(payload.ipH) : '',
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

export function isTrustedIpMatch(device, requestIp) {
  if (!device?.ipHash) return false;
  const current = hashClientIp(requestIp);
  return safeEqualHash(device.ipHash, current);
}

/**
 * Usuario + dispositivo recordado + misma IP → sin NIP.
 * Cookies viejas sin IP: grace de 24 h hasta el próximo login con NIP (se liga la IP).
 */
export function canAutoLoginWithoutPin(device, requestIp = '') {
  if (!device?.email) return false;
  if (isTrustedIpMatch(device, requestIp)) return true;
  if (!device.ipHash && isDevicePinFresh(device)) return true;
  return false;
}

export function buildTrustedDeviceHint(email, device = null, requestIp = '') {
  const pinFresh = device ? canAutoLoginWithoutPin(device, requestIp) : false;
  return {
    trusted: true,
    emailMasked: maskStaffEmail(email),
    pinFresh,
    ipBound: Boolean(device?.ipHash),
    ipMatch: device ? isTrustedIpMatch(device, requestIp) : false,
  };
}
