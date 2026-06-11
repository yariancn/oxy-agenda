import { NextResponse } from 'next/server';
import { getResendApiKey } from '../../../../lib/resendConfig.js';
import { isWhatsAppConfigured } from '../../../../lib/clinicMessaging.js';

/** Diagnóstico: confirma qué credenciales ve el servidor (sin exponer valores). */
export async function GET(request) {
  const twilioSid = Boolean(process.env.TWILIO_ACCOUNT_SID);
  const twilioToken = Boolean(process.env.TWILIO_AUTH_TOKEN);
  const twilioPhone = Boolean(process.env.TWILIO_PHONE_NUMBER);
  const resend = Boolean(getResendApiKey());

  return NextResponse.json({
    host: request.headers.get('host'),
    resendConfigured: resend,
    twilioConfigured: twilioSid && twilioToken && twilioPhone,
    twilioPartial: { sid: twilioSid, token: twilioToken, phone: twilioPhone },
    whatsappConfigured: isWhatsAppConfigured(),
  });
}
