import { getMinutes } from './publicBookingSlots.js';
import {
  getClinicTimezone,
  isShenandoah,
  localeForClinic,
  normalizeClinicId,
} from './clinicRegistry.js';
import {
  isMexicoSmsConfigured,
  isTwilioConfigured,
  sendPatientTextMessage,
} from './clinicMessaging.js';
import { toE164Phone } from './appointmentNotify.js';
import { selectWithColumnFallback } from './supabaseSelectSafe.js';
import {
  buildConfirmationReplyUrls,
  generateConfirmationShortCode,
} from './appointmentManageToken.js';
import { isFirstSessionAppointment } from './emailTemplates.js';

export const CONFIRMATION_STATUS = {
  NONE: 'none',
  PENDING: 'pending',
  CONFIRMED: 'confirmed',
  DECLINED: 'declined',
  NO_RESPONSE: 'no_response_likely',
};

const ACTIVE_STATUSES = new Set(['Agendado', 'Llegó', 'En Sesión']);

/** Teléfono fijo GDL para alertas de respuesta SI/NO. */
export const GDL_CONFIRMATION_STAFF_PHONE = '3321664083';

export const DEFAULT_GDL_CONFIRMATION_SMS = `Hola {{nombre}}, confirma tu sesión {{cuando}} {{hora}} en OXYGENGDL.

👉 Da click:

✅ SI → {{si_url}}

❌ NO → {{no_url}}

Dudas {{telefono}}`;

/** Make SI/NO lines stand out (SMS has no bold/color — emojis + spacing only). */
export function emphasizeConfirmationChoices(body) {
  return String(body || '')
    .replace(/Da click en un enlace\s*:?/gi, '👉 Da click:')
    .replace(/Tap a link\s*:?/gi, '👉 Tap one:')
    .replace(/(^|\n)\s*✅?\s*SI\s*(VOY)?\s*→/gim, '$1✅ SI →')
    .replace(/(^|\n)\s*❌?\s*NO\s*(VOY)?\s*→/gim, '$1❌ NO →')
    .replace(/(^|\n)\s*✅?\s*YES\s*→/gim, '$1✅ YES →')
    .replace(/\n{4,}/g, '\n\n\n');
}

/** Append one-tap SI/NO links when the template forgot them (common old “responde SI/NO” bodies). */
export function ensureConfirmationLinkLines(body, { siUrl = '', noUrl = '', locale = 'es' } = {}) {
  let text = String(body || '').trim();
  if (!text || !siUrl || !noUrl) return emphasizeConfirmationChoices(text);
  if (text.includes(siUrl) || text.includes(noUrl) || /\{\{\s*si_url\s*\}\}/i.test(text)) {
    return emphasizeConfirmationChoices(text);
  }
  // Remove reply-by-SMS instructions that cannot work without a virtual number.
  text = text
    .replace(/Agradeceremos respondas[^\n.]*(?:\.[^\n]*)?/gi, '')
    .replace(/Reply YES[^\n.]*(?:\.[^\n]*)?/gi, '')
    .replace(/[^\n]*respond[ae][^\n]*\bSI\b[^\n]*\bNO\b[^\n]*/gi, '')
    .replace(/[^\n]*reply[^\n]*\bYES\b[^\n]*\bNO\b[^\n]*/gi, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  const links = locale === 'en'
    ? `👉 Tap one:\n\n✅ YES → ${siUrl}\n\n❌ NO → ${noUrl}`
    : `👉 Da click:\n\n✅ SI → ${siUrl}\n\n❌ NO → ${noUrl}`;
  return emphasizeConfirmationChoices(`${text}\n\n${links}`);
}

export function defaultConfirmationHoursBefore(clinicName) {
  // Houston + GDL: ~6h before, or right after booking if already inside that window.
  void clinicName;
  return 6;
}

export function supportsConfirmationSms(clinicName) {
  const clinicId = normalizeClinicId(clinicName);
  // Houston + GDL (primera sesión). Otras sedes no.
  return isShenandoah(clinicId) || clinicId === 'Oxygengdl';
}

export function parseConfirmationReply(body) {
  const text = String(body || '').trim().toUpperCase();
  if (!text) return null;
  // Strip accents so SÍ → SI, then drop punctuation.
  const ascii = text.normalize('NFD').replace(/\p{M}/gu, '');
  const normalized = ascii.replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim();
  if (/^(YES|Y|SI|CONFIRM|CONFIRMED|OK|1)\b/.test(normalized)) return 'confirmed';
  if (/^(NO|N|CANCEL|CANCELLED|CANCELED|2)\b/.test(normalized)) return 'declined';
  return null;
}

/**
 * UTC ms for wall-clock `fullDate` + `timeStr` in `timezone`.
 * Host TZ-independent (critical on Vercel UTC vs local Chicago/dev).
 */
export function appointmentStartMs(fullDate, timeStr, timezone) {
  if (!fullDate || !timeStr || !timezone) return null;
  const mins = getMinutes(timeStr);
  if (!Number.isFinite(mins)) return null;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  const y = Number(String(fullDate).slice(0, 4));
  const mo = Number(String(fullDate).slice(5, 7));
  const d = Number(String(fullDate).slice(8, 10));
  if (![y, mo, d, h, m].every(Number.isFinite)) return null;

  let utc = Date.UTC(y, mo - 1, d, h, m, 0);
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  for (let i = 0; i < 4; i += 1) {
    const parts = Object.fromEntries(
      formatter.formatToParts(new Date(utc))
        .filter((p) => p.type !== 'literal')
        .map((p) => [p.type, p.value]),
    );
    let hour = Number(parts.hour);
    if (hour === 24) hour = 0;
    const asUtc = Date.UTC(
      Number(parts.year),
      Number(parts.month) - 1,
      Number(parts.day),
      hour,
      Number(parts.minute),
      Number(parts.second || 0),
    );
    const desired = Date.UTC(y, mo - 1, d, h, m, 0);
    const diff = desired - asUtc;
    if (diff === 0) break;
    utc += diff;
  }
  return utc;
}

/** Calendar YMD in clinic timezone. */
export function ymdInTimezone(ms, timezone) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return formatter.format(new Date(ms));
}

/**
 * "hoy" / "mañana" (ES) or "today" / "tomorrow" (EN) relative to appointment date.
 */
export function relativeSessionDayLabel(fullDate, timezone, locale = 'es', nowMs = Date.now()) {
  const apptYmd = String(fullDate || '').slice(0, 10);
  if (!apptYmd || !timezone) return locale === 'en' ? 'soon' : 'pronto';
  const todayYmd = ymdInTimezone(nowMs, timezone);
  const tomorrowMs = nowMs + 24 * 60 * 60 * 1000;
  const tomorrowYmd = ymdInTimezone(tomorrowMs, timezone);
  if (apptYmd === todayYmd) return locale === 'en' ? 'today' : 'hoy';
  if (apptYmd === tomorrowYmd) return locale === 'en' ? 'tomorrow' : 'mañana';
  try {
    const [y, mo, d] = apptYmd.split('-').map(Number);
    const label = new Date(Date.UTC(y, mo - 1, d, 12, 0, 0)).toLocaleDateString(
      locale === 'en' ? 'en-US' : 'es-MX',
      { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'short' },
    );
    return label;
  } catch {
    return apptYmd;
  }
}

export function buildConfirmationSms({
  patientName,
  time,
  clinicDisplayName,
  hoursBefore = 6,
  noReplyHours = 1,
  customBody = '',
  locale = 'en',
  clinicPhone = '7135913379',
  cuando = '',
  fullDate = '',
  timezone = '',
  appointmentId = '',
  clinicName = '',
  siUrl = '',
  noUrl = '',
  confirmUrl = '',
  shortCode = '',
}) {
  const phoneDigits = String(clinicPhone || '').replace(/\D/g, '');
  const phone = locale === 'en'
    ? (phoneDigits.slice(-10) || '7135913379')
    : (phoneDigits.length >= 10 ? phoneDigits.slice(-10).replace(/(\d{2})(\d{4})(\d{4})/, '$1 $2 $3') : '33 2166 4083');
  const dayLabel = cuando
    || relativeSessionDayLabel(fullDate, timezone || 'America/Mexico_City', locale);

  let resolvedSi = siUrl;
  let resolvedNo = noUrl;
  let resolvedConfirm = confirmUrl;
  if ((!resolvedSi || !resolvedNo || !resolvedConfirm) && (shortCode || (appointmentId && clinicName))) {
    const urls = buildConfirmationReplyUrls({ appointmentId, clinicName, shortCode });
    resolvedSi = resolvedSi || urls.siUrl;
    resolvedNo = resolvedNo || urls.noUrl;
    resolvedConfirm = resolvedConfirm || urls.confirmUrl;
  }

  const applyPlaceholders = (template) => String(template || '')
    .replace(/\{\{nombre\}\}/gi, patientName || '')
    .replace(/\{\{hora\}\}/gi, time || '')
    .replace(/\{\{clinica\}\}/gi, clinicDisplayName || '')
    .replace(/\{\{telefono\}\}/gi, phone)
    .replace(/\{\{cuando\}\}/gi, dayLabel)
    .replace(/\{\{confirm_url\}\}/gi, resolvedConfirm || '')
    .replace(/\{\{si_url\}\}/gi, resolvedSi || '')
    .replace(/\{\{no_url\}\}/gi, resolvedNo || '');

  const custom = String(customBody || '').trim();
  let body;
  if (custom) {
    body = applyPlaceholders(custom);
  } else if (locale === 'en') {
    body = resolvedSi && resolvedNo
      ? `Hi ${patientName}, confirm your session ${dayLabel} ${time} at ${clinicDisplayName}.

👉 Tap one:

✅ YES → ${resolvedSi}

❌ NO → ${resolvedNo}

Q: ${phone}`
      : `Hi ${patientName}, your session at ${clinicDisplayName} is ${dayLabel} at ${time}. Questions: ${phone}.`;
  } else if (resolvedSi && resolvedNo) {
    body = applyPlaceholders(DEFAULT_GDL_CONFIRMATION_SMS);
  } else {
    body = `Hola ${patientName}, confirma tu sesión ${dayLabel} a las ${time} en ${clinicDisplayName || 'OXYGENGDL'}.
Dudas: ${phone}`;
  }

  return ensureConfirmationLinkLines(body, {
    siUrl: resolvedSi,
    noUrl: resolvedNo,
    locale,
  });
}

function isBrowserClient() {
  return typeof window !== 'undefined';
}

function hasOutboundSmsCapability(clinicName) {
  if (isShenandoah(clinicName)) return isTwilioConfigured();
  return isMexicoSmsConfigured() || isTwilioConfigured();
}

/** Staff opted this appointment into SI/NO confirmation (or already in the flow). */
export function isAppointmentConfirmationEnabled(appointment) {
  if (appointment?.confirmation_enabled === true) return true;
  const status = appointment?.confirmation_status || CONFIRMATION_STATUS.NONE;
  return Boolean(status && status !== CONFIRMATION_STATUS.NONE);
}

/** First clinic visit — auto SI/NO confirmation (no checkbox required). */
export function isAutoFirstVisitConfirmation(appointment, allAppointments = []) {
  if (!appointment) return false;
  return isFirstSessionAppointment({
    patientName: appointment.patient,
    patientId: appointment.patient_id ?? appointment.patientId ?? null,
    appointments: allAppointments,
    excludeAppointmentId: appointment.id,
    fullDate: appointment.full_date || appointment.fullDate,
    time: appointment.time,
  });
}

/** Show confirmation UI / allow auto-send: first visit OR staff checkbox / already in flow. */
export function isConfirmationTargetAppointment(appointment, allAppointments = []) {
  return isAppointmentConfirmationEnabled(appointment)
    || isAutoFirstVisitConfirmation(appointment, allAppointments);
}

export function isEligibleConfirmationAppointment({
  appointment,
  allAppointments = [],
  companyConfig = {},
  clinicName,
  requireSms = true,
}) {
  if (!supportsConfirmationSms(clinicName)) return false;
  if (companyConfig.confirmation_sms_enabled !== true) return false;
  if (requireSms && !isBrowserClient() && !hasOutboundSmsCapability(clinicName)) return false;
  if (!ACTIVE_STATUSES.has(appointment.check_in_status || 'Agendado')) return false;
  if (appointment.confirmation_status && appointment.confirmation_status !== CONFIRMATION_STATUS.NONE) {
    return false;
  }
  const phone = String(appointment.phone || appointment.Phone || '').trim();
  if (!phone) return false;

  // First visit: always. Other visits: only if staff checked “Enable confirmation”.
  return isConfirmationTargetAppointment(appointment, allAppointments);
}

export function digitsMatch(a, b) {
  const da = String(a || '').replace(/\D/g, '').slice(-10);
  const db = String(b || '').replace(/\D/g, '').slice(-10);
  return da.length >= 10 && da === db;
}

export function findPendingConfirmationByPhone({ appointments, phone, timezone }) {
  const now = Date.now();
  const pending = (appointments || []).filter((a) => {
    if (a.confirmation_status !== CONFIRMATION_STATUS.PENDING) return false;
    if (!digitsMatch(a.phone || a.Phone, phone)) return false;
    const start = appointmentStartMs(a.full_date, a.time, timezone);
    if (!start) return false;
    return start > now - 3 * 60 * 60 * 1000;
  });
  pending.sort((a, b) => {
    const sa = appointmentStartMs(a.full_date, a.time, timezone) || 0;
    const sb = appointmentStartMs(b.full_date, b.time, timezone) || 0;
    return sa - sb;
  });
  return pending[0] || null;
}

/**
 * Ensure appointment has a short confirmation_code for SMS-friendly links.
 * Returns '' if the column is missing (caller falls back to long signed URLs).
 */
export async function ensureAppointmentConfirmationCode(supabase, appointmentId, existingCode = '') {
  const current = String(existingCode || '').trim();
  if (current) return current;
  if (!appointmentId || !supabase) return '';

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const code = generateConfirmationShortCode();
    const { data, error } = await supabase
      .from('appointments')
      .update({ confirmation_code: code, confirmation_enabled: true })
      .eq('id', appointmentId)
      .select('id, confirmation_code')
      .maybeSingle();
    if (!error && data?.id) return String(data.confirmation_code || code).trim();
    if (error && /column|schema cache|confirmation_code/i.test(error.message || '')) {
      return '';
    }
    // unique collision → retry
  }
  return '';
}

async function persistConfirmationSent(supabase, appointmentId, { confirmationCode = '' } = {}) {
  const sentAt = new Date().toISOString();
  const codePayload = confirmationCode
    ? { confirmation_code: confirmationCode, confirmation_enabled: true }
    : { confirmation_enabled: true };
  const payloads = [
    {
      ...codePayload,
      confirmation_status: CONFIRMATION_STATUS.PENDING,
      confirmation_sent_at: sentAt,
      confirmation_replied_at: null,
      confirmation_reply: null,
    },
    {
      confirmation_enabled: true,
      confirmation_status: CONFIRMATION_STATUS.PENDING,
      confirmation_sent_at: sentAt,
      confirmation_replied_at: null,
      confirmation_reply: null,
    },
    {
      confirmation_status: CONFIRMATION_STATUS.PENDING,
      confirmation_sent_at: sentAt,
    },
  ];

  let updated = null;
  let lastUpdErr = null;
  for (const payload of payloads) {
    const { data, error } = await supabase
      .from('appointments')
      .update(payload)
      .eq('id', appointmentId)
      .select('id, confirmation_status, confirmation_sent_at')
      .maybeSingle();
    if (!error && data?.id) {
      updated = data;
      break;
    }
    lastUpdErr = error;
    if (error && !/column|schema cache/i.test(error.message || '')) {
      return { ok: false, error: error.message, sentAt };
    }
  }
  if (!updated?.id) {
    return { ok: false, error: lastUpdErr?.message || 'db_update_failed', sentAt };
  }
  return { ok: true, sentAt, updated };
}

export async function runAppointmentConfirmationCron({ supabase, clinicName }) {
  const clinicId = normalizeClinicId(clinicName);
  if (!supportsConfirmationSms(clinicId)) {
    return { ok: true, skipped: true, reason: 'unsupported_clinic' };
  }

  const timezone = getClinicTimezone(clinicId);
  const locale = localeForClinic(clinicId);
  const now = Date.now();

  const { data: configRow, error: configErr } = await supabase
    .from('company_config')
    .select('id, name, confirmation_sms_enabled, confirmation_hours_before, confirmation_no_reply_hours, confirmation_sms_body, phone')
    .eq('clinic', clinicId)
    .maybeSingle();
  if (configErr) throw configErr;
  let config = configRow;
  if (config?.confirmation_sms_enabled !== true) {
    // GDL: first-visit confirmation must stay on (6h before / ~5 min if booked inside window).
    if (clinicId === 'Oxygengdl') {
      const { data: healed } = await supabase
        .from('company_config')
        .update({
          confirmation_sms_enabled: true,
          confirmation_hours_before: Number(config?.confirmation_hours_before) || 6,
        })
        .eq('clinic', clinicId)
        .select('id, name, confirmation_sms_enabled, confirmation_hours_before, confirmation_no_reply_hours, confirmation_sms_body, phone')
        .maybeSingle();
      if (healed?.confirmation_sms_enabled === true) {
        config = healed;
      } else {
        return { ok: true, skipped: true, reason: 'disabled' };
      }
    } else {
      return { ok: true, skipped: true, reason: 'disabled' };
    }
  }

  const hoursBefore = Number(config.confirmation_hours_before) || defaultConfirmationHoursBefore(clinicId);
  const noReplyHours = Number(config.confirmation_no_reply_hours) || 1;
  const minBeforeApptMs = 30 * 60 * 1000;

  const fromDate = new Date(now);
  fromDate.setFullYear(fromDate.getFullYear() - 2);
  const toDate = new Date(now);
  toDate.setDate(toDate.getDate() + 3);
  const fromIso = fromDate.toISOString().slice(0, 10);
  const toIso = toDate.toISOString().slice(0, 10);

  const { data: appointments, error: apptErr } = await supabase
    .from('appointments')
    .select('id, patient, patient_id, phone, time, full_date, equipment, check_in_status, is_new_patient, confirmation_status, confirmation_sent_at, confirmation_enabled, confirmation_code')
    .gte('full_date', fromIso)
    .lte('full_date', toIso)
    .neq('check_in_status', 'Cancelado');
  if (apptErr) throw apptErr;

  const all = appointments || [];
  const sendWindowStart = new Date(now);
  sendWindowStart.setDate(sendWindowStart.getDate() - 1);
  const sendWindowStartIso = sendWindowStart.toISOString().slice(0, 10);
  const candidates = all.filter((a) => String(a.full_date || '') >= sendWindowStartIso);
  const clinicDisplay = config.name || (isShenandoah(clinicId) ? 'OxyHyperbaric' : 'OXYGENGDL');
  let sent = 0;
  let noReply = 0;
  const errors = [];

  for (const appt of candidates) {
    if (appt.confirmation_status === CONFIRMATION_STATUS.PENDING && appt.confirmation_sent_at) {
      const sentAt = new Date(appt.confirmation_sent_at).getTime();
      if (now - sentAt >= noReplyHours * 60 * 60 * 1000) {
        const { error } = await supabase
          .from('appointments')
          .update({ confirmation_status: CONFIRMATION_STATUS.NO_RESPONSE })
          .eq('id', appt.id)
          .eq('confirmation_status', CONFIRMATION_STATUS.PENDING);
        if (!error) noReply += 1;
      }
      continue;
    }

    if (!isEligibleConfirmationAppointment({
      appointment: appt,
      allAppointments: all,
      companyConfig: config,
      clinicName: clinicId,
    })) {
      continue;
    }

    const startMs = appointmentStartMs(appt.full_date, appt.time, timezone);
    if (!startMs) continue;
    const sendAtMs = startMs - hoursBefore * 60 * 60 * 1000;
    const tooLateMs = startMs - minBeforeApptMs;
    if (now < sendAtMs || now > tooLateMs) continue;

    const hoursUntil = Math.max(1, Math.round((startMs - now) / (60 * 60 * 1000)));
    const to = toE164Phone(appt.phone, clinicId);
    if (!to) continue;

    const shortCode = await ensureAppointmentConfirmationCode(
      supabase,
      appt.id,
      appt.confirmation_code,
    );

    const body = buildConfirmationSms({
      patientName: appt.patient,
      time: appt.time,
      clinicDisplayName: clinicDisplay,
      hoursBefore: hoursUntil,
      noReplyHours,
      customBody: config.confirmation_sms_body || (isShenandoah(clinicId) ? '' : DEFAULT_GDL_CONFIRMATION_SMS),
      locale,
      clinicPhone: config.phone || (isShenandoah(clinicId) ? '7135913379' : GDL_CONFIRMATION_STAFF_PHONE),
      fullDate: appt.full_date,
      timezone,
      appointmentId: appt.id,
      clinicName: clinicId,
      shortCode,
    });

    const sms = await sendPatientTextMessage({
      clinicName: clinicId,
      phone: appt.phone,
      smsBody: body,
      notifyType: 'confirmation',
      locale,
    });
    if (!sms.ok) {
      errors.push({ id: appt.id, error: sms.error });
      continue;
    }

    const persisted = await persistConfirmationSent(supabase, appt.id, { confirmationCode: shortCode });
    if (!persisted.ok) errors.push({ id: appt.id, error: persisted.error });
    else sent += 1;
  }

  return { ok: true, clinic: clinicId, sent, noReply, errors };
}

function canManuallySendConfirmation({
  appointment,
  allAppointments = [],
  companyConfig = {},
  clinicName,
}) {
  const clinicId = normalizeClinicId(clinicName);
  if (!supportsConfirmationSms(clinicId)) return false;
  const status = appointment?.confirmation_status || CONFIRMATION_STATUS.NONE;
  if (
    status !== CONFIRMATION_STATUS.NONE
    && status !== CONFIRMATION_STATUS.PENDING
    && status !== CONFIRMATION_STATUS.NO_RESPONSE
  ) {
    return false;
  }
  return isEligibleConfirmationAppointment({
    appointment: {
      ...appointment,
      confirmation_status: CONFIRMATION_STATUS.NONE,
      // Treat in-flow appointments as opted-in (legacy rows / after send).
      confirmation_enabled: isAppointmentConfirmationEnabled(appointment) || undefined,
    },
    allAppointments,
    companyConfig,
    clinicName: clinicId,
    requireSms: !isBrowserClient(),
  });
}

export async function sendConfirmationSmsForAppointment({
  supabase,
  appointmentId,
  clinicName,
  force = false,
  resend = false,
}) {
  const clinicId = normalizeClinicId(clinicName);
  if (!supportsConfirmationSms(clinicId)) {
    return { ok: false, error: 'unsupported_clinic' };
  }

  const timezone = getClinicTimezone(clinicId);
  const locale = localeForClinic(clinicId);
  const now = Date.now();

  const { data: configRow, error: configErr } = await supabase
    .from('company_config')
    .select('id, name, confirmation_sms_enabled, confirmation_hours_before, confirmation_no_reply_hours, confirmation_sms_body, phone')
    .eq('clinic', clinicId)
    .maybeSingle();
  if (configErr) return { ok: false, error: configErr.message };
  let config = configRow;
  if (config?.confirmation_sms_enabled !== true) {
    if (clinicId === 'Oxygengdl') {
      const { data: healed } = await supabase
        .from('company_config')
        .update({
          confirmation_sms_enabled: true,
          confirmation_hours_before: Number(config?.confirmation_hours_before) || 6,
        })
        .eq('clinic', clinicId)
        .select('id, name, confirmation_sms_enabled, confirmation_hours_before, confirmation_no_reply_hours, confirmation_sms_body, phone')
        .maybeSingle();
      if (healed?.confirmation_sms_enabled === true) config = healed;
      else return { ok: false, error: 'disabled' };
    } else {
      return { ok: false, error: 'disabled' };
    }
  }

  const { data: appt, error: apptErr } = await selectWithColumnFallback(
    (cols) => supabase
      .from('appointments')
      .select(cols)
      .eq('id', appointmentId)
      .maybeSingle(),
    [
      'id', 'patient', 'patient_id', 'phone', 'time', 'full_date', 'equipment', 'check_in_status',
      'is_new_patient', 'confirmation_status', 'confirmation_sent_at', 'confirmation_enabled',
      'confirmation_code', 'prefers_sms',
    ],
  );
  if (apptErr) return { ok: false, error: apptErr.message };
  if (!appt) return { ok: false, error: 'not_found' };

  const fromDate = new Date(now);
  fromDate.setFullYear(fromDate.getFullYear() - 2);
  const toDate = new Date(now);
  toDate.setDate(toDate.getDate() + 90);
  const { data: allAppts, error: listErr } = await supabase
    .from('appointments')
    .select('id, patient, patient_id, phone, time, full_date, equipment, check_in_status, is_new_patient, confirmation_status, confirmation_enabled')
    .gte('full_date', fromDate.toISOString().slice(0, 10))
    .lte('full_date', toDate.toISOString().slice(0, 10));
  if (listErr) return { ok: false, error: listErr.message };

  const status = appt.confirmation_status || CONFIRMATION_STATUS.NONE;
  if (resend) {
    if (status === CONFIRMATION_STATUS.CONFIRMED || status === CONFIRMATION_STATUS.DECLINED) {
      return { ok: false, error: 'already_replied' };
    }
  } else if (status !== CONFIRMATION_STATUS.NONE) {
    return { ok: false, error: 'already_sent' };
  }

  const apptForEligibility = { ...appt, confirmation_status: CONFIRMATION_STATUS.NONE };
  if (!isEligibleConfirmationAppointment({
    appointment: apptForEligibility,
    allAppointments: allAppts || [],
    companyConfig: config,
    clinicName: clinicId,
  })) {
    return { ok: false, error: 'not_eligible' };
  }

  const startMs = appointmentStartMs(appt.full_date, appt.time, timezone);
  if (!startMs) return { ok: false, error: 'invalid_datetime' };

  const hoursBefore = Number(config.confirmation_hours_before) || defaultConfirmationHoursBefore(clinicId);
  if (!force && !resend) {
    const sendAtMs = startMs - hoursBefore * 60 * 60 * 1000;
    const tooLateMs = startMs - 30 * 60 * 1000;
    if (now < sendAtMs || now > tooLateMs) {
      return { ok: false, error: 'outside_window' };
    }
  }

  const hoursUntil = Math.max(1, Math.round((startMs - now) / (60 * 60 * 1000)));
  const noReplyHours = Number(config.confirmation_no_reply_hours) || 1;
  const clinicDisplay = config.name || (isShenandoah(clinicId) ? 'OxyHyperbaric' : 'OXYGENGDL');

  const to = toE164Phone(appt.phone, clinicId);
  if (!to) return { ok: false, error: 'invalid_phone' };

  const shortCode = await ensureAppointmentConfirmationCode(
    supabase,
    appt.id,
    appt.confirmation_code,
  );

  const body = buildConfirmationSms({
    patientName: appt.patient,
    time: appt.time,
    clinicDisplayName: clinicDisplay,
    hoursBefore: hoursUntil,
    noReplyHours,
    customBody: config.confirmation_sms_body || (isShenandoah(clinicId) ? '' : DEFAULT_GDL_CONFIRMATION_SMS),
    locale,
    clinicPhone: config.phone || (isShenandoah(clinicId) ? '7135913379' : GDL_CONFIRMATION_STAFF_PHONE),
    fullDate: appt.full_date,
    timezone,
    appointmentId: appt.id,
    clinicName: clinicId,
    shortCode,
  });

  const sms = await sendPatientTextMessage({
    clinicName: clinicId,
    phone: appt.phone,
    smsBody: body,
    notifyType: 'confirmation',
    locale,
  });
  if (!sms.ok) return { ok: false, error: sms.error || 'sms_failed' };

  const persisted = await persistConfirmationSent(supabase, appt.id, { confirmationCode: shortCode });
  if (!persisted.ok) {
    return { ok: false, error: persisted.error || 'db_update_failed' };
  }

  return { ok: true, sentAt: persisted.sentAt, appointmentId: appt.id, resent: !!resend };
}

/**
 * If the appointment is already inside the confirmation window (booked within
 * the last N hours before the visit), send soon after booking.
 * Default delay ~15s (serverless-safe); the 5-minute cron is the reliable path.
 */
export async function maybeSendConfirmationAfterBooking({
  supabase,
  appointmentId,
  clinicName,
  delayMs = 15 * 1000,
  nowMs = Date.now(),
}) {
  const clinicId = normalizeClinicId(clinicName);
  if (!supportsConfirmationSms(clinicId) || !appointmentId) {
    return { ok: true, skipped: true, reason: 'unsupported' };
  }

  const timezone = getClinicTimezone(clinicId);
  const { data: configRow } = await supabase
    .from('company_config')
    .select('confirmation_sms_enabled, confirmation_hours_before')
    .eq('clinic', clinicId)
    .maybeSingle();
  let config = configRow;
  if (config?.confirmation_sms_enabled !== true) {
    if (clinicId === 'Oxygengdl') {
      const { data: healed } = await supabase
        .from('company_config')
        .update({
          confirmation_sms_enabled: true,
          confirmation_hours_before: Number(config?.confirmation_hours_before) || 6,
        })
        .eq('clinic', clinicId)
        .select('confirmation_sms_enabled, confirmation_hours_before')
        .maybeSingle();
      if (healed?.confirmation_sms_enabled === true) config = healed;
      else return { ok: true, skipped: true, reason: 'disabled' };
    } else {
      return { ok: true, skipped: true, reason: 'disabled' };
    }
  }

  const { data: appt } = await selectWithColumnFallback(
    (cols) => supabase
      .from('appointments')
      .select(cols)
      .eq('id', appointmentId)
      .maybeSingle(),
    [
      'id, full_date, time, confirmation_status, confirmation_enabled, patient, patient_id, phone, check_in_status',
      'id, full_date, time, confirmation_status, confirmation_enabled, patient, phone, check_in_status',
      'id, full_date, time, confirmation_status, patient, phone, check_in_status',
    ],
  );
  if (!appt) return { ok: false, error: 'not_found' };
  if (appt.confirmation_status && appt.confirmation_status !== CONFIRMATION_STATUS.NONE) {
    return { ok: true, skipped: true, reason: 'already_sent' };
  }

  const startMs = appointmentStartMs(appt.full_date, appt.time, timezone);
  if (!startMs) return { ok: false, error: 'invalid_datetime' };

  const hoursBefore = Number(config.confirmation_hours_before) || defaultConfirmationHoursBefore(clinicId);
  const sendAtMs = startMs - hoursBefore * 60 * 60 * 1000;
  const tooLateMs = startMs - 30 * 60 * 1000;

  // Only early-send when the normal "hours before" window has already opened.
  if (nowMs < sendAtMs) {
    return { ok: true, skipped: true, reason: 'not_yet_window' };
  }
  if (nowMs > tooLateMs) {
    return { ok: true, skipped: true, reason: 'too_late' };
  }

  // Mark enabled so the 5-minute cron still sends if this after() is cut short.
  if (appt.confirmation_enabled !== true) {
    try {
      await supabase
        .from('appointments')
        .update({ confirmation_enabled: true })
        .eq('id', appointmentId);
    } catch {
      /* column may be missing on older DBs */
    }
  }

  const wait = Math.max(0, Math.min(Number(delayMs) || 0, 45 * 1000));
  if (wait > 0) {
    await new Promise((resolve) => setTimeout(resolve, wait));
  }

  return sendConfirmationSmsForAppointment({
    supabase,
    appointmentId,
    clinicName: clinicId,
    force: true,
  });
}

export function confirmationStatusLabel(status, locale = 'en') {
  const map = locale === 'en'
    ? {
        none: '',
        pending: 'Waiting for YES/NO',
        confirmed: 'Confirmed (YES)',
        declined: 'Declined (NO)',
        no_response_likely: 'No reply yet',
      }
    : {
        none: '',
        pending: 'Esperando SI/NO',
        confirmed: 'Confirmó (SI)',
        declined: 'Canceló (NO)',
        no_response_likely: 'Aún no ha respondido',
      };
  return map[status] || status || '';
}

export function confirmationStatusClass(status) {
  switch (status) {
    case CONFIRMATION_STATUS.CONFIRMED:
      return 'bg-emerald-100 text-emerald-800 border-emerald-300';
    case CONFIRMATION_STATUS.DECLINED:
      return 'bg-red-100 text-red-800 border-red-300';
    case CONFIRMATION_STATUS.NO_RESPONSE:
      return 'bg-orange-100 text-orange-800 border-orange-300';
    case CONFIRMATION_STATUS.PENDING:
      return 'bg-sky-100 text-sky-900 border-sky-400';
    default:
      return 'bg-slate-50 text-slate-500 border-slate-200';
  }
}

function withManualSendFlag(result, params) {
  if (!result) return result;
  const status = params?.appointment?.confirmation_status || CONFIRMATION_STATUS.NONE;
  const canSend = result.applicable === true && canManuallySendConfirmation(params);
  return {
    ...result,
    canSendManually: canSend,
    isResend: canSend && status !== CONFIRMATION_STATUS.NONE,
  };
}

/** Texto de diagnóstico para staff (confirmación SI/NO por cita). */
export function explainConfirmationState(params) {
  const {
    appointment,
    allAppointments = [],
    companyConfig = {},
    clinicName,
    now = Date.now(),
  } = params;
  const clinicId = normalizeClinicId(clinicName);
  if (!supportsConfirmationSms(clinicId)) {
    return withManualSendFlag({
      applicable: false,
      summaryEs: 'La confirmación SMS no aplica en esta clínica.',
      summaryEn: 'SMS confirmation does not apply at this clinic.',
    }, params);
  }

  const status = appointment?.confirmation_status || CONFIRMATION_STATUS.NONE;
  if (status === CONFIRMATION_STATUS.CONFIRMED) {
    return withManualSendFlag({ applicable: true, sent: true, replied: true, status, summaryEs: 'Paciente confirmó (enlace o SMS).', summaryEn: 'Patient confirmed (link or SMS).' }, params);
  }
  if (status === CONFIRMATION_STATUS.DECLINED) {
    return withManualSendFlag({ applicable: true, sent: true, replied: true, status, summaryEs: 'Paciente indicó NO (cita pendiente de liberar por staff).', summaryEn: 'Patient replied NO (slot pending staff release).' }, params);
  }
  if (status === CONFIRMATION_STATUS.NO_RESPONSE) {
    return withManualSendFlag({ applicable: true, sent: true, replied: false, status, summaryEs: 'SMS enviado; aún no ha respondido. Puedes reenviar o marcar SI/NO.', summaryEn: 'SMS sent; no reply yet. You can resend or mark YES/NO.' }, params);
  }
  if (status === CONFIRMATION_STATUS.PENDING) {
    return withManualSendFlag({ applicable: true, sent: true, replied: false, status, summaryEs: 'SMS enviado; esperando SI/NO. Puedes reenviar o marcar la respuesta.', summaryEn: 'SMS sent; waiting for YES/NO. You can resend or mark the reply.' }, params);
  }

  if (companyConfig.confirmation_sms_enabled !== true) {
    return withManualSendFlag({
      applicable: true,
      sent: false,
      status,
      summaryEs: 'Confirmación desactivada a nivel clínica. Actívala en Admin → Mensajes y guarda.',
      summaryEn: 'Clinic-wide confirmation is off. Enable it in Admin → Messages and save.',
    }, params);
  }

  const autoFirst = isAutoFirstVisitConfirmation(appointment, allAppointments);
  const optedIn = isAppointmentConfirmationEnabled(appointment);
  if (!optedIn && !autoFirst) {
    return withManualSendFlag({
      applicable: true,
      sent: false,
      status,
      autoFirstSession: false,
      summaryEs: 'No es primera cita. Marca el checkbox para habilitar confirmación SI/NO en esta visita.',
      summaryEn: 'Not a first visit. Check the box to enable YES/NO confirmation on this appointment.',
    }, params);
  }

  if (!isBrowserClient() && !hasOutboundSmsCapability(clinicId)) {
    return withManualSendFlag({
      applicable: true,
      sent: false,
      status,
      autoFirstSession: autoFirst,
      summaryEs: isShenandoah(clinicId) ? 'Twilio no configurado en el servidor.' : 'SMS México (LabsMobile) no configurado.',
      summaryEn: isShenandoah(clinicId) ? 'Twilio not configured on server.' : 'Mexico SMS (LabsMobile) not configured.',
    }, params);
  }
  if (!String(appointment?.phone || '').trim()) {
    return withManualSendFlag({ applicable: true, sent: false, status, autoFirstSession: autoFirst, summaryEs: 'La cita no tiene teléfono.', summaryEn: 'Appointment has no phone number.' }, params);
  }
  if (!ACTIVE_STATUSES.has(appointment?.check_in_status || 'Agendado')) {
    return withManualSendFlag({ applicable: true, sent: false, status, autoFirstSession: autoFirst, summaryEs: `Estatus «${appointment?.check_in_status}» — no aplica envío.`, summaryEn: `Status «${appointment?.check_in_status}» — send not applicable.` }, params);
  }

  const timezone = getClinicTimezone(clinicId);
  const hoursBefore = Number(companyConfig.confirmation_hours_before) || defaultConfirmationHoursBefore(clinicId);
  const startMs = appointmentStartMs(appointment.full_date, appointment.time, timezone);
  if (!startMs) {
    return withManualSendFlag({ applicable: true, sent: false, status, autoFirstSession: autoFirst, summaryEs: 'Fecha u hora inválida en la cita.', summaryEn: 'Invalid date or time on appointment.' }, params);
  }
  const sendAtMs = startMs - hoursBefore * 60 * 60 * 1000;
  const tooLateMs = startMs - 30 * 60 * 1000;
  const firstHintEs = autoFirst ? 'Primera cita: envío automático. ' : '';
  const firstHintEn = autoFirst ? 'First visit: automatic send. ' : '';
  if (now < sendAtMs) {
    const when = new Date(sendAtMs).toLocaleString(localeForClinic(clinicId) === 'en' ? 'en-US' : 'es-MX', {
      timeZone: timezone,
      hour: 'numeric',
      minute: '2-digit',
      day: 'numeric',
      month: 'short',
    });
    return withManualSendFlag({
      applicable: true,
      sent: false,
      status,
      autoFirstSession: autoFirst,
      summaryEs: `${firstHintEs}Envío automático ~${when} (${hoursBefore}h antes). Si quieres, envíalo ya con el botón de abajo.`,
      summaryEn: `${firstHintEn}Automatic send ~${when} (${hoursBefore}h before). You can send it now with the button below.`,
    }, params);
  }
  if (now > tooLateMs) {
    return withManualSendFlag({
      applicable: true,
      sent: false,
      status,
      autoFirstSession: autoFirst,
      summaryEs: `${firstHintEs}La ventana automática ya pasó. Aún puedes enviarlo con el botón de abajo.`,
      summaryEn: `${firstHintEn}Automatic send window passed. You can still send it with the button below.`,
    }, params);
  }
  return withManualSendFlag({
    applicable: true,
    sent: false,
    status,
    autoFirstSession: autoFirst,
    summaryEs: `${firstHintEs}Dentro de la ventana de ${hoursBefore}h: se envía solo (~5 min si acabas de agendar), o usa el botón ahora.`,
    summaryEn: `${firstHintEn}Inside the ${hoursBefore}h window: sends automatically (~5 min after booking), or use the button now.`,
  }, params);
}
