#!/usr/bin/env node
/**
 * Prueba envío SMS México (LabsMobile, SMS Masivos o 402T según variables).
 *
 * LabsMobile (recomendado):
 *   LABSMOBILE_USERNAME=... LABSMOBILE_API_TOKEN=... \
 *     node scripts/sms-mx-test.mjs --to 3312345678 --message "Prueba"
 *
 * Modo simulado (no consume créditos):
 *   LABSMOBILE_TEST=1 node scripts/sms-mx-test.mjs --to ...
 */

import { getMexicoSmsProvider, sendMexicoSms } from '../lib/smsMexico.js';
import { toMexicoSmsMasivosNumber, toMexicoSmsMsisdn } from '../lib/smsMexicoPhone.js';
import { getSmsLabsMobileConfig } from '../lib/smsLabsMobile.js';
import { getSmsMasivosConfig } from '../lib/smsMasivos.js';
import { getSms402tConfig } from '../lib/sms402t.js';

function parseArgs(argv) {
  const flags = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const next = argv[i + 1];
      flags[key] = next && !next.startsWith('--') ? next : true;
      if (flags[key] !== true) i += 1;
    }
  }
  return flags;
}

async function main() {
  const flags = parseArgs(process.argv.slice(2));
  const provider = getMexicoSmsProvider();

  if (!provider) {
    console.error('Faltan credenciales SMS México.');
    console.error('LabsMobile: LABSMOBILE_USERNAME + LABSMOBILE_API_TOKEN');
    console.error('Alternativo: SMS_MASIVOS_API_KEY o SMS_402T_*');
    process.exit(1);
  }

  const to = flags.to || process.env.SMS_TEST_TO;
  const message = flags.message || 'Prueba SMS Oxygengdl — confirmación de cita (test).';

  if (!to) {
    console.error('Falta --to 33XXXXXXXX o SMS_TEST_TO');
    process.exit(1);
  }

  console.log('Proveedor:', provider);
  if (provider === 'labsmobile') {
    const config = getSmsLabsMobileConfig();
    console.log('Config:', {
      username: config?.username,
      apiUrl: config?.apiUrl,
      sender: config?.sender,
      testMode: config?.testMode,
      msisdn: toMexicoSmsMsisdn(to),
    });
  } else if (provider === 'smsmasivos') {
    const config = getSmsMasivosConfig();
    console.log('Config:', {
      apiUrl: config?.apiUrl,
      sandbox: config?.sandbox,
      numbers: toMexicoSmsMasivosNumber(to),
    });
  } else {
    const config = getSms402tConfig();
    console.log('Config:', {
      username: config?.username,
      apiUrl: config?.apiUrl,
      sender: config?.sender,
      testMode: config?.testMode,
      msisdn: toMexicoSmsMsisdn(to),
    });
  }

  const result = await sendMexicoSms({ to, body: message });
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.ok ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
