import { createHmac, timingSafeEqual } from 'crypto';
import { getAppBaseUrl } from './calendarLinks.js';

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_CALENDAR_API = 'https://www.googleapis.com/calendar/v3';
const SCOPES = ['https://www.googleapis.com/auth/calendar.events'];

function getOAuthSecret() {
  return String(process.env.STAFF_SESSION_SECRET || process.env.GOOGLE_CALENDAR_STATE_SECRET || '').trim();
}

export function canManageGoogleCalendar(user) {
  if (!user) return false;
  if (user.id === 'admin') return true;
  const role = String(user.role || '').toLowerCase();
  return role.includes('admin') || role.includes('administrador') || role.includes('master');
}

export function isGoogleCalendarOAuthConfigured() {
  return Boolean(
    String(process.env.GOOGLE_CALENDAR_CLIENT_ID || '').trim()
    && String(process.env.GOOGLE_CALENDAR_CLIENT_SECRET || '').trim(),
  );
}

export function getGoogleCalendarRedirectUri() {
  const explicit = String(process.env.GOOGLE_CALENDAR_REDIRECT_URI || '').trim();
  if (explicit) return explicit;
  return `${getAppBaseUrl()}/api/staff/google-calendar/callback`;
}

function signStatePayload(payloadB64) {
  const secret = getOAuthSecret();
  if (!secret) throw new Error('Missing STAFF_SESSION_SECRET for OAuth state');
  return createHmac('sha256', secret).update(payloadB64).digest('base64url');
}

export function createGoogleOAuthState({ clinic }) {
  const payload = {
    clinic: String(clinic || '').trim(),
    exp: Date.now() + 10 * 60 * 1000,
  };
  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = signStatePayload(payloadB64);
  return `${payloadB64}.${signature}`;
}

export function verifyGoogleOAuthState(state) {
  if (!state) return null;
  const [payloadB64, signature] = String(state).split('.');
  if (!payloadB64 || !signature) return null;

  const expected = signStatePayload(payloadB64);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  try {
    const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
    if (!payload?.clinic || !payload?.exp || Date.now() > payload.exp) return null;
    return payload;
  } catch {
    return null;
  }
}

export function buildGoogleOAuthUrl({ clinic }) {
  const clientId = String(process.env.GOOGLE_CALENDAR_CLIENT_ID || '').trim();
  if (!clientId) throw new Error('GOOGLE_CALENDAR_CLIENT_ID not configured');

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: getGoogleCalendarRedirectUri(),
    response_type: 'code',
    scope: SCOPES.join(' '),
    access_type: 'offline',
    prompt: 'consent',
    state: createGoogleOAuthState({ clinic }),
  });

  return `${GOOGLE_AUTH_URL}?${params.toString()}`;
}

export async function exchangeGoogleAuthCode(code) {
  const clientId = String(process.env.GOOGLE_CALENDAR_CLIENT_ID || '').trim();
  const clientSecret = String(process.env.GOOGLE_CALENDAR_CLIENT_SECRET || '').trim();
  if (!clientId || !clientSecret) {
    return { ok: false, error: 'OAuth not configured' };
  }

  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code: String(code || ''),
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: getGoogleCalendarRedirectUri(),
      grant_type: 'authorization_code',
    }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.refresh_token) {
    return {
      ok: false,
      error: data.error_description || data.error || 'token_exchange_failed',
    };
  }

  return {
    ok: true,
    refreshToken: data.refresh_token,
    accessToken: data.access_token,
    expiresIn: data.expires_in,
  };
}

export async function refreshGoogleAccessToken(refreshToken) {
  const clientId = String(process.env.GOOGLE_CALENDAR_CLIENT_ID || '').trim();
  const clientSecret = String(process.env.GOOGLE_CALENDAR_CLIENT_SECRET || '').trim();
  if (!clientId || !clientSecret || !refreshToken) {
    return { ok: false, error: 'missing_credentials' };
  }

  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.access_token) {
    return {
      ok: false,
      error: data.error_description || data.error || 'refresh_failed',
    };
  }

  return { ok: true, accessToken: data.access_token };
}

export async function fetchGoogleUserEmail(accessToken) {
  const res = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return '';
  return String(data.email || '').trim();
}

export async function upsertGoogleCalendarEvent({
  accessToken,
  calendarId = 'primary',
  eventId,
  event,
}) {
  const cal = encodeURIComponent(calendarId || 'primary');
  const url = eventId
    ? `${GOOGLE_CALENDAR_API}/calendars/${cal}/events/${encodeURIComponent(eventId)}`
    : `${GOOGLE_CALENDAR_API}/calendars/${cal}/events`;

  const res = await fetch(url, {
    method: eventId ? 'PUT' : 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(event),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    return { ok: false, error: data.error?.message || 'event_upsert_failed', status: res.status };
  }

  return { ok: true, eventId: data.id, data };
}

export async function deleteGoogleCalendarEvent({
  accessToken,
  calendarId = 'primary',
  eventId,
}) {
  if (!eventId) return { ok: true, skipped: true };

  const cal = encodeURIComponent(calendarId || 'primary');
  const res = await fetch(
    `${GOOGLE_CALENDAR_API}/calendars/${cal}/events/${encodeURIComponent(eventId)}`,
    {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${accessToken}` },
    },
  );

  if (res.status === 404) return { ok: true, notFound: true };
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    return { ok: false, error: data.error?.message || 'event_delete_failed' };
  }

  return { ok: true };
}
