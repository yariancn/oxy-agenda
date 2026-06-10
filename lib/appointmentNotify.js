import { digitsOnly } from './ensurePatient.js';

export function toE164Phone(phone, clinicName) {
  const raw = String(phone || '').trim();
  const digits = digitsOnly(raw);
  if (!digits) return '';

  if (raw.startsWith('+')) {
    return `+${digits}`;
  }

  const last10 = digits.slice(-10);
  if (last10.length !== 10) return raw;

  return clinicName === 'Shenandoah' ? `+1${last10}` : `+52${last10}`;
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

export function buildNotifyContent({
  locale = 'es',
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
}) {
  const es = locale !== 'en';
  const displayClinic = clinicDisplayName || clinicName;
  const formattedDate = formatNotifyDate(date, locale);
  const trimmedInstructions = String(instructions || '').trim();

  const subject = es
    ? `Cita confirmada — ${displayClinic}`
    : `Appointment confirmed — ${displayClinic}`;

  const greeting = es
    ? `Hola ${patientName},`
    : `Hello ${patientName},`;

  const intro = es
    ? `Tu cita en <strong>${displayClinic}</strong> quedó agendada.`
    : `Your appointment at <strong>${displayClinic}</strong> is confirmed.`;

  const labels = es
    ? { date: 'Fecha', time: 'Hora', service: 'Servicio', instructions: 'Indicaciones para tu sesión', address: 'Ubicación', phone: 'Teléfono clínica', footer: 'Si necesitas cambiar o cancelar, contáctanos con anticipación.' }
    : { date: 'Date', time: 'Time', service: 'Service', instructions: 'Instructions for your session', address: 'Location', phone: 'Clinic phone', footer: 'If you need to reschedule or cancel, please contact us in advance.' };

  const instructionBlock = trimmedInstructions
    ? `<div style="background-color: #fffbeb; padding: 15px; border-left: 4px solid #f59e0b; margin: 20px 0; border-radius: 4px;">
         <p style="margin: 0 0 8px; font-size: 11px; font-weight: 800; text-transform: uppercase; color: #92400e;">${labels.instructions}</p>
         <p style="margin: 0; color: #78350f; white-space: pre-wrap;">${escapeHtml(trimmedInstructions)}</p>
       </div>`
    : '';

  const extraLines = [
    address ? `<p style="margin: 5px 0;"><strong>📍 ${labels.address}:</strong> ${escapeHtml(address)}</p>` : '',
    clinicPhone ? `<p style="margin: 5px 0;"><strong>☎️ ${labels.phone}:</strong> ${escapeHtml(clinicPhone)}</p>` : '',
  ].filter(Boolean).join('');

  const ticketLine = ticketMessage
    ? `<p style="margin-top: 16px; font-size: 12px; color: #64748b; font-style: italic;">${escapeHtml(ticketMessage)}</p>`
    : '';

  const emailHtml = `
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 10px;">
      <h2 style="color: #0f172a; text-transform: uppercase; font-size: 18px;">${es ? 'Confirmación de cita' : 'Appointment confirmation'}</h2>
      <p style="color: #334155;">${greeting}</p>
      <p style="color: #334155;">${intro}</p>
      <div style="background-color: #f8fafc; padding: 15px; border-left: 4px solid #059669; margin: 20px 0; border-radius: 4px;">
        <p style="margin: 5px 0;"><strong>📅 ${labels.date}:</strong> ${escapeHtml(formattedDate)}</p>
        <p style="margin: 5px 0;"><strong>⏰ ${labels.time}:</strong> ${escapeHtml(time || '')}</p>
        <p style="margin: 5px 0;"><strong>🏥 ${labels.service}:</strong> ${escapeHtml(equipment || '')}</p>
        ${extraLines}
      </div>
      ${instructionBlock}
      <p style="font-size: 12px; color: #64748b;">${labels.footer}</p>
      ${ticketLine}
    </div>
  `;

  const smsParts = [
    es
      ? `Hola ${patientName}, cita confirmada en ${displayClinic}.`
      : `Hi ${patientName}, appointment confirmed at ${displayClinic}.`,
    `${formattedDate} ${time || ''}`.trim(),
    equipment ? (es ? `Servicio: ${equipment}` : `Service: ${equipment}`) : '',
    trimmedInstructions
      ? (es ? `Indicaciones: ${trimSmsInstructions(trimmedInstructions)}` : `Instructions: ${trimSmsInstructions(trimmedInstructions)}`)
      : '',
    address ? (es ? `Ubicación: ${address}` : `Location: ${address}`) : '',
  ].filter(Boolean);

  const smsBody = smsParts.join(' ').slice(0, 1500);

  return { subject, emailHtml, smsBody };
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
}) {
  if (!notifyEnabled) {
    return { success: true, skipped: true, report: { email: 'Desactivado', sms: 'Desactivado' } };
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
      type: 'both',
      prefers_email: prefers_email !== false,
      prefers_sms: prefers_sms !== false,
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
    lines.push(`SMS: ${report.sms}`);
  }
  return lines.join('\n');
}

export function notifyHadFailure(report) {
  if (!report) return false;
  return [report.email, report.sms].some(
    (status) => status && (/Error|Falta|error|missing|failed/i.test(status)),
  );
}
