import { NextResponse } from 'next/server';
import { buildNotifyContent, toE164Phone } from '../../../lib/appointmentNotify.js';
import { getResendApiKey, getResendFromAddress } from '../../../lib/resendConfig.js';
import { sendPatientTextMessage, textChannelLabel } from '../../../lib/clinicMessaging.js';

export async function POST(request) {
  try {
    const body = await request.json();
    const {
      patientName,
      phone,
      email,
      date,
      time,
      equipment,
      clinicName = 'Oxygengdl',
      clinicDisplayName,
      instructions = '',
      address = '',
      mapsUrl = '',
      clinicPhone = '',
      ticketMessage = '',
      locale = 'es',
      type = 'both',
      prefers_email = true,
      prefers_sms = true,
      notifyType = 'booking',
      emailTemplates = {},
      instructionsLabel = '',
      sessionInstructionsUrl = '',
      durationMins = 60,
      bufferMins = 0,
      smsIntros = {},
    } = body;

    let emailStatus = locale === 'en' ? 'Not requested' : 'No solicitado';
    let smsStatus = locale === 'en' ? 'Not requested' : 'No solicitado';
    const textChannel = textChannelLabel(clinicName, locale);

    const { subject, emailHtml, smsBody, whatsappBodyParams } = buildNotifyContent({
      locale,
      notifyType,
      patientName,
      clinicName,
      clinicDisplayName,
      date,
      time,
      equipment,
      instructions,
      address,
      mapsUrl,
      clinicPhone,
      ticketMessage,
      emailTemplates,
      instructionsLabel,
      sessionInstructionsUrl,
      durationMins,
      bufferMins,
      smsIntros,
    });

    if (email && prefers_email !== false && (type === 'both' || type === 'email')) {
      const resendKey = getResendApiKey();

      if (!resendKey) {
        emailStatus = locale === 'en' ? 'Missing RESEND_API_KEY on server' : 'Falta RESEND_API_KEY en el servidor';
      } else {
        const fromEmail = getResendFromAddress(clinicName);

        const emailReq = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${resendKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: fromEmail,
            to: [email],
            subject,
            html: emailHtml,
          }),
        });

        if (emailReq.ok) {
          emailStatus = locale === 'en' ? 'Sent successfully' : 'Enviado correctamente';
        } else {
          const errBody = await emailReq.text().catch(() => '');
          emailStatus = locale === 'en' ? `Resend error: ${errBody.slice(0, 120)}` : `Error Resend: ${errBody.slice(0, 120)}`;
        }
      }
    }

    let smsTo = null;

    if (phone && prefers_sms !== false && (type === 'both' || type === 'sms')) {
      smsTo = toE164Phone(phone, clinicName);
      const result = await sendPatientTextMessage({
        clinicName,
        phone,
        smsBody,
        whatsappBodyParams,
        notifyType,
        locale,
      });

      if (result.ok) {
        smsStatus = locale === 'en' ? 'Sent successfully' : 'Enviado correctamente';
      } else if (result.skipped && result.error === 'not_configured') {
        smsStatus = locale === 'en'
          ? 'WhatsApp not configured (email only)'
          : 'WhatsApp no configurado (solo correo)';
      } else {
        const prefix = locale === 'en' ? `${textChannel} error` : `Error ${textChannel}`;
        smsStatus = `${prefix}: ${(result.error || 'unknown').slice(0, 120)}`;
      }
    }

    return NextResponse.json({
      success: true,
      report: { email: emailStatus, sms: smsStatus, textChannel, smsTo },
    });
  } catch (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
