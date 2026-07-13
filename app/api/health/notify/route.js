import { NextResponse } from 'next/server';
import { CLINIC_SHENANDOAH } from '../../../../lib/clinicRegistry.js';
import { getSupabaseAdmin } from '../../../../lib/supabaseAdmin.js';
import { getResendApiKey } from '../../../../lib/resendConfig.js';
import {
  isTwilioConfigured,
  isWhatsAppConfigured,
  isMexicoSmsConfigured,
  getTwilioMessagingServiceSid,
} from '../../../../lib/clinicMessaging.js';
import { getMexicoSmsProvider } from '../../../../lib/smsMexico.js';
import { getSms402tConfig } from '../../../../lib/sms402t.js';
import { getSmsMasivosConfig } from '../../../../lib/smsMasivos.js';
import { getSmsLabsMobileConfig, sendSmsLabsMobile } from '../../../../lib/smsLabsMobile.js';
import {
  getWhatsAppConfig,
  getWhatsAppTemplateName,
  probeWhatsAppHealth,
} from '../../../../lib/whatsappMessaging.js';

/** Diagnóstico: confirma qué credenciales ve el servidor (sin exponer valores). */
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const liveProbe = searchParams.get('probe') === '1';
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

  const payload = {
    host: request.headers.get('host'),
    buildSha: (process.env.VERCEL_GIT_COMMIT_SHA || 'dev').slice(0, 7),
    cronSecretConfigured: Boolean(String(process.env.CRON_SECRET || '').trim()),
    resendConfigured: resend,
    twilioConfigured: isTwilioConfigured(),
    twilioPartial: {
      sid: twilioSid,
      token: twilioToken,
      phone: twilioPhone,
      messagingService: twilioMessagingService,
    },
    smsMxConfigured: isMexicoSmsConfigured(),
    smsMxProvider: getMexicoSmsProvider(),
    smsMxPartial: {
      labsmobile: {
        username: Boolean(process.env.LABSMOBILE_USERNAME || process.env.SMS_LABSMOBILE_USERNAME),
        apiToken: Boolean(
          process.env.LABSMOBILE_API_TOKEN
            || process.env.LABSMOBILE_TOKEN
            || process.env.SMS_LABSMOBILE_API_TOKEN,
        ),
        apiUrl: getSmsLabsMobileConfig()?.apiUrl || null,
        sender: getSmsLabsMobileConfig()?.sender || null,
        testMode: process.env.LABSMOBILE_TEST === '1' || process.env.LABSMOBILE_SANDBOX === '1',
      },
      smsmasivos: {
        apiKey: Boolean(process.env.SMS_MASIVOS_API_KEY || process.env.SMS_MX_API_KEY),
        apiUrl: Boolean(getSmsMasivosConfig()?.apiUrl),
        sandbox: process.env.SMS_MASIVOS_SANDBOX === '1' || process.env.SMS_MX_SANDBOX === '1',
      },
      alt402t: {
        username: Boolean(process.env.SMS_402T_USERNAME),
        apiToken: Boolean(process.env.SMS_402T_API_TOKEN || process.env.SMS_402T_API_KEY),
        apiUrl: Boolean(process.env.SMS_402T_API_URL),
        sender: getSms402tConfig()?.sender || null,
        testMode: process.env.SMS_402T_TEST === '1' || process.env.SMS_402T_SANDBOX === '1',
      },
    },
    whatsappConfigured: isWhatsAppConfigured(),
    whatsappPartial: {
      accessToken: whatsappToken,
      phoneNumberId: whatsappPhoneId,
      apiVersion: getWhatsAppConfig()?.apiVersion || process.env.WHATSAPP_API_VERSION || 'v21.0',
      templates: whatsappTemplates,
      templatesComplete: Object.values(whatsappTemplates).every(Boolean),
    },
  };

  if (liveProbe && isMexicoSmsConfigured() && searchParams.get('sms') === '1') {
    const config = getSmsLabsMobileConfig();
    const probeTo = searchParams.get('to') || '523312345678';
    try {
      const probeResult = await sendSmsLabsMobile({
        to: probeTo,
        body: 'Oxygengdl probe',
        clinicName: 'Guadalajara',
        forceTest: true,
      });
      payload.smsMxLiveProbe = {
        usernameLen: config?.username?.length || 0,
        usernameHasAt: Boolean(config?.username?.includes('@')),
        tokenLen: config?.apiToken?.length || 0,
        msisdn: probeTo.replace(/\D/g, '').slice(-12),
        ...probeResult,
      };
    } catch (error) {
      payload.smsMxLiveProbe = {
        ok: false,
        error: error.message || 'SMS probe failed',
      };
    }
  }

  if (liveProbe && isWhatsAppConfigured()) {
    try {
      payload.whatsappLive = await probeWhatsAppHealth();
    } catch (error) {
      payload.whatsappLive = {
        ok: false,
        error: error.message || 'WhatsApp probe failed',
      };
    }
  }

  if (searchParams.get('tx') === '1') {
    try {
      const supabase = getSupabaseAdmin(CLINIC_SHENANDOAH);
      const [
        { error: apptErr },
        { data: config, error: cfgErr },
        { error: promoErr },
      ] = await Promise.all([
        supabase.from('appointments').select('id, confirmation_status, confirmation_sent_at').limit(1),
        supabase.from('company_config').select('clinic, confirmation_sms_enabled, confirmation_hours_before').eq('clinic', CLINIC_SHENANDOAH).maybeSingle(),
        supabase.from('promoters').select('code, email').limit(1),
      ]);
      payload.txSchema = {
        appointmentsConfirmation: !apptErr,
        companyConfigConfirmation: !cfgErr,
        promotersEmail: !promoErr,
        confirmationSmsEnabled: config?.confirmation_sms_enabled === true,
        confirmationHoursBefore: config?.confirmation_hours_before ?? null,
        errors: [apptErr?.message, cfgErr?.message, promoErr?.message].filter(Boolean),
      };
    } catch (error) {
      payload.txSchema = { ok: false, error: error.message };
    }
  }

  return NextResponse.json(payload);
}
