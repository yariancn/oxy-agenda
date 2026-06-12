import { NextResponse } from 'next/server';
import { getResendApiKey } from '../../../../lib/resendConfig.js';
import { isTwilioConfigured, isWhatsAppConfigured, getTwilioMessagingServiceSid } from '../../../../lib/clinicMessaging.js';
import { getWhatsAppConfig, getWhatsAppTemplateName } from '../../../../lib/whatsappMessaging.js';

/** Diagnóstico: confirma qué credenciales ve el servidor (sin exponer valores). */
export async function GET(request) {
  const twilioSid = Boolean(process.env.TWILIO_ACCOUNT_SID);
  const twilioToken = Boolean(process.env.TWILIO_AUTH_TOKEN);
  const twilioPhone = Boolean(process.env.TWILIO_PHONE_NUMBER);
  const twilioMessagingService = Boolean(getTwilioMessagingServiceSid());
  const resend = Boolean(getResendApiKey());
  const whatsappToken = Boolean(process.env.WHATSAPP_ACCESS_TOKEN);
  const whatsappPhoneId = Boolean(process.env.WHATSAPP_PHONE_NUMBER_ID);
  const whatsappTemplates = {
    first: Boolean(getWhatsAppTemplateName('first')),
    booking: Boolean(getWhatsAppTemplateName('booking')),
    reschedule: Boolean(getWhatsAppTemplateName('reschedule')),
    cancel: Boolean(getWhatsAppTemplateName('cancel')),
    staff: Boolean(process.env.WHATSAPP_TEMPLATE_STAFF),
  };

  return NextResponse.json({
    host: request.headers.get('host'),
    buildSha: (process.env.VERCEL_GIT_COMMIT_SHA || 'dev').slice(0, 7),
    resendConfigured: resend,
    twilioConfigured: isTwilioConfigured(),
    twilioPartial: {
      sid: twilioSid,
      token: twilioToken,
      phone: twilioPhone,
      messagingService: twilioMessagingService,
    },
    whatsappConfigured: isWhatsAppConfigured(),
    whatsappPartial: {
      accessToken: whatsappToken,
      phoneNumberId: whatsappPhoneId,
      apiVersion: getWhatsAppConfig()?.apiVersion || process.env.WHATSAPP_API_VERSION || 'v21.0',
      templates: whatsappTemplates,
      templatesComplete: Object.values(whatsappTemplates).every(Boolean),
    },
  });
}
