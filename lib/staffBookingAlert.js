import { toE164Phone, formatNotifyDate } from './appointmentNotify.js';
import { resolveNotifyClinicDisplayName } from './clinicRegistry.js';
import { getResendApiKey, getResendFromAddress } from './resendConfig.js';
import { sendStaffTextMessages } from './clinicMessaging.js';

export const STAFF_ALERT_FIELDS = [
  'notify_staff_on_booking',
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

/** Combina teléfonos/correos de company_config con empleados activos que tengan alertas activas. */
export function mergeStaffAlertRecipients(companyConfig = {}, staffRoster = [], clinicName) {
  const phones = parseStaffPhones(companyConfig.staff_alert_phones, clinicName);
  const emails = parseStaffEmails(companyConfig.staff_alert_emails);

  for (const member of staffRoster || []) {
    if (member?.is_active === false) continue;
    if (member?.notify_on_booking === false) continue;

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
    ? `Nueva cita — ${clinic}`
    : `New appointment — ${clinic}`;

  const promoLine = promoterCode
    ? (es ? `\nPromotor: ${promoterCode}` : `\nPromoter: ${promoterCode}`)
    : '';

  const smsBody = es
    ? `Nueva cita (${sourceLabel}). ${patientName}. ${formattedDate} ${time}. ${equipment || ''}.${promoLine}`.trim()
    : `New appt (${sourceLabel}). ${patientName}. ${formattedDate} ${time}. ${equipment || ''}.${promoLine}`.trim();

  const emailHtml = `
    <div style="font-family:sans-serif;max-width:520px;padding:16px;">
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
}) {
  if (companyConfig.notify_staff_on_booking !== true) {
    return { skipped: true, reason: 'disabled' };
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
