import { toE164Phone, formatNotifyDate } from './appointmentNotify.js';
import { resolveNotifyClinicDisplayName } from './clinicRegistry.js';
import { getResendApiKey, getResendFromAddress } from './resendConfig.js';
import { sendStaffTextMessages } from './clinicMessaging.js';

export const STAFF_ALERT_FIELDS = [
  'notify_staff_on_booking',
  'staff_alert_first_sessions_only',
  'staff_alert_phones',
  'staff_alert_emails',
];

export function parseRecipientList(raw) {
  return String(raw || '')
    .split(/[,;\n]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function parseStaffPhones(raw, clinicName) {
  const items = parseRecipientList(raw);
  const phones = [];
  for (const item of items) {
    const e164 = toE164Phone(item, clinicName);
    if (e164) phones.push(e164);
  }
  return [...new Set(phones)];
}

export function parseStaffEmails(raw) {
  return [...new Set(
    parseRecipientList(raw)
      .map((e) => e.toLowerCase())
      .filter((e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)),
  )];
}

/** Combina teléfonos/correos de company_config con empleados que activaron alertas individuales. */
export function mergeStaffAlertRecipients(companyConfig = {}, staffRoster = [], clinicName) {
  const phones = parseStaffPhones(companyConfig.staff_alert_phones, clinicName);
  const emails = parseStaffEmails(companyConfig.staff_alert_emails);

  for (const member of staffRoster || []) {
    if (member?.is_active === false) continue;
    if (member?.notify_on_booking !== true) continue;

    const e164 = toE164Phone(member.phone, clinicName);
    if (e164) phones.push(e164);

    const em = String(member.email || '').trim().toLowerCase();
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) emails.push(em);
  }

  return {
    phones: [...new Set(phones)],
    emails: [...new Set(emails)],
  };
}

export function buildStaffBookingAlertContent({
  locale = 'es',
  patientName,
  date,
  time,
  equipment,
  clinicName,
  clinicDisplayName,
  source = 'public',
  promoterCode = '',
  isFirstSession = false,
}) {
  const es = locale !== 'en';
  const formattedDate = formatNotifyDate(date, locale);
  const clinic = resolveNotifyClinicDisplayName(clinicName, clinicDisplayName) || (es ? 'Clínica' : 'Clinic');

  const sourceLabel = {
    public: es ? 'Portal web' : 'Web booking',
    staff: es ? 'Agenda staff' : 'Staff calendar',
    promoter: es ? 'Referido / promotor' : 'Promoter referral',
  }[source] || source;

  const subject = es
    ? `[Equipo] Nueva cita — ${clinic}`
    : `[Staff] New appointment — ${clinic}`;

  const promoLine = promoterCode
    ? (es ? `\nPromotor: ${promoterCode}` : `\nPromoter: ${promoterCode}`)
    : '';

  const firstLine = isFirstSession
    ? (es ? '⭐ Primera sesión. ' : '⭐ First session. ')
    : '';

  const smsBody = es
    ? `[EQUIPO] ${firstLine}Nueva cita (${sourceLabel}). ${patientName}. ${formattedDate} ${time}. ${equipment || ''}.${promoLine}`.trim()
    : `[STAFF] ${firstLine}New appt (${sourceLabel}). ${patientName}. ${formattedDate} ${time}. ${equipment || ''}.${promoLine}`.trim();

  const emailHtml = `
    <div style="font-family:sans-serif;max-width:520px;padding:16px;">
      <p style="margin:0 0 10px;font-size:11px;font-weight:800;letter-spacing:.05em;text-transform:uppercase;color:#b45309;">
        ${es ? 'Alerta interna del equipo (no es para el paciente)' : 'Internal staff alert (not for the patient)'}
      </p>
      <h2 style="margin:0 0 12px;font-size:16px;text-transform:uppercase;">${es ? 'Nueva cita agendada' : 'New appointment booked'}</h2>
      <p style="margin:0 0 8px;"><strong>${es ? 'Origen' : 'Source'}:</strong> ${sourceLabel}${promoterCode ? ` · ${promoterCode}` : ''}</p>
      <p style="margin:0 0 8px;"><strong>${es ? 'Paciente' : 'Patient'}:</strong> ${escapeHtml(patientName)}</p>
      <p style="margin:0 0 8px;"><strong>${es ? 'Fecha' : 'Date'}:</strong> ${escapeHtml(formattedDate)}</p>
      <p style="margin:0 0 8px;"><strong>${es ? 'Hora' : 'Time'}:</strong> ${escapeHtml(time || '')}</p>
      <p style="margin:0;"><strong>${es ? 'Servicio' : 'Service'}:</strong> ${escapeHtml(equipment || '')}</p>
    </div>
  `;

  const whatsappBodyParams = [
    sourceLabel,
    patientName,
    formattedDate,
    time || '',
    equipment || '',
  ];

  return {
    subject,
    smsBody: smsBody.slice(0, 1500),
    emailHtml,
    whatsappBodyParams,
  };
}

export function buildStaffCancelRequestAlertContent({
  locale = 'es',
  patientName,
  date,
  time,
  equipment,
  clinicName,
  clinicDisplayName,
  source = 'manage',
}) {
  const es = locale !== 'en';
  const formattedDate = formatNotifyDate(date, locale);
  const clinic = resolveNotifyClinicDisplayName(clinicName, clinicDisplayName) || (es ? 'Clínica' : 'Clinic');
  const viaSms = source === 'sms_no';

  const subject = viaSms
    ? (es ? `SMS NO — cancelación pendiente — ${clinic}` : `SMS NO — cancel pending — ${clinic}`)
    : (es ? `Cancelación pendiente — ${clinic}` : `Cancellation pending approval — ${clinic}`);

  const smsBody = viaSms
    ? (es
      ? `⚠️ Paciente contestó NO por SMS. Cancelación pendiente de aprobar. ${patientName}. ${formattedDate} ${time}. ${equipment || ''}. Revisa la agenda.`
      : `⚠️ Patient replied NO by SMS. Cancellation pending approval. ${patientName}. ${formattedDate} ${time}. ${equipment || ''}. Check the calendar.`)
    : (es
      ? `⚠️ Cancelación ONLINE pendiente de aprobar. ${patientName}. ${formattedDate} ${time}. ${equipment || ''}. Revisa la agenda.`
      : `⚠️ ONLINE cancel pending approval. ${patientName}. ${formattedDate} ${time}. ${equipment || ''}. Check the calendar.`);

  const intro = viaSms
    ? (es
      ? 'El paciente contestó NO al SMS de confirmación. La cita sigue en el calendario hasta que apruebes la cancelación (o rechaces la solicitud).'
      : 'The patient replied NO to the confirmation SMS. The appointment stays on the calendar until you approve the cancellation (or reject the request).')
    : (es
      ? 'El paciente solicitó cancelar en línea. La cita sigue en el calendario hasta que apruebes o rechaces.'
      : 'The patient requested an online cancellation. The appointment stays on the calendar until you approve or reject.');

  const emailHtml = `
    <div style="font-family:sans-serif;max-width:520px;padding:16px;">
      <h2 style="margin:0 0 12px;font-size:16px;text-transform:uppercase;">${viaSms
        ? (es ? 'Contestó NO por SMS — pendiente de aprobar' : 'Replied NO by SMS — pending approval')
        : (es ? 'Cancelación pendiente de aprobar' : 'Cancellation pending approval')}</h2>
      <p style="margin:0 0 8px;">${intro}</p>
      <p style="margin:0 0 8px;"><strong>${es ? 'Paciente' : 'Patient'}:</strong> ${escapeHtml(patientName)}</p>
      <p style="margin:0 0 8px;"><strong>${es ? 'Fecha' : 'Date'}:</strong> ${escapeHtml(formattedDate)}</p>
      <p style="margin:0 0 8px;"><strong>${es ? 'Hora' : 'Time'}:</strong> ${escapeHtml(time || '')}</p>
      <p style="margin:0;"><strong>${es ? 'Servicio' : 'Service'}:</strong> ${escapeHtml(equipment || '')}</p>
    </div>
  `;

  return {
    subject,
    smsBody: smsBody.slice(0, 1500),
    emailHtml,
    whatsappBodyParams: [
      viaSms
        ? (es ? 'SMS NO — pendiente' : 'SMS NO — pending')
        : (es ? 'Cancelación pendiente' : 'Cancel pending'),
      patientName,
      formattedDate,
      time || '',
      equipment || '',
    ],
  };
}

export function buildStaffConfirmationReplyAlertContent({
  locale = 'en',
  patientName,
  date,
  time,
  equipment,
  clinicName,
  clinicDisplayName,
  reply = 'confirmed',
  replyText = '',
}) {
  const es = locale !== 'en';
  const formattedDate = formatNotifyDate(date, locale);
  const clinic = resolveNotifyClinicDisplayName(clinicName, clinicDisplayName) || (es ? 'Clínica' : 'Clinic');
  const yes = reply === 'confirmed';
  const raw = String(replyText || '').trim().slice(0, 40);

  const subject = yes
    ? (es ? `SMS SI — confirmó asistencia — ${clinic}` : `SMS YES — confirmed attendance — ${clinic}`)
    : (es ? `SMS NO — cancelación pendiente — ${clinic}` : `SMS NO — cancel pending — ${clinic}`);

  const smsBody = yes
    ? (es
      ? `✅ Paciente contestó SI por SMS. ${patientName}. ${formattedDate} ${time}. ${equipment || ''}.${raw ? ` Respuesta: "${raw}"` : ''}`
      : `✅ Patient replied YES by SMS. ${patientName}. ${formattedDate} ${time}. ${equipment || ''}.${raw ? ` Reply: "${raw}"` : ''}`)
    : (es
      ? `⚠️ Paciente contestó NO por SMS. Cancelación pendiente. ${patientName}. ${formattedDate} ${time}. ${equipment || ''}.${raw ? ` Respuesta: "${raw}"` : ''}`
      : `⚠️ Patient replied NO by SMS. Cancellation pending. ${patientName}. ${formattedDate} ${time}. ${equipment || ''}.${raw ? ` Reply: "${raw}"` : ''}`);

  const emailHtml = `
    <div style="font-family:sans-serif;max-width:520px;padding:16px;">
      <h2 style="margin:0 0 12px;font-size:16px;text-transform:uppercase;">${
        yes
          ? (es ? 'Confirmó por SMS (SI)' : 'Confirmed by SMS (YES)')
          : (es ? 'Contestó NO por SMS' : 'Replied NO by SMS')
      }</h2>
      <p style="margin:0 0 8px;"><strong>${es ? 'Paciente' : 'Patient'}:</strong> ${escapeHtml(patientName)}</p>
      <p style="margin:0 0 8px;"><strong>${es ? 'Fecha' : 'Date'}:</strong> ${escapeHtml(formattedDate)}</p>
      <p style="margin:0 0 8px;"><strong>${es ? 'Hora' : 'Time'}:</strong> ${escapeHtml(time || '')}</p>
      <p style="margin:0 0 8px;"><strong>${es ? 'Servicio' : 'Service'}:</strong> ${escapeHtml(equipment || '')}</p>
      ${raw ? `<p style="margin:0;"><strong>${es ? 'Respuesta' : 'Reply'}:</strong> ${escapeHtml(raw)}</p>` : ''}
    </div>
  `;

  return {
    subject,
    smsBody: smsBody.slice(0, 1500),
    emailHtml,
    whatsappBodyParams: [
      yes ? (es ? 'SMS SI' : 'SMS YES') : (es ? 'SMS NO' : 'SMS NO'),
      patientName,
      formattedDate,
      time || '',
      equipment || '',
    ],
  };
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export async function sendStaffEmails({ emails, subject, emailHtml, clinicName }) {
  const resendKey = getResendApiKey();
  if (!resendKey) return { ok: false, error: 'Missing RESEND_API_KEY' };

  const fromEmail = getResendFromAddress(clinicName);
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${resendKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: fromEmail,
      to: emails,
      subject,
      html: emailHtml,
    }),
  });

  return { ok: res.ok, count: emails.length };
}

export async function dispatchStaffBookingAlert({
  companyConfig = {},
  staffRoster = [],
  clinicName,
  clinicDisplayName,
  patientName,
  date,
  time,
  equipment,
  locale = 'es',
  source = 'public',
  promoterCode = '',
  isFirstSession = false,
}) {
  if (companyConfig.notify_staff_on_booking !== true) {
    return { skipped: true, reason: 'disabled' };
  }

  if (companyConfig.staff_alert_first_sessions_only === true && !isFirstSession) {
    return { skipped: true, reason: 'first_sessions_only' };
  }

  const { phones, emails } = mergeStaffAlertRecipients(companyConfig, staffRoster, clinicName);
  if (!phones.length && !emails.length) {
    return { skipped: true, reason: 'no_recipients' };
  }

  const { subject, smsBody, emailHtml, whatsappBodyParams } = buildStaffBookingAlertContent({
    locale,
    patientName,
    date,
    time,
    equipment,
    clinicName,
    clinicDisplayName,
    source,
    promoterCode,
    isFirstSession,
  });

  const report = { sms: null, email: null };

  if (phones.length) {
    report.sms = await sendStaffTextMessages({
      phones,
      smsBody,
      clinicName,
      whatsappBodyParams,
      locale,
    });
  }
  if (emails.length) {
    report.email = await sendStaffEmails({
      emails,
      subject,
      emailHtml,
      clinicName,
    });
  }

  return { skipped: false, report };
}

/**
 * Always notify staff when a patient requests online cancel (if recipients exist).
 * Does not require notify_staff_on_booking — cancel requests are always important.
 */
export async function dispatchStaffCancelRequestAlert({
  companyConfig = {},
  staffRoster = [],
  clinicName,
  clinicDisplayName,
  patientName,
  date,
  time,
  equipment,
  locale = 'es',
  source = 'manage',
}) {
  const { phones, emails } = mergeStaffAlertRecipients(companyConfig, staffRoster, clinicName);
  if (!phones.length && !emails.length) {
    return { skipped: true, reason: 'no_recipients' };
  }

  const { subject, smsBody, emailHtml, whatsappBodyParams } = buildStaffCancelRequestAlertContent({
    locale,
    patientName,
    date,
    time,
    equipment,
    clinicName,
    clinicDisplayName,
    source,
  });

  const report = { sms: null, email: null };

  if (phones.length) {
    report.sms = await sendStaffTextMessages({
      phones,
      smsBody,
      clinicName,
      whatsappBodyParams,
      locale,
    });
  }
  if (emails.length) {
    report.email = await sendStaffEmails({
      emails,
      subject,
      emailHtml,
      clinicName,
    });
  }

  return { skipped: false, report };
}

/**
 * Notify staff immediately when a patient replies YES/NO to Houston confirmation SMS.
 * Always fires if recipients exist (does not require notify_staff_on_booking).
 */
export async function dispatchStaffConfirmationReplyAlert({
  companyConfig = {},
  staffRoster = [],
  clinicName,
  clinicDisplayName,
  patientName,
  date,
  time,
  equipment,
  locale = 'en',
  reply = 'confirmed',
  replyText = '',
}) {
  const { phones, emails } = mergeStaffAlertRecipients(companyConfig, staffRoster, clinicName);
  if (!phones.length && !emails.length) {
    return { skipped: true, reason: 'no_recipients' };
  }

  const { subject, smsBody, emailHtml, whatsappBodyParams } = buildStaffConfirmationReplyAlertContent({
    locale,
    patientName,
    date,
    time,
    equipment,
    clinicName,
    clinicDisplayName,
    reply,
    replyText,
  });

  const report = { sms: null, email: null };

  if (phones.length) {
    report.sms = await sendStaffTextMessages({
      phones,
      smsBody,
      clinicName,
      whatsappBodyParams,
      locale,
    });
  }
  if (emails.length) {
    report.email = await sendStaffEmails({
      emails,
      subject,
      emailHtml,
      clinicName,
    });
  }

  return { skipped: false, report };
}

export async function notifyStaffNewBooking(payload) {
  const response = await fetch('/api/staff-notify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || 'Staff notify failed');
  }
  return data;
}
