#!/usr/bin/env node

import { existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { supabaseGdl, supabaseShenandoah } from '../lib/supabase.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

const TABLES = [
  'services',
  'appointments',
  'blocked_slots',
  'company_config',
  'patients',
  'users_staff',
  'user_roles',
  'protocols',
  'audit_logs',
];

const CLINICS = [
  { id: 'GDL', label: 'Guadalajara (MXN)', client: supabaseGdl },
  { id: 'TX', label: 'Shenandoah (USD)', client: supabaseShenandoah },
];

const MIN_ROWS = {
  GDL: { services: 1, users_staff: 1, company_config: 1, user_roles: 1 },
  TX: { services: 1, user_roles: 1, company_config: 1, users_staff: 1 },
};

const NOTIFY_ENV = [
  'RESEND_API_KEY',
  'TWILIO_ACCOUNT_SID',
  'TWILIO_AUTH_TOKEN',
  'TWILIO_PHONE_NUMBER',
];

const STATIC_ASSETS = [
  'public/1c3300f3-f5e7-4682-b627-257e868ed467.jpg',
];

const HTTP_ROUTES = ['/', '/booking/mx', '/booking/us'];

const ok = (msg) => console.log(`  ✓ ${msg}`);
const warn = (msg) => console.log(`  ⚠ ${msg}`);
const fail = (msg) => console.log(`  ✗ ${msg}`);

const results = { pass: 0, warn: 0, fail: 0 };

function record(kind, message, fn) {
  fn(message);
  results[kind] += 1;
}

function getBaseUrl() {
  const flag = process.argv.find((arg) => arg.startsWith('--url='));
  if (flag) return flag.slice('--url='.length).replace(/\/$/, '');
  if (process.env.HEALTH_CHECK_URL) return process.env.HEALTH_CHECK_URL.replace(/\/$/, '');
  return 'http://localhost:3000';
}

function shouldSkipHttp() {
  return process.argv.includes('--skip-http');
}

async function checkCompanyConfigColumns() {
  console.log('\n=== company_config (schema horarios) ===');

  for (const clinic of CLINICS) {
    const { error } = await clinic.client
      .from('company_config')
      .select('id, start_time, end_time, interval_mins')
      .limit(1);

    if (error) {
      record('fail', `${clinic.label}: start_time/end_time — ${error.message}`, fail);
    } else {
      record('pass', `${clinic.label}: columnas de horario OK`, ok);
    }
  }
}

async function checkAppointmentOverrideColumns() {
  console.log('\n=== Overrides staff en citas (schema) ===');

  for (const clinic of CLINICS) {
    const { error } = await clinic.client
      .from('appointments')
      .select('id, outside_normal_hours, is_extended_block')
      .limit(1);

    if (error) {
      record('fail', `${clinic.label}: outside_normal_hours/is_extended_block — ${error.message}`, fail);
    } else {
      record('pass', `${clinic.label}: columnas override staff OK`, ok);
    }
  }
}

async function checkServiceHoursColumns() {
  console.log('\n=== Horarios por servicio (schema) ===');

  for (const clinic of CLINICS) {
    const { error } = await clinic.client
      .from('services')
      .select('id, start_time, end_time')
      .limit(1);

    if (error) {
      record('fail', `${clinic.label}: columnas start_time/end_time — ${error.message}`, fail);
    } else {
      record('pass', `${clinic.label}: columnas start_time/end_time OK`, ok);
    }
  }
}

async function checkSupabase() {
  console.log('\n=== Supabase ===');

  for (const clinic of CLINICS) {
    console.log(`\n  ${clinic.label}`);

    for (const table of TABLES) {
      const { count, error } = await clinic.client
        .from(table)
        .select('*', { count: 'exact', head: true });

      if (error) {
        record('fail', `${table}: ${error.message} (${error.code || 'unknown'})`, fail);
        continue;
      }

      const min = MIN_ROWS[clinic.id]?.[table];
      if (min != null && count < min) {
        record('warn', `${table}: ${count} filas (esperado >= ${min})`, warn);
      } else {
        record('pass', `${table}: ${count} filas`, ok);
      }
    }
  }
}

function checkStaticAssets() {
  console.log('\n=== Assets estáticos ===');

  for (const asset of STATIC_ASSETS) {
    const fullPath = resolve(root, asset);
    if (existsSync(fullPath)) {
      record('pass', asset, ok);
    } else {
      record('warn', `${asset} no encontrado (logo en booking/admin)`, warn);
    }
  }
}

function checkNotifyEnv() {
  console.log('\n=== Notificaciones (variables de entorno) ===');

  const missing = NOTIFY_ENV.filter((key) => !process.env[key]);

  if (missing.length === 0) {
    record('pass', 'Resend y Twilio configurados', ok);
    return;
  }

  if (missing.length === NOTIFY_ENV.length) {
    record('warn', 'Sin credenciales: email/SMS no enviarán en producción', warn);
    return;
  }

  record('warn', `Faltan: ${missing.join(', ')}`, warn);
}

async function checkHttp(baseUrl) {
  console.log(`\n=== HTTP (${baseUrl}) ===`);

  let reachable = false;

  for (const route of HTTP_ROUTES) {
    try {
      const response = await fetch(`${baseUrl}${route}`, {
        signal: AbortSignal.timeout(5000),
      });

      if (response.ok) {
        record('pass', `${route} → ${response.status}`, ok);
        reachable = true;
      } else {
        record('fail', `${route} → ${response.status}`, fail);
        reachable = true;
      }
    } catch (error) {
      record('fail', `${route} → no responde (${error.message})`, fail);
    }
  }

  if (!reachable) {
    warn('Servidor no detectado. Corre "npm run dev" o usa --url=https://tu-dominio.com');
    return;
  }

  try {
    const response = await fetch(`${baseUrl}/api/notify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        patientName: 'Health Check',
        type: 'both',
        prefers_email: false,
        prefers_sms: false,
      }),
      signal: AbortSignal.timeout(5000),
    });

    const body = await response.json();

    if (response.ok && body.success) {
      record('pass', `/api/notify → ${response.status} (endpoint activo)`, ok);
    } else {
      record('fail', `/api/notify → respuesta inesperada: ${JSON.stringify(body)}`, fail);
    }
  } catch (error) {
    record('fail', `/api/notify → ${error.message}`, fail);
  }
}

function printSummary() {
  console.log('\n=== Resumen ===');
  console.log(`  ✓ ${results.pass}  ⚠ ${results.warn}  ✗ ${results.fail}`);

  if (results.fail > 0) {
    console.log('\nEstado: FALLO — revisa los items marcados con ✗');
    process.exitCode = 1;
  } else if (results.warn > 0) {
    console.log('\nEstado: OK con advertencias — operativo pero incompleto');
  } else {
    console.log('\nEstado: OK — todo en orden');
  }
}

async function main() {
  console.log('OXY Agenda — Health Check');
  console.log(`Fecha: ${new Date().toLocaleString('es-MX')}`);

  await checkSupabase();
  await checkCompanyConfigColumns();
  await checkServiceHoursColumns();
  await checkAppointmentOverrideColumns();
  checkStaticAssets();
  checkNotifyEnv();

  if (!shouldSkipHttp()) {
    await checkHttp(getBaseUrl());
  } else {
    console.log('\n=== HTTP ===');
    warn('Omitido (--skip-http)');
  }

  printSummary();
}

main().catch((error) => {
  console.error('\nError fatal:', error);
  process.exit(1);
});
