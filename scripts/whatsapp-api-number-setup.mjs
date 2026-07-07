#!/usr/bin/env node
/**
 * Setup número NUEVO solo Cloud API (sin coexistencia / sin app en celular).
 *
 * Meta UI obligatorio una vez: método de pago en WABA + número que reciba SMS/voz.
 *
 * Uso típico:
 *   export WHATSAPP_ACCESS_TOKEN="..."   # system user oxygengdlwhats
 *   export WABA_ID=289637057572952
 *
 *   node scripts/whatsapp-api-number-setup.mjs list
 *   node scripts/whatsapp-api-number-setup.mjs subscribe
 *   node scripts/whatsapp-api-number-setup.mjs add --cc 52 --number 3312345678 --name Oxygengdl Citas
 *   node scripts/whatsapp-api-number-setup.mjs request-code --phone-id NEW_ID --method SMS
 *   WHATSAPP_VERIFY_CODE=123456 node scripts/whatsapp-api-number-setup.mjs verify --phone-id NEW_ID
 *   WHATSAPP_REGISTER_PIN=123456 node scripts/whatsapp-api-number-setup.mjs register --phone-id NEW_ID
 *   node scripts/whatsapp-api-number-setup.mjs status --phone-id NEW_ID
 *   node scripts/whatsapp-api-number-setup.mjs test --phone-id NEW_ID --to 523328332686 --template programacion
 */

const token = process.env.WHATSAPP_ACCESS_TOKEN || process.env.META_ACCESS_TOKEN;
const wabaId = process.env.WABA_ID || '289637057572952';
const appId = process.env.META_APP_ID || '1664079171536415';
const apiVersion = process.env.WHATSAPP_API_VERSION || 'v21.0';
const base = `https://graph.facebook.com/${apiVersion}`;

function usage() {
  console.log(`
Comandos:
  list              Lista números en la WABA
  subscribe         POST /WABA/subscribed_apps (app ${appId})
  add               Agrega número a WABA (--cc --number --name)
  request-code      Pide OTP (--phone-id --method SMS|VOICE)
  verify            Verifica OTP (WHATSAPP_VERIFY_CODE=...)
  register          Registra para Cloud API (WHATSAPP_REGISTER_PIN=6 dígitos)
  status            Estado del número (--phone-id)
  templates         Plantillas aprobadas en WABA
  test              Envío de prueba (--phone-id --to --template)

Variables:
  WHATSAPP_ACCESS_TOKEN  obligatorio
  WABA_ID                default ${wabaId}
  WHATSAPP_VERIFY_CODE   para verify
  WHATSAPP_REGISTER_PIN  PIN verificación en dos pasos (6 dígitos; créalo al agregar número)
`);
}

function parseArgs(argv) {
  const cmd = argv[0] || 'help';
  const flags = {};
  for (let i = 1; i < argv.length; i += 1) {
    if (argv[i] === '--cc') flags.cc = argv[++i];
    else if (argv[i] === '--number') flags.number = argv[++i];
    else if (argv[i] === '--name') flags.name = argv[++i];
    else if (argv[i] === '--phone-id') flags.phoneId = argv[++i];
    else if (argv[i] === '--method') flags.method = argv[++i];
    else if (argv[i] === '--to') flags.to = argv[++i];
    else if (argv[i] === '--template') flags.template = argv[++i];
  }
  return { cmd, flags };
}

async function graph(method, path, body) {
  const res = await fetch(`${base}/${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

function die(msg, data) {
  console.error(msg);
  if (data) console.error(JSON.stringify(data, null, 2));
  process.exit(1);
}

function ok(label, data) {
  console.log(`\n✅ ${label}`);
  console.log(JSON.stringify(data, null, 2));
}

async function cmdList() {
  const res = await graph(
    'GET',
    `${wabaId}/phone_numbers?fields=id,display_phone_number,verified_name,platform_type,code_verification_status,quality_rating,is_on_biz_app`,
  );
  if (!res.ok) die('No se pudo listar números', res.data);
  ok('Números en WABA', res.data);
  console.log('\nCopia el "id" del número NUEVO (solo API) para --phone-id y WHATSAPP_PHONE_NUMBER_ID en Vercel.');
}

async function cmdSubscribe() {
  const res = await graph('POST', `${wabaId}/subscribed_apps`, {});
  if (!res.ok) die('subscribed_apps falló', res.data);
  ok('App suscrita a WABA', res.data);
}

async function cmdAdd(flags) {
  const cc = String(flags.cc || '').replace(/\D/g, '');
  const number = String(flags.number || '').replace(/\D/g, '');
  const verifiedName = flags.name || 'Oxygengdl Citas';
  if (!cc || !number) die('Faltan --cc y --number (solo dígitos, sin +52)');

  const res = await graph('POST', `${wabaId}/phone_numbers`, {
    cc,
    phone_number: number,
    verified_name: verifiedName,
  });
  if (!res.ok) die('Agregar número falló (¿número ya en WhatsApp? ¿pago en WABA?)', res.data);
  ok('Número agregado — guarda phone_number_id', res.data);
  console.log('\nSiguiente: request-code → verify → register');
}

async function cmdRequestCode(flags) {
  const phoneId = flags.phoneId || process.env.WHATSAPP_PHONE_NUMBER_ID;
  const method = (flags.method || 'SMS').toUpperCase();
  if (!phoneId) die('Falta --phone-id');
  const res = await graph(
    'POST',
    `${phoneId}/request_code?code_method=${method}&language=es`,
  );
  if (!res.ok) die('request_code falló', res.data);
  ok(`OTP enviado por ${method}`, res.data);
}

async function cmdVerify(flags) {
  const phoneId = flags.phoneId || process.env.WHATSAPP_PHONE_NUMBER_ID;
  const code = process.env.WHATSAPP_VERIFY_CODE;
  if (!phoneId || !code) die('Faltan --phone-id y WHATSAPP_VERIFY_CODE');
  const res = await graph('POST', `${phoneId}/verify_code`, { code: String(code) });
  if (!res.ok) die('verify_code falló', res.data);
  ok('Número verificado', res.data);
}

async function cmdRegister(flags) {
  const phoneId = flags.phoneId || process.env.WHATSAPP_PHONE_NUMBER_ID;
  const pin = process.env.WHATSAPP_REGISTER_PIN;
  if (!phoneId || !pin) die('Faltan --phone-id y WHATSAPP_REGISTER_PIN (6 dígitos 2FA del número en Meta)');

  const res = await graph('POST', `${phoneId}/register`, {
    messaging_product: 'whatsapp',
    pin: String(pin),
  });
  if (!res.ok) {
    console.error(JSON.stringify(res.data, null, 2));
    if (res.data?.error?.message?.includes('SMB')) {
      console.error('\n⚠️  Este número parece ser coexistencia/SMB. Usa un número NUEVO que no esté en WhatsApp Business app.');
    }
    process.exit(1);
  }
  ok('Registrado en Cloud API', res.data);
  console.log(`\nVercel → WHATSAPP_PHONE_NUMBER_ID=${phoneId}`);
}

async function cmdStatus(flags) {
  const phoneId = flags.phoneId || process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!phoneId) die('Falta --phone-id');
  const fields = 'id,display_phone_number,verified_name,platform_type,is_on_biz_app,code_verification_status,quality_rating,account_mode';
  const res = await graph('GET', `${phoneId}?fields=${fields}`);
  if (!res.ok) die('status falló', res.data);
  const p = res.data;
  const apiReady = p.platform_type === 'CLOUD_API' && p.code_verification_status === 'VERIFIED';
  ok('Estado', p);
  console.log(apiReady
    ? '\n✅ Listo para enviar plantillas por API (si plantillas aprobadas).'
    : '\n❌ Falta verify/register o número aún ON_PREMISE/coexistencia.');
}

async function cmdTemplates() {
  const res = await graph(
    'GET',
    `${wabaId}/message_templates?fields=name,status,language,category&limit=50`,
  );
  if (!res.ok) die('templates falló', res.data);
  const rows = res.data?.data || [];
  const approved = rows.filter((t) => t.status === 'APPROVED');
  ok(`Plantillas (${approved.length} aprobadas)`, approved.length ? approved : rows);
}

async function cmdTest(flags) {
  const phoneId = flags.phoneId || process.env.WHATSAPP_PHONE_NUMBER_ID;
  const to = String(flags.to || '').replace(/\D/g, '');
  const templateName = flags.template || process.env.WHATSAPP_TEMPLATE_BOOKING || 'programacion';
  if (!phoneId || !to) die('Faltan --phone-id y --to (10 dígitos MX)');

  const res = await graph('POST', `${phoneId}/messages`, {
    messaging_product: 'whatsapp',
    to,
    type: 'template',
    template: {
      name: templateName,
      language: { code: 'es_MX' },
    },
  });
  if (!res.ok) die('Envío falló', res.data);
  ok('Mensaje enviado', res.data);
}

async function main() {
  const { cmd, flags } = parseArgs(process.argv.slice(2));
  if (cmd === 'help' || cmd === '--help' || !cmd) {
    usage();
    return;
  }

  if (!token) die('Exporta WHATSAPP_ACCESS_TOKEN');

  console.log(`WABA ${wabaId} · API ${apiVersion} · App ${appId}`);

  switch (cmd) {
    case 'list': await cmdList(); break;
    case 'subscribe': await cmdSubscribe(); break;
    case 'add': await cmdAdd(flags); break;
    case 'request-code': await cmdRequestCode(flags); break;
    case 'verify': await cmdVerify(flags); break;
    case 'register': await cmdRegister(flags); break;
    case 'status': await cmdStatus(flags); break;
    case 'templates': await cmdTemplates(); break;
    case 'test': await cmdTest(flags); break;
    default:
      usage();
      die(`Comando desconocido: ${cmd}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
