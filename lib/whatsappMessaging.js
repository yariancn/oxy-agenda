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

async function graphGet(path, config) {
  const res = await fetch(`https://graph.facebook.com/${config.apiVersion}/${path}`, {
    headers: { Authorization: `Bearer ${config.token}` },
    cache: 'no-store',
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

/** Live probe against Meta Graph API (no message sent). */
export async function probeWhatsAppHealth() {
  const config = getWhatsAppConfig();
  if (!config) {
    return { ok: false, error: 'Missing WhatsApp credentials' };
  }

  const phoneFields = 'id,display_phone_number,verified_name,quality_rating,account_mode,code_verification_status,platform_type,status';
  const phoneRes = await graphGet(`${config.phoneNumberId}?fields=${phoneFields}`, config);
  if (!phoneRes.ok) {
    const err = phoneRes.data?.error || {};
    return {
      ok: false,
      error: err.message || 'Phone number lookup failed',
      code: err.code ?? null,
      subcode: err.error_subcode ?? null,
      type: err.type ?? null,
    };
  }

  const phone = phoneRes.data;
  const wabaId = phone.whatsapp_business_account?.id
    || phoneRes.data?.whatsapp_business_account;

  let wabaRes = null;
  if (!wabaId) {
    const nested = await graphGet(
      `${config.phoneNumberId}?fields=whatsapp_business_account{id,name,account_review_status,business_verification_status,message_template_namespace}`,
      config,
    );
    wabaRes = nested.ok ? nested.data?.whatsapp_business_account : null;
  }

  const waba = wabaId || wabaRes;
  const wabaAccountId = typeof waba === 'object' ? waba.id : waba;

  const templateNames = [
    getWhatsAppTemplateName('booking'),
    getWhatsAppTemplateName('reschedule'),
    getWhatsAppTemplateName('cancel'),
    process.env.WHATSAPP_TEMPLATE_STAFF,
  ].filter(Boolean);

  const uniqueTemplates = [...new Set(templateNames)];
  const templateStatus = {};

  if (wabaAccountId) {
    for (const name of uniqueTemplates) {
      const tplRes = await graphGet(
        `${wabaAccountId}/message_templates?name=${encodeURIComponent(name)}&fields=name,status,language,category`,
        config,
      );
      const rows = tplRes.ok ? (tplRes.data?.data || []) : [];
      const approved = rows.find((t) => t.status === 'APPROVED');
      templateStatus[name] = approved
        ? { status: 'APPROVED', language: approved.language }
        : rows.length
          ? { status: rows[0].status, language: rows[0].language }
          : { status: tplRes.ok ? 'NOT_FOUND' : 'LOOKUP_FAILED', error: tplRes.data?.error?.message };
    }
  }

  const accountMode = phone.account_mode || null;
  const liveOk = accountMode === 'LIVE' || phone.platform_type === 'CLOUD_API';

  return {
    ok: liveOk || Boolean(phone.display_phone_number),
    phone: {
      id: phone.id,
      display: phone.display_phone_number || null,
      verifiedName: phone.verified_name || null,
      qualityRating: phone.quality_rating || null,
      accountMode,
      platformType: phone.platform_type || null,
      codeVerification: phone.code_verification_status || null,
      status: phone.status || null,
    },
    waba: typeof waba === 'object'
      ? {
        id: waba.id,
        name: waba.name || null,
        reviewStatus: waba.account_review_status || null,
        businessVerification: waba.business_verification_status || null,
      }
      : wabaAccountId
        ? { id: wabaAccountId }
        : null,
    templates: templateStatus,
    patientTemplatesReady: ['booking', 'reschedule', 'cancel'].every(
      (type) => templateStatus[getWhatsAppTemplateName(type)]?.status === 'APPROVED',
    ),
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
