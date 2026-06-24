#!/usr/bin/env node
/**
 * Diagnóstico WhatsApp coexistencia — qué puede hacer un token vía Graph API.
 *
 * Uso:
 *   WHATSAPP_ACCESS_TOKEN=... node scripts/whatsapp-coexistence-probe.mjs
 *   WHATSAPP_ACCESS_TOKEN=... WABA_ID=289637057572952 PHONE_ID=345291328658965 node scripts/whatsapp-coexistence-probe.mjs
 *
 * No expone el token. No completa coexistencia (requiere Embedded Signup o celular).
 */

const token = process.env.WHATSAPP_ACCESS_TOKEN || process.env.META_ACCESS_TOKEN;
const wabaId = process.env.WABA_ID || '289637057572952';
const phoneId = process.env.PHONE_ID || process.env.WHATSAPP_PHONE_NUMBER_ID || '345291328658965';
const appId = process.env.META_APP_ID || '1654079171536415';
const apiVersion = process.env.WHATSAPP_API_VERSION || 'v21.0';

if (!token) {
  console.error('Falta WHATSAPP_ACCESS_TOKEN o META_ACCESS_TOKEN');
  process.exit(1);
}

const base = `https://graph.facebook.com/${apiVersion}`;

async function graphGet(path) {
  const res = await fetch(`${base}/${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

async function graphPost(path, body) {
  const res = await fetch(`${base}/${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

function section(title) {
  console.log(`\n=== ${title} ===`);
}

async function main() {
  section('Token debug (sin revelar valor)');
  const me = await graphGet('me?fields=id,name');
  console.log(me.ok ? me.data : { error: me.data?.error?.message, code: me.data?.error?.code });

  section('App del token');
  const app = await graphGet(`${appId}?fields=id,name,category`);
  console.log(app.ok ? app.data : { error: app.data?.error?.message, hint: 'Token sin acceso a esta app' });

  section(`Phone ${phoneId}`);
  const phoneFields = 'id,display_phone_number,verified_name,platform_type,is_on_biz_app,code_verification_status,quality_rating';
  const phone = await graphGet(`${phoneId}?fields=${phoneFields}`);
  console.log(JSON.stringify(phone.data, null, 2));

  section(`WABA ${wabaId} — subscribed apps`);
  const subs = await graphGet(`${wabaId}/subscribed_apps`);
  console.log(JSON.stringify(subs.data, null, 2));

  section('WABA phone numbers');
  const numbers = await graphGet(`${wabaId}/phone_numbers?fields=id,display_phone_number,verified_name,platform_type,is_on_biz_app`);
  console.log(JSON.stringify(numbers.data, null, 2));

  const p = phone.data;
  if (p?.is_on_biz_app === true && p?.platform_type === 'CLOUD_API') {
    section('Coexistencia OK — probando smb_app_data (solo lectura sync)');
    const sync = await graphPost(`${phoneId}/smb_app_data`, {
      messaging_product: 'whatsapp',
      sync_type: 'smb_app_state_sync',
    });
    console.log(JSON.stringify(sync.data, null, 2));
  } else {
    section('Coexistencia NO completa');
    console.log({
      is_on_biz_app: p?.is_on_biz_app ?? null,
      platform_type: p?.platform_type ?? null,
      note: 'POST /register falla en SMB. smb_app_data solo después de Embedded Signup o Plataforma empresarial en el celular.',
    });
  }

  section('Resumen');
  const ready = p?.is_on_biz_app === true && p?.platform_type === 'CLOUD_API';
  console.log(ready
    ? '✅ Número listo para enviar por API + app.'
    : '❌ Falta flujo coexistencia (UI). Ningún token de otra app lo sustituye sin Embedded Signup + permisos sobre esta WABA.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
