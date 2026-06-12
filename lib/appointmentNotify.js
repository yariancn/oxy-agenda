import { digitsOnly } from './ensurePatient.js';
import {
  applyEmailTemplate,
  buildTemplateVars,
  mergeEmailTemplates,
} from './emailTemplates.js';
import { buildCalendarEmailBlock, getAppBaseUrl } from './calendarLinks.js';
import { localeForClinic } from './i18n.js';
import { localizeNotifyFooterText } from './notifySettings.js';

export function toE164Phone(phone, clinicName) {
  const raw = String(phone || '').trim();
  const digits = digitsOnly(raw);
  if (!digits) return '';

  const last10 = digits.slice(-10);
  if (last10.length !== 10) {
    return raw.startsWith('+') ? `+${digits}` : raw;
  }

  // USA: siempre +1 + 10 dígitos (evita +52 guardado por error en pacientes TX)
  if (clinicName === 'Shenandoah') {
    return `+1${last10}`;
  }

  if (raw.startsWith('+')) {
    return `+${digits}`;
  }

  return `+52${last10}`;
}

export function formatNotifyDate(dateStr, locale = 'es') {
  if (!dateStr) return dateStr;
  try {
    const d = new Date(`${dateStr}T12:00:00`);
    return d.toLocaleDateString(locale === 'en' ? 'en-US' : 'es-MX', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  } catch {
    return dateStr;
  }
}

const NOTIFY_HEADINGS = {
  es: {
    first: 'Primera cita',
    booking: 'Confirmación de cita',
    reschedule: 'Cita reprogramada',
    cancel: 'Cita cancelada',
    extraInfo: 'Información importante',
    instructions: 'Indicaciones para tu sesión',
    date: 'Fecha',
    time: 'Hora',
    service: 'Servicio',
    address: 'Ubicación',
    phone: 'Teléfono clínica',
  },
  en: {
    first: 'First appointment',
    booking: 'Appointment confirmation',
    reschedule: 'Appointment rescheduled',
    cancel: 'Appointment cancelled',
    extraInfo: 'Important information',
    instructions: 'Instructions for your session',
    date: 'Date',
    time: 'Time',
    service: 'Service',
    address: 'Location',
    phone: 'Clinic phone',
  },
};

export function buildNotifyContent({
  locale = 'es',
  notifyType = 'booking',
  patientName,
  clinicName,
  clinicDisplayName,
  date,
  time,
  equipment,
  instructions = '',
  address = '',
  clinicPhone = '',
  ticketMessage = '',
  emailTemplates = {},
  instructionsLabel = '',
  durationMins = 60,
  bufferMins = 0,
  baseUrl = getAppBaseUrl(),
}) {
  const effectiveLocale = clinicName ? localeForClinic(clinicName) : locale;
  const es = effectiveLocale !== 'en';
  const labels = NOTIFY_HEADINGS[es ? 'es' : 'en'];
  const displayClinic = clinicDisplayName || clinicName;
  const formattedDate = formatNotifyDate(date, effectiveLocale);
  const footer = localizeNotifyFooterText({
    instructions,
    instructionsLabel,
    ticketMessage,
    locale: effectiveLocale,
  });
  const trimmedInstructions = footer.instructions;
  const type = ['first', 'booking', 'reschedule', 'cancel'].includes(notifyType)
    ? notifyType
    : 'booking';

  const templates = mergeEmailTemplates(emailTemplates, effectiveLocale);
  const typeTemplate = templates[type] || templates.booking;
  const vars = buildTemplateVars({
    patientName,
    clinicDisplayName: displayClinic,
    clinicName,
    date,
    time,
    equipment,
    instructions: trimmedInstructions,
    address,
    clinicPhone,
    formattedDate,
  });

  const subject = applyEmailTemplate(typeTemplate.subject, vars);
  const customBody = applyEmailTemplate(typeTemplate.body, vars);
  const extraInfo = applyEmailTemplate(templates.extraInfo, vars);

  const heading = labels[type] || labels.booking;
  const sessionLabel = footer.instructionsLabel || labels.instructions;

  const instructionBlock = trimmedInstructions
    ? `<div style="background-color: #fffbeb; padding: 15px; border-left: 4px solid #f59e0b; margin: 20px 0; border-radius: 4px;">
         <p style="margin: 0 0 8px; font-size: 11px; font-weight: 800; text-transform: uppercase; color: #92400e;">${escapeHtml(sessionLabel)}</p>
         <p style="margin: 0; color: #78350f; white-space: pre-wrap;">${escapeHtml(trimmedInstructions)}</p>
       </div>`
    : '';

  const extraInfoBlock = extraInfo
    ? `<div style="background-color: #eff6ff; padding: 15px; border-left: 4px solid #3b82f6; margin: 20px 0; border-radius: 4px;">
         <p style="margin: 0 0 8px; font-size: 11px; font-weight: 800; text-transform: uppercase; color: #1e40af;">${labels.extraInfo}</p>
         <p style="margin: 0; color: #1e3a8a; white-space: pre-wrap;">${escapeHtml(extraInfo)}</p>
       </div>`
    : '';

  const detailLines = [
    `<p style="margin: 5px 0;"><strong>📅 ${labels.date}:</strong> ${escapeHtml(formattedDate)}</p>`,
    `<p style="margin: 5px 0;"><strong>⏰ ${labels.time}:</strong> ${escapeHtml(time || '')}</p>`,
    type !== 'cancel'
      ? `<p style="margin: 5px 0;"><strong>🏥 ${labels.service}:</strong> ${escapeHtml(equipment || '')}</p>`
      : '',
    address ? `<p style="margin: 5px 0;"><strong>📍 ${labels.address}:</strong> ${escapeHtml(address)}</p>` : '',
    clinicPhone ? `<p style="margin: 5px 0;"><strong>☎️ ${labels.phone}:</strong> ${escapeHtml(clinicPhone)}</p>` : '',
  ].filter(Boolean).join('');

  const detailsBlock = type === 'cancel'
    ? ''
    : `<div style="background-color: #f8fafc; padding: 15px; border-left: 4px solid #059669; margin: 20px 0; border-radius: 4px;">
         ${detailLines}
       </div>`;

  const ticketLine = footer.ticketMessage
    ? `<p style="margin-top: 16px; font-size: 12px; color: #64748b; font-style: italic;">${escapeHtml(footer.ticketMessage)}</p>`
    : '';

  const calendarBlock = buildCalendarEmailBlock({
    locale: effectiveLocale,
    clinicName,
    clinicDisplayName: displayClinic,
    patientName,
    date,
    time,
    equipment,
    address,
    durationMins,
    bufferMins,
    notifyType: type,
    baseUrl,
  });

  const emailHtml = `
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 10px;">
      <h2 style="color: #0f172a; text-transform: uppercase; font-size: 18px;">${escapeHtml(heading)}</h2>
      <div style="color: #334155; white-space: pre-wrap; line-height: 1.6;">${escapeHtml(customBody).replace(/\n/g, '<br>')}</div>
      ${detailsBlock}
      ${calendarBlock}
      ${extraInfoBlock}
      ${instructionBlock}
      ${ticketLine}
    </div>
  `;

  const smsIntro = {
    first: es ? `Hola ${patientName}, primera cita en ${displayClinic}.` : `Hi ${patientName}, first appointment at ${displayClinic}.`,
    booking: es ? `Hola ${patientName}, cita confirmada en ${displayClinic}.` : `Hi ${patientName}, appointment confirmed at ${displayClinic}.`,
    reschedule: es ? `Hola ${patientName}, cita reprogramada en ${displayClinic}.` : `Hi ${patientName}, appointment rescheduled at ${displayClinic}.`,
    cancel: es ? `Hola ${patientName}, tu cita en ${displayClinic} fue cancelada.` : `Hi ${patientName}, your appointment at ${displayClinic} was cancelled.`,
  };

  const smsParts = [
    smsIntro[type] || smsIntro.booking,
    type !== 'cancel' ? `${formattedDate} ${time || ''}`.trim() : '',
    type !== 'cancel' && equipment ? (es ? `Servicio: ${equipment}` : `Service: ${equipment}`) : '',
    trimmedInstructions
      ? (es ? `Indicaciones: ${trimSmsInstructions(trimmedInstructions)}` : `Instructions: ${trimSmsInstructions(trimmedInstructions)}`)
      : '',
    address && type !== 'cancel' ? (es ? `Ubicación: ${address}` : `Location: ${address}`) : '',
  ].filter(Boolean);

  const smsBody = smsParts.join(' ').slice(0, 1500);

  const whatsappBodyParams = {
    first: [patientName, displayClinic, formattedDate, time || '', equipment || ''],
    booking: [patientName, displayClinic, formattedDate, time || '', equipment || ''],
    reschedule: [patientName, displayClinic, formattedDate, time || '', equipment || ''],
    cancel: [patientName, displayClinic, `${formattedDate} ${time || ''}`.trim()],
  };

  return {
    subject,
    emailHtml,
    smsBody,
    whatsappBodyParams: whatsappBodyParams[type] || whatsappBodyParams.booking,
  };
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function trimSmsInstructions(text) {
  const clean = String(text || '').replace(/\s+/g, ' ').trim();
  if (clean.length <= 220) return clean;
  return `${clean.slice(0, 217)}...`;
}

export async function sendAppointmentNotification({
  patientName,
  phone,
  email,
  date,
  time,
  equipment,
  clinicName,
  clinicDisplayName,
  instructions = '',
  address = '',
  clinicPhone = '',
  ticketMessage = '',
  locale = 'es',
  prefers_email = true,
  prefers_sms = true,
  notifyEnabled = true,
  notifyType = 'booking',
  emailTemplates = {},
  instructionsLabel = '',
  durationMins = 60,
  bufferMins = 0,
  sendEmail = true,
  sendSms = true,
}) {
  if (!notifyEnabled) {
    return { success: true, skipped: true, report: { email: 'Desactivado', sms: 'Desactivado' } };
  }

  if (!sendEmail && !sendSms) {
    return { success: true, skipped: true, report: { email: 'Canal desactivado', sms: 'Canal desactivado' } };
  }

  const response = await fetch('/api/notify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      patientName,
      phone,
      email,
      date,
      time,
      equipment,
      clinicName,
      clinicDisplayName,
      instructions,
      address,
      clinicPhone,
      ticketMessage,
      locale,
      notifyType,
      emailTemplates,
      instructionsLabel,
      durationMins,
      bufferMins,
      type: sendEmail && sendSms ? 'both' : sendEmail ? 'email' : sendSms ? 'sms' : 'both',
      prefers_email: sendEmail && prefers_email !== false,
      prefers_sms: sendSms && prefers_sms !== false,
    }),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.success) {
    throw new Error(data.error || 'Notify request failed');
  }
  return data;
}

export function summarizeNotifyReport(report, locale = 'es') {
  if (!report) return '';
  const es = locale !== 'en';
  const lines = [];
  if (report.email && !/No solicitado|Desactivado|not requested|disabled/i.test(report.email)) {
    lines.push(`${es ? 'Correo' : 'Email'}: ${report.email}`);
  }
  if (report.sms && !/No solicitado|Desactivado|not requested|disabled/i.test(report.sms)) {
    const channel = report.textChannel || 'SMS';
    const dest = report.smsTo ? ` → ${report.smsTo}` : '';
    lines.push(`${channel}${dest}: ${report.sms}`);
  }
  return lines.join('\n');
}

export function notifyHadFailure(report) {
  if (!report) return false;
  return [report.email, report.sms].some(
    (status) => status && (/Error|Falta|error|missing|failed/i.test(status))
      && !/no configurado|not configured/i.test(status),
  );
}

export function notifyWasSent(report) {
  if (!report) return false;
  return [report.email, report.sms].some(
    (status) => status && /Enviado correctamente|Sent successfully/i.test(status),
  );
}

export function formatBookingNotifyFeedback({
  patientResult,
  staffResult,
  locale = 'es',
} = {}) {
  const es = locale !== 'en';
  const lines = [];

  if (patientResult?.skipped) {
    lines.push(`${es ? 'Paciente' : 'Patient'}: ${patientResult.reason}`);
  } else if (patientResult?.report) {
    const summary = summarizeNotifyReport(patientResult.report, locale);
    if (summary) {
      lines.push(summary);
    } else if (notifyWasSent(patientResult.report)) {
      lines.push(es ? 'Paciente: enviado.' : 'Patient: sent.');
    } else if (notifyHadFailure(patientResult.report)) {
      lines.push(es ? 'Paciente: error parcial.' : 'Patient: partial error.');
    } else {
      lines.push(es ? 'Paciente: sin envío (revisa teléfono, correo o preferencias).' : 'Patient: not sent (check phone, email, or preferences).');
    }
  }

  if (staffResult?.skipped) {
    const staffReason = {
      disabled: es ? 'Alertas al equipo desactivadas en Admin.' : 'Staff alerts disabled in Admin.',
      no_recipients: es ? 'Sin teléfonos/correos de staff configurados.' : 'No staff phones/emails configured.',
    }[staffResult.reason];
    if (staffReason) lines.push(`${es ? 'Equipo' : 'Staff'}: ${staffReason}`);
  } else if (staffResult && !staffResult.skipped) {
    lines.push(es ? 'Equipo: alerta enviada (si hay destinatarios).' : 'Staff: alert sent (if recipients configured).');
  }

  return lines.filter(Boolean).join('\n');
}
