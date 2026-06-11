export function getWhatsAppConfig() {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!token || !phoneNumberId) return null;
  return {
    token,
    phoneNumberId,
    apiVersion: process.env.WHATSAPP_API_VERSION || 'v21.0',
  };
}

export function getWhatsAppTemplateName(notifyType) {
  const map = {
    first: process.env.WHATSAPP_TEMPLATE_FIRST,
    booking: process.env.WHATSAPP_TEMPLATE_BOOKING,
    reschedule: process.env.WHATSAPP_TEMPLATE_RESCHEDULE,
    cancel: process.env.WHATSAPP_TEMPLATE_CANCEL,
  };
  return map[notifyType] || map.booking || process.env.WHATSAPP_TEMPLATE_BOOKING || '';
}

function sanitizeTemplateParam(value) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 1024);
}

export async function sendWhatsAppTemplate({
  to,
  templateName,
  bodyParams = [],
  languageCode = 'es_MX',
}) {
  const config = getWhatsAppConfig();
  if (!config) {
    return { ok: false, error: 'Missing WhatsApp credentials', channel: 'whatsapp' };
  }

  const components = bodyParams.length
    ? [{
      type: 'body',
      parameters: bodyParams.map((text) => ({
        type: 'text',
        text: sanitizeTemplateParam(text),
      })),
    }]
    : [];

  const res = await fetch(
    `https://graph.facebook.com/${config.apiVersion}/${config.phoneNumberId}/messages`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: String(to).replace(/\D/g, ''),
        type: 'template',
        template: {
          name: templateName,
          language: { code: languageCode },
          ...(components.length ? { components } : {}),
        },
      }),
    },
  );

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message = data.error?.message || JSON.stringify(data).slice(0, 200);
    return { ok: false, error: message, channel: 'whatsapp' };
  }

  return { ok: true, channel: 'whatsapp', data };
}
