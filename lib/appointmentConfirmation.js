import { getMinutes } from './publicBookingSlots.js';
import { isFirstSessionAppointment } from './emailTemplates.js';
import { getClinicTimezone, isShenandoah, normalizeClinicId } from './clinicRegistry.js';
import { sendTwilioSms, isTwilioConfigured } from './clinicMessaging.js';
import { toE164Phone } from './appointmentNotify.js';

export const CONFIRMATION_STATUS = {
  NONE: 'none',
  PENDING: 'pending',
  CONFIRMED: 'confirmed',
  DECLINED: 'declined',
  NO_RESPONSE: 'no_response_likely',
};

const ACTIVE_STATUSES = new Set(['Agendado', 'Llegó', 'En Sesión']);

export function parseConfirmationReply(body) {
  const text = String(body || '').trim().toUpperCase();
  if (!text) return null;
  const normalized = text.replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim();
  if (/^(YES|Y|SI|SÍ|CONFIRM|CONFIRMED|OK|1)\b/.test(normalized)) return 'confirmed';
  if (/^(NO|N|CANCEL|CANCELLED|CANCELED|2)\b/.test(normalized)) return 'declined';
  return null;
}

export function appointmentStartMs(fullDate, timeStr, timezone) {
  if (!fullDate || !timeStr) return null;
  const mins = getMinutes(timeStr);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  const localIso = `${fullDate}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`;
  const probe = new Date(localIso);
  const utcGuess = probe.getTime();
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const parts = Object.fromEntries(
    formatter.formatToParts(probe).filter((p) => p.type !== 'literal').map((p) => [p.type, p.value]),
  );
  const shown = `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:00`;
  const offset = probe.getTime() - new Date(shown).getTime();
  return new Date(localIso).getTime() - offset;
}

export function buildConfirmationSms({
  patientName,
  time,
  clinicDisplayName,
  hoursBefore = 6,
  noReplyHours = 1,
  customBody = '',
  locale = 'en',
}) {
  const custom = String(customBody || '').trim();
  if (custom) {
    return custom
      .replace(/\{\{nombre\}\}/gi, patientName || '')
      .replace(/\{\{hora\}\}/gi, time || '')
      .replace(/\{\{clinica\}\}/gi, clinicDisplayName || '');
  }
  if (locale === 'en') {
    return `Hi ${patientName}, your first session at ${clinicDisplayName} is at ${time} (in ~${hoursBefore}h). Reply YES to confirm or NO to cancel. No reply in ${noReplyHours}h may be treated as likely no-show.`;
  }
  return `Hola ${patientName}, tu primera sesión en ${clinicDisplayName} es a las ${time} (en ~${hoursBefore}h). Responde SI para confirmar o NO para cancelar.`;
}

export function isEligibleConfirmationAppointment({
  appointment,
  allAppointments = [],
  companyConfig = {},
  clinicName,
}) {
  if (!isShenandoah(clinicName)) return false;
  if (companyConfig.confirmation_sms_enabled !== true) return false;
  if (!isTwilioConfigured()) return false;
  if (!ACTIVE_STATUSES.has(appointment.check_in_status || 'Agendado')) return false;
  if (appointment.confirmation_status && appointment.confirmation_status !== CONFIRMATION_STATUS.NONE) {
    return false;
  }
  const phone = String(appointment.phone || appointment.Phone || '').trim();
  if (!phone) return false;

  return isFirstSessionAppointment({
    isNewPatient: appointment.is_new_patient,
    patientName: appointment.patient,
    equipment: appointment.equipment,
    appointments: allAppointments,
    excludeAppointmentId: appointment.id,
  });
}

export function digitsMatch(a, b) {
  const da = String(a || '').replace(/\D/g, '').slice(-10);
  const db = String(b || '').replace(/\D/g, '').slice(-10);
  return da.length >= 10 && da === db;
}

export function findPendingConfirmationByPhone({ appointments, phone, timezone, clinicName }) {
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

export async function runAppointmentConfirmationCron({ supabase, clinicName }) {
  const clinicId = normalizeClinicId(clinicName);
  if (!isShenandoah(clinicId)) {
    return { ok: true, skipped: true, reason: 'not_houston' };
  }

  const timezone = getClinicTimezone(clinicId);
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

  const hoursBefore = Number(config.confirmation_hours_before) || 6;
  const noReplyHours = Number(config.confirmation_no_reply_hours) || 1;
  const windowMs = 12 * 60 * 1000;
  const targetMs = hoursBefore * 60 * 60 * 1000;

  const fromDate = new Date(now);
  fromDate.setDate(fromDate.getDate() - 1);
  const toDate = new Date(now);
  toDate.setDate(toDate.getDate() + 2);
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
  const clinicDisplay = config.name || 'OxyHyperbaric';
  let sent = 0;
  let noReply = 0;
  const errors = [];

  for (const appt of all) {
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
    if (appt.prefers_sms === false) continue;

    const startMs = appointmentStartMs(appt.full_date, appt.time, timezone);
    if (!startMs) continue;
    const delta = startMs - now;
    if (delta < targetMs - windowMs / 2 || delta > targetMs + windowMs / 2) continue;

    const to = toE164Phone(appt.phone, clinicId);
    if (!to) continue;

    const body = buildConfirmationSms({
      patientName: appt.patient,
      time: appt.time,
      clinicDisplayName: clinicDisplay,
      hoursBefore,
      noReplyHours,
      customBody: config.confirmation_sms_body,
      locale: 'en',
    });

    const sms = await sendTwilioSms({ to, body });
    if (!sms.ok) {
      errors.push({ id: appt.id, error: sms.error });
      continue;
    }

    const { error } = await supabase
      .from('appointments')
      .update({
        confirmation_status: CONFIRMATION_STATUS.PENDING,
        confirmation_sent_at: new Date().toISOString(),
      })
      .eq('id', appt.id);
    if (error) errors.push({ id: appt.id, error: error.message });
    else sent += 1;
  }

  return { ok: true, clinic: clinicId, sent, noReply, errors };
}

export function confirmationStatusLabel(status, locale = 'en') {
  const map = locale === 'en'
    ? {
        none: '',
        pending: 'Pending',
        confirmed: 'Confirmed',
        declined: 'Declined',
        no_response_likely: 'Likely no-show',
      }
    : {
        none: '',
        pending: 'Pendiente',
        confirmed: 'Confirmada',
        declined: 'Declinó',
        no_response_likely: 'Probable falta',
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
      return 'bg-slate-100 text-slate-700 border-slate-300';
    default:
      return 'bg-slate-50 text-slate-500 border-slate-200';
  }
}
