#!/usr/bin/env node
/**
 * Envía un mensaje de prueba de cada notificación (paciente + equipo + ticket POS).
 *
 *   node scripts/send-notify-samples.mjs --phone 3328332686 --email yarianc@yahoo.com
 *   node scripts/send-notify-samples.mjs --url https://oxy-agenda.vercel.app --clinic Oxygengdl
 */

function parseArgs(argv) {
  const flags = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith('--')) continue;
    const key = arg.slice(2);
    const next = argv[i + 1];
    flags[key] = next && !next.startsWith('--') ? next : true;
    if (flags[key] !== true) i += 1;
  }
  return flags;
}

async function main() {
  const flags = parseArgs(process.argv.slice(2));
  const baseUrl = String(flags.url || process.env.NOTIFY_SAMPLES_URL || 'https://oxy-agenda.vercel.app').replace(/\/$/, '');
  const phone = flags.phone || process.env.NOTIFY_SAMPLES_PHONE || '';
  const email = flags.email || process.env.NOTIFY_SAMPLES_EMAIL || '';
  const clinic = flags.clinic || 'Oxygengdl';
  const pin = flags.pin || process.env.STAFF_SUPREME_PIN || '1234567890';

  if (!phone && !email) {
    console.error('Falta --phone y/o --email (o NOTIFY_SAMPLES_PHONE / NOTIFY_SAMPLES_EMAIL)');
    process.exit(1);
  }

  const res = await fetch(`${baseUrl}/api/notify/samples`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      pin,
      clinic,
      phone,
      email,
      patientName: flags.name || 'Yarian (prueba)',
      includeStaff: flags.staff === true || flags.staff === 'true',
      includePosReceipt: flags.pos === true || flags.pos === 'true',
      includeConfirmationSms: flags.confirmation !== false && flags.confirmation !== 'false',
      locale: flags.locale || undefined,
      equipment: flags.equipment || undefined,
    }),
  });

  const data = await res.json().catch(() => ({}));
  console.log(JSON.stringify(data, null, 2));
  if (!res.ok || !data.success) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
