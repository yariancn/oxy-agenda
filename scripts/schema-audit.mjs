#!/usr/bin/env node
/**
 * Audita columnas/tablas requeridas por OXY Agenda en GDL y TX.
 * Uso: node scripts/schema-audit.mjs
 * Carga SUPABASE_* desde .env.vercel.gdl + .env.vercel.houston si existen.
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

function loadEnvFile(path) {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq);
    let val = trimmed.slice(eq + 1);
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = val;
  }
}

loadEnvFile(resolve(root, '.env.vercel.gdl'));
loadEnvFile(resolve(root, '.env.vercel.houston'));
loadEnvFile(resolve(root, '.env.local'));

function clientFor(id) {
  if (id === 'TX') {
    const url = process.env.SUPABASE_TX_URL || process.env.NEXT_PUBLIC_SUPABASE_TX_URL;
    const key = process.env.SUPABASE_TX_SERVICE_ROLE_KEY;
    return createClient(url, key, { auth: { persistSession: false } });
  }
  const url = process.env.SUPABASE_GDL_URL || process.env.NEXT_PUBLIC_SUPABASE_GDL_URL;
  const key = process.env.SUPABASE_GDL_SERVICE_ROLE_KEY;
  return createClient(url, key, { auth: { persistSession: false } });
}

const CLINICS = [
  { id: 'GDL', label: 'Guadalajara (Supabase GDL)' },
  { id: 'TX', label: 'Houston / Shenandoah (Supabase TX)' },
];

async function probeSelect(client, table, columns) {
  const { error } = await client.from(table).select(columns).limit(1);
  return { ok: !error, error: error?.message || null };
}

async function probeTableExists(client, table) {
  const { error } = await client.from(table).select('*', { count: 'exact', head: true });
  return { ok: !error, error: error?.message || null };
}

async function countRows(client, table, filter = null) {
  let q = client.from(table).select('*', { count: 'exact', head: true });
  if (filter) q = q.eq(filter.col, filter.val);
  const { count, error } = await q;
  if (error) return { error: error.message, count: null };
  return { count: count || 0, error: null };
}

const CHECKS = [
  {
    id: 'gdl_locations',
    label: 'Sedes GDL (appointments/services/blocked_slots.clinic + Oxygengdl2)',
    only: 'GDL',
    async run(client) {
      const cols = await probeSelect(client, 'appointments', 'id, clinic');
      if (!cols.ok) return { status: 'missing', detail: cols.error };
      const cfg2 = await countRows(client, 'company_config', { col: 'clinic', val: 'Oxygengdl2' });
      const svc2 = await countRows(client, 'services', { col: 'clinic', val: 'Oxygengdl2' });
      if (cfg2.error) return { status: 'missing', detail: cfg2.error };
      if ((cfg2.count || 0) < 1) return { status: 'partial', detail: 'Falta fila company_config para Oxygengdl2' };
      if ((svc2.count || 0) < 1) return { status: 'partial', detail: 'Sin servicios en Oxygengdl2' };
      return { status: 'ok', detail: `Oxygengdl2: config=${cfg2.count}, servicios=${svc2.count}` };
    },
  },
  {
    id: 'staff_login',
    label: 'Login staff (staff_login_attempts + users_staff email/phone)',
    only: 'both',
    async run(client, clinicId) {
      const table = await probeTableExists(client, 'staff_login_attempts');
      const staffCols = await probeSelect(client, 'users_staff', 'id, email, phone, notify_on_booking');
      const issues = [];
      if (clinicId === 'GDL' && !table.ok) issues.push(`staff_login_attempts: ${table.error}`);
      if (!staffCols.ok) issues.push(`users_staff: ${staffCols.error}`);
      if (issues.length) return { status: 'missing', detail: issues.join('; ') };
      return { status: 'ok', detail: clinicId === 'GDL' ? 'tabla + columnas OK' : 'columnas users_staff OK' };
    },
  },
  {
    id: 'first_session_notes',
    label: 'Indicaciones primera sesión (services.first_session_notes)',
    only: 'both',
    async run(client) {
      const r = await probeSelect(client, 'services', 'id, first_session_notes');
      return r.ok ? { status: 'ok' } : { status: 'missing', detail: r.error };
    },
  },
  {
    id: 'session_groups',
    label: 'Carteras compartidas (session_groups + patients.session_group_id)',
    only: 'both',
    async run(client) {
      const t = await probeTableExists(client, 'session_groups');
      const p = await probeSelect(client, 'patients', 'id, session_group_id');
      if (!t.ok) return { status: 'missing', detail: t.error };
      if (!p.ok) return { status: 'missing', detail: p.error };
      return { status: 'ok' };
    },
  },
  {
    id: 'appointment_overrides',
    label: 'Overrides staff en citas',
    only: 'both',
    async run(client) {
      const r = await probeSelect(client, 'appointments', 'id, outside_normal_hours, is_extended_block');
      return r.ok ? { status: 'ok' } : { status: 'missing', detail: r.error };
    },
  },
  {
    id: 'service_hours',
    label: 'Horario por servicio (services.start_time/end_time)',
    only: 'both',
    async run(client) {
      const r = await probeSelect(client, 'services', 'id, start_time, end_time');
      return r.ok ? { status: 'ok' } : { status: 'missing', detail: r.error };
    },
  },
  {
    id: 'company_config_full',
    label: 'Config admin completa (weekly_schedule, notify_*, calendar_feed)',
    only: 'both',
    async run(client) {
      const r = await probeSelect(
        client,
        'company_config',
        'id, weekly_schedule, notify_auto_booking, calendar_feed_enabled, staff_alert_phones',
      );
      return r.ok ? { status: 'ok' } : { status: 'missing', detail: r.error };
    },
  },
  {
    id: 'promoters_feed',
    label: 'Promotores con feed (promoters.calendar_feed_token)',
    only: 'both',
    async run(client) {
      const r = await probeSelect(client, 'promoters', 'id, calendar_feed_token, notes');
      if (r.ok) return { status: 'ok' };
      const basic = await probeSelect(client, 'promoters', 'id, code, name');
      return basic.ok ? { status: 'partial', detail: 'promoters sin calendar_feed_token/notes' } : { status: 'missing', detail: r.error };
    },
  },
];

const ICON = { ok: '✓', missing: '✗', partial: '⚠' };

async function main() {
  console.log('OXY Agenda — Auditoría de esquema SQL\n');

  const summary = { GDL: [], TX: [] };

  for (const clinic of CLINICS) {
    console.log(`\n### ${clinic.label}`);
    const client = clientFor(clinic.id);
    if (!client.supabaseUrl || !client.supabaseKey) {
      console.log('  ✗ Sin credenciales SUPABASE en entorno local');
      continue;
    }

    for (const check of CHECKS) {
      if (check.only === 'GDL' && clinic.id !== 'GDL') continue;
      const result = await check.run(client, clinic.id);
      const icon = ICON[result.status] || '?';
      const detail = result.detail ? ` — ${result.detail}` : '';
      console.log(`  ${icon} ${check.label}${detail}`);
      if (result.status !== 'ok') {
        summary[clinic.id].push({ id: check.id, label: check.label, status: result.status, detail: result.detail });
      }
    }
  }

  console.log('\n### Resumen');
  for (const id of ['GDL', 'TX']) {
    const missing = summary[id].filter((x) => x.status === 'missing');
    const partial = summary[id].filter((x) => x.status === 'partial');
    if (!missing.length && !partial.length) {
      console.log(`  ${id}: todo OK`);
    } else {
      if (missing.length) console.log(`  ${id} faltante: ${missing.map((m) => m.id).join(', ')}`);
      if (partial.length) console.log(`  ${id} parcial: ${partial.map((m) => m.id).join(', ')}`);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
