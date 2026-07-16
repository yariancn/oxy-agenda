import { createHmac, timingSafeEqual } from 'crypto';
import { getAppBaseUrl } from './calendarLinks.js';
import { isShenandoah, normalizeClinicId } from './clinicRegistry.js';
import { digitsOnly } from './ensurePatient.js';

const MANAGE_TOKEN_TTL_MS = 1000 * 60 * 60 * 24 * 120; // 120 days

function getManageSecret() {
  const secret = String(
    process.env.STAFF_SESSION_SECRET
      || process.env.APPOINTMENT_MANAGE_SECRET
      || '',
  ).trim();
  if (!secret) throw new Error('Missing STAFF_SESSION_SECRET');
  return secret;
}

function signPayload(payloadB64, secret) {
  return createHmac('sha256', secret).update(`appt-manage:${payloadB64}`).digest('base64url');
}

export function createAppointmentManageToken({ appointmentId, clinicName, expiresAt } = {}) {
  const aid = String(appointmentId || '').trim();
  const clinic = normalizeClinicId(clinicName);
  if (!aid || !clinic) return null;

  let secret;
  try {
    secret = getManageSecret();
  } catch {
    return null;
  }
  const payload = {
    v: 1,
    aid,
    clinic,
    exp: Number(expiresAt) > 0 ? Number(expiresAt) : Date.now() + MANAGE_TOKEN_TTL_MS,
  };
  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = signPayload(payloadB64, secret);
  return `${payloadB64}.${signature}`;
}

export function verifyAppointmentManageToken(token) {
  if (!token) return null;
  let secret;
  try {
    secret = getManageSecret();
  } catch {
    return null;
  }
  const [payloadB64, signature] = String(token).split('.');
  if (!payloadB64 || !signature) return null;

  const expected = signPayload(payloadB64, secret);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  try {
    const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
    if (!payload?.aid || !payload?.clinic || !payload?.exp) return null;
    if (Date.now() > payload.exp) return null;
    return {
      appointmentId: String(payload.aid),
      clinicName: normalizeClinicId(payload.clinic),
      exp: Number(payload.exp),
    };
  } catch {
    return null;
  }
}

export function buildAppointmentManageUrl({ appointmentId, clinicName, baseUrl = getAppBaseUrl() } = {}) {
  const token = createAppointmentManageToken({ appointmentId, clinicName });
  if (!token) return '';
  const root = String(baseUrl || getAppBaseUrl()).replace(/\/$/, '');
  return `${root}/manage?t=${encodeURIComponent(token)}`;
}

function formatClinicPhoneForEmail(phone, clinicName) {
  const last10 = digitsOnly(phone).slice(-10);
  if (last10.length !== 10) return String(phone || '').trim();
  if (isShenandoah(clinicName)) return last10;
  return `${last10.slice(0, 2)} ${last10.slice(2, 6)} ${last10.slice(6)}`;
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Manage / cancel / reschedule CTA for confirmation & booking emails only. */
export function buildManageEmailBlock({
  appointmentId,
  clinicName,
  clinicPhone = '',
  locale = 'es',
  cancelLimitHours = 24,
  baseUrl = getAppBaseUrl(),
  notifyType = 'booking',
} = {}) {
  if (!['first', 'booking', 'reschedule'].includes(notifyType)) return '';
  if (!appointmentId || !clinicName) return '';

  const url = buildAppointmentManageUrl({ appointmentId, clinicName, baseUrl });
  if (!url) return '';

  const es = locale !== 'en';
  const limit = Math.max(1, Number(cancelLimitHours) || 24);
  const phone = formatClinicPhoneForEmail(clinicPhone, clinicName);
  const phoneLine = phone
    ? (es
      ? `Si faltan menos de ${limit} horas, llámanos al <strong>${escapeHtml(phone)}</strong>.`
      : `If fewer than ${limit} hours remain, please call us at <strong>${escapeHtml(phone)}</strong>.`)
    : (es
      ? `Si faltan menos de ${limit} horas, contáctanos directamente a la clínica.`
      : `If fewer than ${limit} hours remain, please contact the clinic directly.`);

  const heading = es ? 'Cancelar o reprogramar' : 'Cancel or reschedule';
  const body = es
    ? `Puedes cancelar o reprogramar tu cita en línea solo si lo haces con al menos ${limit} horas de anticipación.`
    : `You can cancel or reschedule online only if you do so at least ${limit} hours before your appointment.`;
  const cta = es ? 'Gestionar mi cita' : 'Manage my appointment';

  return `
    <div style="margin: 24px 0 8px; padding: 16px; background-color: #fff7ed; border: 1px solid #fdba74; border-radius: 8px;">
      <p style="margin: 0 0 10px; font-size: 11px; font-weight: 800; text-transform: uppercase; color: #9a3412;">${heading}</p>
      <p style="margin: 0 0 12px; font-size: 13px; color: #7c2d12; line-height: 1.5;">${body}</p>
      <p style="margin: 0 0 14px; font-size: 13px; color: #7c2d12; line-height: 1.5;">${phoneLine}</p>
      <a href="${url}" style="display: inline-block; padding: 12px 16px; background-color: #ea580c; color: #ffffff; text-decoration: none; border-radius: 6px; font-size: 13px; font-weight: 700;">${cta}</a>
    </div>
  `;
}
