import { digitsOnly } from './ensurePatient.js';
import { isGdlCluster, isShenandoah, resolveNotifyClinicDisplayName } from './clinicRegistry.js';
import {
  applyEmailTemplate,
  buildTemplateVars,
  mergeEmailTemplates,
} from './emailTemplates.js';
import { buildCalendarEmailBlock, getAppBaseUrl } from './calendarLinks.js';
import {
  buildLocationTemplateVars,
  formatLocationForEmailHtml,
  formatLocationForSms,
} from './clinicLocation.js';
import { localeForClinic } from './i18n.js';
import { localizeNotifyFooterText } from './notifySettings.js';
import { buildManageEmailBlock } from './appointmentManageToken.js';

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

/** Display: 33 2166 4083 */
export function formatMexPhoneDisplay(phone) {
  const last10 = digitsOnly(phone).slice(-10);
  if (last10.length !== 10) return String(phone || '').trim();
  return `${last10.slice(0, 2)} ${last10.slice(2, 6)} ${last10.slice(6)}`;
}

function buildGuadalajaraSmsFooter({ clinicPhone, locale = 'es' }) {
  const phone = formatMexPhoneDisplay(clinicPhone || '3321664083');
  if (locale === 'en') {
    return `For any appointment-related matters please contact us at ${phone}`;
  }
  return `Cualquier asunto relacionado con tus citas favor de comunicarte al ${phone}`;
}

/** Plain 10-digit US display for SMS footers: 7135913379 */
export function formatUsPhoneDisplay(phone) {
  const last10 = digitsOnly(phone).slice(-10);
  if (last10.length !== 10) return String(phone || '').trim();
  return last10;
}

/** Canonical Houston patient-contact line (always this number). */
export const HOUSTON_CONTACT_PHONE = '7135913379';

function buildShenandoahSmsFooter({ clinicPhone, locale = 'en' } = {}) {
  const phone = formatUsPhoneDisplay(clinicPhone || HOUSTON_CONTACT_PHONE) || HOUSTON_CONTACT_PHONE;
  if (locale === 'en') {
    return `For any questions, please contact us at ${phone}.`;
  }
  return `Para cualquier duda, comunícate al ${phone}.`;
}

export function buildHoustonContactEmailFooter({ clinicPhone, locale = 'en' } = {}) {
  const phone = formatUsPhoneDisplay(clinicPhone || HOUSTON_CONTACT_PHONE) || HOUSTON_CONTACT_PHONE;
  const safe = String(phone)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
  if (locale === 'en') {
    return `For any questions, please contact us at <strong>${safe}</strong>.`;
  }
  return `Para cualquier duda, comunícate al <strong>${safe}</strong>.`;
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
    reminder: 'Recordatorio de cita',
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
    reminder: 'Appointment reminder',
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
  mapsUrl = '',
  clinicPhone = '',
  ticketMessage = '',
  emailTemplates = {},
  instructionsLabel = '',
  sessionInstructionsUrl = '',
  durationMins = 60,
  bufferMins = 0,
  smsIntros = {},
  baseUrl = getAppBaseUrl(),
  appointmentId = '',
  cancelLimitHours = 24,
}) {
  const effectiveLocale = clinicName ? localeForClinic(clinicName) : locale;
  const es = effectiveLocale !== 'en';
  const labels = NOTIFY_HEADINGS[es ? 'es' : 'en'];
  const displayClinic = resolveNotifyClinicDisplayName(clinicName, clinicDisplayName);
  const formattedDate = formatNotifyDate(date, effectiveLocale);
  const footer = localizeNotifyFooterText({
    instructions,
    instructionsLabel,
    ticketMessage,
    locale: effectiveLocale,
  });
  const trimmedInstructions = footer.instructions;
  const type = ['first', 'booking', 'reschedule', 'cancel', 'reminder'].includes(notifyType)
    ? notifyType
    : 'booking';

  const templates = mergeEmailTemplates(emailTemplates, effectiveLocale);
  const typeTemplate = templates[type] || templates.booking;
  const locationVars = buildLocationTemplateVars({ address, mapsUrl });
  const vars = buildTemplateVars({
    patientName,
    clinicDisplayName: displayClinic,
    clinicName,
    date,
    time,
    equipment,
    instructions: trimmedInstructions,
    address,
    mapsUrl,
    clinicPhone,
    formattedDate,
  });

  const subject = applyEmailTemplate(typeTemplate.subject, vars);
  const customBody = applyEmailTemplate(typeTemplate.body, vars);
  const extraInfo = applyEmailTemplate(templates.extraInfo, vars);

  const heading = labels[type] || labels.booking;
  const sessionLabel = footer.instructionsLabel || labels.instructions;
  const showFirstInstructions = type === 'first';
  const instructionsUrl = showFirstInstructions
    ? String(sessionInstructionsUrl || '').trim()
    : '';

  const instructionBlock = (trimmedInstructions || instructionsUrl)
    ? `<div style="background-color: #fffbeb; padding: 15px; border-left: 4px solid #f59e0b; margin: 20px 0; border-radius: 4px;">
         <p style="margin: 0 0 8px; font-size: 11px; font-weight: 800; text-transform: uppercase; color: #92400e;">${escapeHtml(sessionLabel)}</p>
         ${trimmedInstructions
           ? `<p style="margin: 0 0 ${instructionsUrl ? '12px' : '0'}; color: #78350f; white-space: pre-wrap;">${escapeHtml(trimmedInstructions)}</p>`
           : ''}
         ${instructionsUrl
           ? `<p style="margin: 0;">
                <a href="${escapeHtml(instructionsUrl)}" style="display:inline-block;background:#d97706;color:#fff;text-decoration:none;font-weight:800;font-size:13px;padding:10px 14px;border-radius:8px;">
                  ${es ? 'Leer indicaciones de la sesión' : 'Read session instructions'}
                </a>
              </p>
              <p style="margin: 8px 0 0; font-size: 12px; color: #92400e; word-break: break-all;">${escapeHtml(instructionsUrl)}</p>`
           : ''}
       </div>`
    : '';

  const extraInfoBlock = extraInfo
    ? `<div style="background-color: #eff6ff; padding: 15px; border-left: 4px solid #3b82f6; margin: 20px 0; border-radius: 4px;">
         <p style="margin: 0 0 8px; font-size: 11px; font-weight: 800; text-transform: uppercase; color: #1e40af;">${labels.extraInfo}</p>
         <p style="margin: 0; color: #1e3a8a; white-space: pre-wrap;">${escapeHtml(extraInfo)}</p>
       </div>`
    : '';

  const detailClinicPhone = isShenandoah(clinicName)
    ? (formatUsPhoneDisplay(clinicPhone) || HOUSTON_CONTACT_PHONE)
    : clinicPhone;
  const detailLines = [
    `<p style="margin: 5px 0;"><strong>📅 ${labels.date}:</strong> ${escapeHtml(formattedDate)}</p>`,
    `<p style="margin: 5px 0;"><strong>⏰ ${labels.time}:</strong> ${escapeHtml(time || '')}</p>`,
    type !== 'cancel'
      ? `<p style="margin: 5px 0;"><strong>🏥 ${labels.service}:</strong> ${escapeHtml(equipment || '')}</p>`
      : '',
    type !== 'cancel'
      ? formatLocationForEmailHtml({
          address: locationVars.direccion,
          mapsUrl: locationVars.ubicacion_link,
          label: labels.address,
          locale: effectiveLocale,
        })
      : '',
    detailClinicPhone ? `<p style="margin: 5px 0;"><strong>☎️ ${labels.phone}:</strong> ${escapeHtml(detailClinicPhone)}</p>` : '',
  ].filter(Boolean).join('');

  const detailsBlock = detailLines
    ? `<div style="background-color: #f8fafc; padding: 15px; border-left: 4px solid #059669; margin: 20px 0; border-radius: 4px;">
         ${detailLines}
       </div>`
    : '';

  const ticketLine = footer.ticketMessage
    ? `<p style="margin-top: 16px; font-size: 12px; color: #64748b; font-style: italic;">${escapeHtml(footer.ticketMessage)}</p>`
    : '';

  const houstonContactPhone = isShenandoah(clinicName)
    ? (formatUsPhoneDisplay(clinicPhone) || HOUSTON_CONTACT_PHONE)
    : clinicPhone;
  const contactFooter = isShenandoah(clinicName)
    ? `<p style="margin-top: 20px; padding: 12px 14px; background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; color: #14532d; font-size: 14px; line-height: 1.5;">${buildHoustonContactEmailFooter({ clinicPhone: houstonContactPhone, locale: effectiveLocale })}</p>`
    : '';

  const calendarBlock = type === 'cancel' ? '' : buildCalendarEmailBlock({
    locale: effectiveLocale,
    clinicName,
    clinicDisplayName: displayClinic,
    patientName,
    date,
    time,
    equipment,
    address: locationVars.direccion,
    mapsUrl: locationVars.ubicacion_link,
    durationMins,
    bufferMins,
    notifyType: type,
    baseUrl,
  });

  const manageBlock = buildManageEmailBlock({
    appointmentId,
    clinicName,
    clinicPhone: isShenandoah(clinicName) ? houstonContactPhone : clinicPhone,
    locale: effectiveLocale,
    cancelLimitHours,
    baseUrl,
    notifyType: type,
  });

  const emailHtml = `
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 10px;">
      <h2 style="color: #0f172a; text-transform: uppercase; font-size: 18px;">${escapeHtml(heading)}</h2>
      <div style="color: #334155; white-space: pre-wrap; line-height: 1.6;">${escapeHtml(customBody).replace(/\n/g, '<br>')}</div>
      ${detailsBlock}
      ${calendarBlock}
      ${manageBlock}
      ${extraInfoBlock}
      ${instructionBlock}
      ${ticketLine}
      ${contactFooter}
    </div>
  `;

  const smsIntro = {
    first: es ? `Hola ${patientName}, primera cita en ${displayClinic}.` : `Hi ${patientName}, first appointment at ${displayClinic}.`,
    booking: es ? `Hola ${patientName}, cita confirmada en ${displayClinic}.` : `Hi ${patientName}, appointment confirmed at ${displayClinic}.`,
    reschedule: es ? `Hola ${patientName}, cita reprogramada en ${displayClinic}.` : `Hi ${patientName}, appointment rescheduled at ${displayClinic}.`,
    cancel: es ? `Hola ${patientName}, tu cita en ${displayClinic} fue cancelada.` : `Hi ${patientName}, your appointment at ${displayClinic} was cancelled.`,
    reminder: es ? `Hola ${patientName}, recordatorio de tu cita en ${displayClinic}.` : `Hi ${patientName}, reminder of your appointment at ${displayClinic}.`,
  };

  const customIntro = applyEmailTemplate(smsIntros?.[type] || '', vars).trim();
  const smsIntroText = customIntro || smsIntro[type] || smsIntro.booking;

  const smsParts = [
    smsIntroText,
    type !== 'cancel' ? `${formattedDate} ${time || ''}`.trim() : `${formattedDate} ${time || ''}`.trim(),
    type !== 'cancel' && equipment ? (es ? `Servicio: ${equipment}` : `Service: ${equipment}`) : '',
    // First visit always includes the session-instructions link (page already live for Houston).
    showFirstInstructions && instructionsUrl
      ? (es
          ? `IMPORTANTE: lee las indicaciones de tu sesión aquí: ${instructionsUrl}`
          : `IMPORTANT: please read your session instructions here: ${instructionsUrl}`)
      : (trimmedInstructions && !instructionsUrl
          ? (es ? `Indicaciones: ${trimSmsInstructions(trimmedInstructions)}` : `Instructions: ${trimSmsInstructions(trimmedInstructions)}`)
          : ''),
    type !== 'cancel'
      ? formatLocationForSms({
          address: locationVars.direccion,
          mapsUrl: locationVars.ubicacion_link,
          locale: effectiveLocale,
        })
      : '',
    isGdlCluster(clinicName)
      ? buildGuadalajaraSmsFooter({ clinicPhone, locale: effectiveLocale })
      : isShenandoah(clinicName)
        ? buildShenandoahSmsFooter({ clinicPhone: houstonContactPhone, locale: effectiveLocale })
        : '',
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
  mapsUrl = '',
  clinicPhone = '',
  ticketMessage = '',
  locale = 'es',
  prefers_email = true,
  prefers_sms = false,
  notifyEnabled = true,
  notifyType = 'booking',
  emailTemplates = {},
  instructionsLabel = '',
  sessionInstructionsUrl = '',
  durationMins = 60,
  bufferMins = 0,
  smsIntros = {},
  sendEmail = true,
  sendSms = true,
  appointmentId = '',
  cancelLimitHours = 24,
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
    credentials: 'include',
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
      mapsUrl,
      clinicPhone,
      ticketMessage,
      locale,
      notifyType,
      emailTemplates,
      instructionsLabel,
      sessionInstructionsUrl,
      durationMins,
      bufferMins,
      smsIntros,
      appointmentId,
      cancelLimitHours,
      type: sendEmail && sendSms ? 'both' : sendEmail ? 'email' : sendSms ? 'sms' : 'both',
      prefers_email: !!sendEmail,
      prefers_sms: !!sendSms,
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
