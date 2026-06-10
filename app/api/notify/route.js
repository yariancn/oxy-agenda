import { NextResponse } from 'next/server';
import { buildNotifyContent, toE164Phone } from '../../../lib/appointmentNotify.js';

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
      clinicName = 'Guadalajara',
      clinicDisplayName,
      instructions = '',
      address = '',
      clinicPhone = '',
      ticketMessage = '',
      locale = 'es',
      type = 'both',
      prefers_email = true,
      prefers_sms = true,
    } = body;

    let emailStatus = locale === 'en' ? 'Not requested' : 'No solicitado';
    let smsStatus = locale === 'en' ? 'Not requested' : 'No solicitado';

    const { subject, emailHtml, smsBody } = buildNotifyContent({
      locale,
      patientName,
      clinicName,
      clinicDisplayName,
      date,
      time,
      equipment,
      instructions,
      address,
      clinicPhone,
      ticketMessage,
    });

    if (email && prefers_email !== false && (type === 'both' || type === 'email')) {
      const resendKey = process.env.RESEND_API_KEY;

      if (!resendKey) {
        emailStatus = locale === 'en' ? 'Missing RESEND_API_KEY on server' : 'Falta RESEND_API_KEY en el servidor';
      } else {
        const fromEmail = clinicName.includes('Shenandoah')
          ? 'Citas Regenoxy <citas@regenoxy.com>'
          : 'Citas OxyHyperbaric <citas@oxyhyperbaric.com>';

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

    if (phone && prefers_sms !== false && (type === 'both' || type === 'sms')) {
      const twilioSid = process.env.TWILIO_ACCOUNT_SID;
      const twilioToken = process.env.TWILIO_AUTH_TOKEN;
      const twilioPhone = process.env.TWILIO_PHONE_NUMBER;

      if (!twilioSid || !twilioToken || !twilioPhone) {
        smsStatus = locale === 'en' ? 'Missing Twilio credentials on server' : 'Faltan credenciales de Twilio en el servidor';
      } else {
        const toPhone = toE164Phone(phone, clinicName);
        const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${twilioSid}/Messages.json`;
        const twilioData = new URLSearchParams({
          To: toPhone,
          From: twilioPhone,
          Body: smsBody,
        });

        const smsReq = await fetch(twilioUrl, {
          method: 'POST',
          headers: {
            Authorization: `Basic ${Buffer.from(`${twilioSid}:${twilioToken}`).toString('base64')}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: twilioData,
        });

        if (smsReq.ok) {
          smsStatus = locale === 'en' ? 'Sent successfully' : 'Enviado correctamente';
        } else {
          const errBody = await smsReq.text().catch(() => '');
          smsStatus = locale === 'en' ? `SMS error: ${errBody.slice(0, 120)}` : `Error SMS: ${errBody.slice(0, 120)}`;
        }
      }
    }

    return NextResponse.json({ success: true, report: { email: emailStatus, sms: smsStatus } });
  } catch (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
