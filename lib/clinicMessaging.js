import { toE164Phone } from './appointmentNotify.js';
import {
  getWhatsAppConfig,
  sendWhatsAppTemplate,
  getWhatsAppTemplateName,
} from './whatsappMessaging.js';

export function isWhatsAppConfigured() {
  return Boolean(getWhatsAppConfig());
}

export function isUsClinic(clinicName) {
  return clinicName === 'Shenandoah';
}

export function toWhatsAppRecipient(phone, clinicName) {
  const e164 = toE164Phone(phone, clinicName);
  if (!e164) return '';
  return e164.replace(/\D/g, '');
}

export async function sendTwilioSms({ to, body }) {
  const twilioSid = process.env.TWILIO_ACCOUNT_SID;
  const twilioToken = process.env.TWILIO_AUTH_TOKEN;
  const twilioPhone = process.env.TWILIO_PHONE_NUMBER;

  if (!twilioSid || !twilioToken || !twilioPhone) {
    return { ok: false, error: 'Missing Twilio credentials', channel: 'sms' };
  }

  const normalize = (n) => String(n || '').replace(/\D/g, '');
  if (normalize(to) === normalize(twilioPhone)) {
    return {
      ok: false,
      error: 'Cannot SMS the same number as TWILIO_PHONE_NUMBER',
      channel: 'sms',
    };
  }

  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${twilioSid}/Messages.json`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${twilioSid}:${twilioToken}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      To: to,
      From: twilioPhone,
      Body: body,
    }),
  });

  if (res.ok) return { ok: true, channel: 'sms' };

  const errBody = await res.text().catch(() => '');
  return { ok: false, error: errBody.slice(0, 200), channel: 'sms' };
}

export async function sendPatientTextMessage({
  clinicName,
  phone,
  smsBody,
  whatsappBodyParams,
  notifyType = 'booking',
  locale = 'es',
}) {
  if (isUsClinic(clinicName)) {
    const to = toE164Phone(phone, clinicName);
    if (!to) return { ok: false, error: 'Invalid phone number', channel: 'sms' };
    return sendTwilioSms({ to, body: smsBody });
  }

  if (!isWhatsAppConfigured()) {
    return { ok: false, error: 'not_configured', channel: 'whatsapp', skipped: true };
  }

  const to = toWhatsAppRecipient(phone, clinicName);
  if (!to) return { ok: false, error: 'Invalid phone number', channel: 'whatsapp' };

  const templateName = getWhatsAppTemplateName(notifyType);
  if (!templateName) {
    return { ok: false, error: 'Missing WhatsApp template name', channel: 'whatsapp' };
  }

  const languageCode = locale === 'en' ? 'en_US' : 'es_MX';
  return sendWhatsAppTemplate({
    to,
    templateName,
    bodyParams: whatsappBodyParams,
    languageCode,
  });
}

export async function sendStaffTextMessages({ phones, smsBody, clinicName, whatsappBodyParams, locale = 'es' }) {
  if (isUsClinic(clinicName)) {
    const results = [];
    for (const phone of phones) {
      const result = await sendTwilioSms({ to: phone, body: smsBody });
      results.push({ to: phone, ok: result.ok });
    }
    const sent = results.filter((r) => r.ok).length;
    return { ok: sent > 0, sent, total: results.length, channel: 'sms' };
  }

  if (!isWhatsAppConfigured()) {
    return { ok: false, error: 'not_configured', channel: 'whatsapp', skipped: true };
  }

  const templateName = process.env.WHATSAPP_TEMPLATE_STAFF;
  if (!templateName) {
    return { ok: false, error: 'Missing WHATSAPP_TEMPLATE_STAFF', channel: 'whatsapp', skipped: true };
  }

  const languageCode = locale === 'en' ? 'en_US' : 'es_MX';
  const results = [];
  for (const phone of phones) {
    const to = phone.replace(/\D/g, '');
    const result = await sendWhatsAppTemplate({
      to,
      templateName,
      bodyParams: whatsappBodyParams,
      languageCode,
    });
    results.push({ to: phone, ok: result.ok });
  }

  const sent = results.filter((r) => r.ok).length;
  return { ok: sent > 0, sent, total: results.length, channel: 'whatsapp' };
}

export function textChannelLabel(clinicName, locale = 'es') {
  const es = locale !== 'en';
  if (isUsClinic(clinicName)) return es ? 'SMS' : 'SMS';
  return 'WhatsApp';
}
