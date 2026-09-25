import { getMinutes } from './publicBookingSlots.js';
import { isFirstSessionAppointment } from './emailTemplates.js';
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

export const DEFAULT_GDL_CONFIRMATION_SMS = `Hola {{nombre}}, este mensaje es para confirmar tu sesión hiperbárica {{cuando}} a las {{hora}} en OXYGENGDL (primera sesión).
Agradeceremos respondas a la brevedad con SI o NO?
Tu confirmación nos ayuda a reservar tu espacio con tranquilidad; si no recibimos respuesta, podríamos liberar el horario para quien esté en lista de espera.
Dudas: 33 2166 4083`;

export function defaultConfirmationHoursBefore(clinicName) {
  return isShenandoah(clinicName) ? 6 : 18;
}

export function supportsConfirmationSms(clinicName) {
  const clinicId = normalizeClinicId(clinicName);
  // Houston + GDL (primera sesión). Otras sedes no.
  return isShenandoah(clinicId) || clinicId === 'Oxygengdl';
}

export function parseConfirmationReply(body) {
  const text = String(body || '').trim().toUpperCase();
  if (!text) return null;
  const normalized = text.replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim();
  if (/^(YES|Y|SI|SÍ|CONFIRM|CONFIRMED|OK|1)\b/.test(normalized)) return 'confirmed';
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
}) {
  const phoneDigits = String(clinicPhone || '').replace(/\D/g, '');
  const phone = locale === 'en'
    ? (phoneDigits.slice(-10) || '7135913379')
    : (phoneDigits.length >= 10 ? phoneDigits.slice(-10).replace(/(\d{2})(\d{4})(\d{4})/, '$1 $2 $3') : '33 2166 4083');
  const dayLabel = cuando
    || relativeSessionDayLabel(fullDate, timezone || 'America/Mexico_City', locale);

  const custom = String(customBody || '').trim();
  if (custom) {
    return custom
      .replace(/\{\{nombre\}\}/gi, patientName || '')
      .replace(/\{\{hora\}\}/gi, time || '')
      .replace(/\{\{clinica\}\}/gi, clinicDisplayName || '')
      .replace(/\{\{telefono\}\}/gi, phone)
      .replace(/\{\{cuando\}\}/gi, dayLabel);
  }

  if (locale === 'en') {
    return `Hi ${patientName}, your first session at ${clinicDisplayName} is ${dayLabel} at ${time} (in ~${hoursBefore}h). Reply YES to confirm or NO to cancel. No reply in ${noReplyHours}h may be treated as likely no-show. For any questions, please contact us at ${phone}.`;
  }

  return `Hola ${patientName}, este mensaje es para confirmar tu sesión hiperbárica ${dayLabel} a las ${time} en ${clinicDisplayName || 'OXYGENGDL'} (primera sesión).
Agradeceremos respondas a la brevedad con SI o NO?
Tu confirmación nos ayuda a reservar tu espacio con tranquilidad; si no recibimos respuesta, podríamos liberar el horario para quien esté en lista de espera.
Dudas: ${phone}`;
}

function isBrowserClient() {
  return typeof window !== 'undefined';
}

function hasOutboundSmsCapability(clinicName) {
  if (isShenandoah(clinicName)) return isTwilioConfigured();
  return isMexicoSmsConfigured() || isTwilioConfigured();
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

  return isFirstSessionAppointment({
    isNewPatient: appointment.is_new_patient,
    patientName: appointment.patient,
    patientId: appointment.patient_id || appointment.patientId || null,
    equipment: appointment.equipment,
    appointments: allAppointments,
    excludeAppointmentId: appointment.id,
    fullDate: appointment.full_date || appointment.fullDate,
    time: appointment.time,
  });
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

async function persistConfirmationSent(supabase, appointmentId) {
  const sentAt = new Date().toISOString();
  const payloads = [
    {
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

  const { data: config, error: configErr } = await supabase
    .from('company_config')
    .select('id, name, confirmation_sms_enabled, confirmation_hours_before, confirmation_no_reply_hours, confirmation_sms_body, phone')
    .eq('clinic', clinicId)
    .maybeSingle();
  if (configErr) throw configErr;
  if (config?.confirmation_sms_enabled !== true) {
    return { ok: true, skipped: true, reason: 'disabled' };
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
    .select('id, patient, phone, time, full_date, equipment, check_in_status, is_new_patient, confirmation_status, confirmation_sent_at')
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

    const persisted = await persistConfirmationSent(supabase, appt.id);
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
    appointment: { ...appointment, confirmation_status: CONFIRMATION_STATUS.NONE },
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

  const { data: config, error: configErr } = await supabase
    .from('company_config')
    .select('id, name, confirmation_sms_enabled, confirmation_hours_before, confirmation_no_reply_hours, confirmation_sms_body, phone')
    .eq('clinic', clinicId)
    .maybeSingle();
  if (configErr) return { ok: false, error: configErr.message };
  if (config?.confirmation_sms_enabled !== true) {
    return { ok: false, error: 'disabled' };
  }

  const { data: appt, error: apptErr } = await selectWithColumnFallback(
    (cols) => supabase
      .from('appointments')
      .select(cols)
      .eq('id', appointmentId)
      .maybeSingle(),
    [
      'id', 'patient', 'phone', 'time', 'full_date', 'equipment', 'check_in_status',
      'is_new_patient', 'confirmation_status', 'confirmation_sent_at', 'prefers_sms',
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
    .select('id, patient, phone, time, full_date, equipment, check_in_status, is_new_patient, confirmation_status')
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
  });

  const sms = await sendPatientTextMessage({
    clinicName: clinicId,
    phone: appt.phone,
    smsBody: body,
    notifyType: 'confirmation',
    locale,
  });
  if (!sms.ok) return { ok: false, error: sms.error || 'sms_failed' };

  const persisted = await persistConfirmationSent(supabase, appt.id);
  if (!persisted.ok) {
    return { ok: false, error: persisted.error || 'db_update_failed' };
  }

  return { ok: true, sentAt: persisted.sentAt, appointmentId: appt.id, resent: !!resend };
}

/**
 * If the appointment is already inside the confirmation window (e.g. booked <18h
 * before the visit), send soon after booking. `delayMs` defaults to 15s (serverless-safe).
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
  const { data: config } = await supabase
    .from('company_config')
    .select('confirmation_sms_enabled, confirmation_hours_before')
    .eq('clinic', clinicId)
    .maybeSingle();
  if (config?.confirmation_sms_enabled !== true) {
    return { ok: true, skipped: true, reason: 'disabled' };
  }

  const { data: appt } = await supabase
    .from('appointments')
    .select('id, full_date, time, confirmation_status')
    .eq('id', appointmentId)
    .maybeSingle();
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

  const wait = Math.max(0, Number(delayMs) || 0);
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

/** Texto de diagnóstico para staff (primeras sesiones Houston/GDL). */
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
    return withManualSendFlag({ applicable: true, sent: true, replied: true, status, summaryEs: 'Paciente confirmó por SMS.', summaryEn: 'Patient confirmed via SMS.' }, params);
  }
  if (status === CONFIRMATION_STATUS.DECLINED) {
    return withManualSendFlag({ applicable: true, sent: true, replied: true, status, summaryEs: 'Paciente respondió NO (cita pendiente de liberar por staff).', summaryEn: 'Patient replied NO (slot pending staff release).' }, params);
  }
  if (status === CONFIRMATION_STATUS.NO_RESPONSE) {
    return withManualSendFlag({ applicable: true, sent: true, replied: false, status, summaryEs: 'SMS enviado; aún no ha respondido. El staff libera a discreción.', summaryEn: 'SMS sent; no reply yet. Staff may release the slot at their discretion.' }, params);
  }
  if (status === CONFIRMATION_STATUS.PENDING) {
    return withManualSendFlag({ applicable: true, sent: true, replied: false, status, summaryEs: 'SMS enviado; esperando SI/NO.', summaryEn: 'SMS sent; waiting for YES/NO.' }, params);
  }

  if (companyConfig.confirmation_sms_enabled !== true) {
    return withManualSendFlag({ applicable: true, sent: false, status, summaryEs: 'Confirmación desactivada en Admin → Mensajes.', summaryEn: 'Confirmation disabled in Admin → Messages.' }, params);
  }
  if (!isBrowserClient() && !hasOutboundSmsCapability(clinicId)) {
    return withManualSendFlag({
      applicable: true,
      sent: false,
      status,
      summaryEs: isShenandoah(clinicId) ? 'Twilio no configurado en el servidor.' : 'SMS México (LabsMobile) no configurado.',
      summaryEn: isShenandoah(clinicId) ? 'Twilio not configured on server.' : 'Mexico SMS (LabsMobile) not configured.',
    }, params);
  }
  if (!String(appointment?.phone || '').trim()) {
    return withManualSendFlag({ applicable: true, sent: false, status, summaryEs: 'La cita no tiene teléfono.', summaryEn: 'Appointment has no phone number.' }, params);
  }
  if (!isFirstSessionAppointment({
    isNewPatient: appointment.is_new_patient,
    patientName: appointment.patient,
    patientId: appointment.patient_id || appointment.patientId || null,
    equipment: appointment.equipment,
    appointments: allAppointments,
    excludeAppointmentId: appointment.id,
    fullDate: appointment.full_date || appointment.fullDate,
    time: appointment.time,
  })) {
    return withManualSendFlag({
      applicable: true,
      sent: false,
      status,
      summaryEs: 'No es la primera sesión (solo aplica a la primera cita).',
      summaryEn: 'Not the first session (confirmation is first-visit only).',
    }, params);
  }
  if (!ACTIVE_STATUSES.has(appointment?.check_in_status || 'Agendado')) {
    return withManualSendFlag({ applicable: true, sent: false, status, summaryEs: `Estatus «${appointment?.check_in_status}» — no aplica envío.`, summaryEn: `Status «${appointment?.check_in_status}» — send not applicable.` }, params);
  }

  const timezone = getClinicTimezone(clinicId);
  const hoursBefore = Number(companyConfig.confirmation_hours_before) || defaultConfirmationHoursBefore(clinicId);
  const startMs = appointmentStartMs(appointment.full_date, appointment.time, timezone);
  if (!startMs) {
    return withManualSendFlag({ applicable: true, sent: false, status, summaryEs: 'Fecha u hora inválida en la cita.', summaryEn: 'Invalid date or time on appointment.' }, params);
  }
  const sendAtMs = startMs - hoursBefore * 60 * 60 * 1000;
  const tooLateMs = startMs - 30 * 60 * 1000;
  if (now < sendAtMs) {
    const when = new Date(sendAtMs).toLocaleString(localeForClinic(clinicId) === 'en' ? 'en-US' : 'es-MX', {
      timeZone: timezone,
      hour: 'numeric',
      minute: '2-digit',
      day: 'numeric',
      month: 'short',
    });
    return withManualSendFlag({ applicable: true, sent: false, status, summaryEs: `Aún no toca enviar (programado ~${when}, ${hoursBefore}h antes).`, summaryEn: `Not time to send yet (scheduled ~${when}, ${hoursBefore}h before).` }, params);
  }
  if (now > tooLateMs) {
    return withManualSendFlag({ applicable: true, sent: false, status, summaryEs: 'Ventana automática ya pasó. Usa «Enviar confirmación ahora» si aún aplica.', summaryEn: 'Automatic send window passed. Use «Send confirmation now» if still applicable.' }, params);
  }
  return withManualSendFlag({ applicable: true, sent: false, status, summaryEs: 'Debería enviarse en la próxima revisión automática (o poco después si se agendó dentro de la ventana).', summaryEn: 'Should send on the next automatic check (or shortly after if booked inside the window).' }, params);
}
