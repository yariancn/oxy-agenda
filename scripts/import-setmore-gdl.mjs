#!/usr/bin/env node

/**
 * Importa citas Setmore → Supabase GDL (Oxygengdl).
 *
 * Uso:
 *   npm run import-setmore:gdl:dry
 *   npm run import-setmore:gdl          # limpia TODO + importa
 *   npm run import-setmore:gdl -- --no-clear   # solo importa
 *
 * Archivos por defecto (~/Downloads):
 *   Appointments-2.xlsx  — ene–jul 2026 (histórico)
 *   Appointments-3.xlsx  — jul–dic 2026 (hoy + futuro)
 *   Unknown-3            — clientes (emails)
 */

import { createClient } from '@supabase/supabase-js';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { readSetmoreXlsx } from '../lib/setmoreXlsx.js';
import {
  IMPORT_NOTE,
  loadCustomerEmailIndex,
  mapSetmoreRow,
  mergeSetmoreRows,
  mexicoNow,
} from '../lib/setmoreImport.js';

const DOWNLOADS = join(homedir(), 'Downloads');
const DEFAULT_FILES = {
  history: join(DOWNLOADS, 'Appointments-2.xlsx'),
  future: join(DOWNLOADS, 'Appointments-3.xlsx'),
  customers: join(DOWNLOADS, 'Unknown-3'),
};

const args = new Set(process.argv.slice(2));
const dryRun = args.has('--dry-run');
const noClear = args.has('--no-clear');
const fileArg = (flag) => process.argv.find((a) => a.startsWith(`${flag}=`))?.split('=').slice(1).join('=');

const paths = {
  history: fileArg('--history') || DEFAULT_FILES.history,
  future: fileArg('--future') || DEFAULT_FILES.future,
  customers: fileArg('--customers') || DEFAULT_FILES.customers,
};

function getSupabase() {
  const url = process.env.SUPABASE_GDL_URL || process.env.NEXT_PUBLIC_SUPABASE_GDL_URL;
  const key = process.env.SUPABASE_GDL_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

async function wipeTable(supabase, table, selectCol = 'id') {
  let total = 0;
  while (true) {
    const { data, error } = await supabase.from(table).select(selectCol).limit(400);
    if (error) throw new Error(`${table}: ${error.message}`);
    if (!data?.length) break;
    const ids = data.map((r) => r[selectCol]);
    const { error: delErr } = await supabase.from(table).delete().in(selectCol, ids);
    if (delErr) throw new Error(`${table} delete: ${delErr.message}`);
    total += ids.length;
    process.stdout.write(`\r  ${table}: ${total} borrados…`);
  }
  if (total > 0) process.stdout.write('\n');
  return total;
}

async function clearAllData(supabase) {
  console.log('\n🧹 Limpieza total (datos de prueba)…');
  const audit = await wipeTable(supabase, 'audit_logs');
  const apps = await wipeTable(supabase, 'appointments');
  let groups = 0;
  try {
    groups = await wipeTable(supabase, 'session_groups');
  } catch (e) {
    if (!/does not exist|schema cache/i.test(String(e.message))) throw e;
  }
  const pats = await wipeTable(supabase, 'patients');
  console.log(`✓ Eliminados: ${apps} citas, ${pats} pacientes, ${audit} audit_logs, ${groups} session_groups`);
  return { apps, pats, audit, groups };
}

function loadRows() {
  console.log('\n📂 Leyendo archivos Setmore…');
  console.log(`  Histórico: ${paths.history}`);
  console.log(`  Futuro:    ${paths.future}`);
  console.log(`  Clientes:  ${paths.customers}`);

  const historyRows = readSetmoreXlsx(paths.history);
  const futureRows = readSetmoreXlsx(paths.future);
  const merged = mergeSetmoreRows([historyRows, futureRows], true);
  const emailByPhone = loadCustomerEmailIndex(paths.customers);

  console.log(`  Filas histórico: ${historyRows.length}`);
  console.log(`  Filas futuro:    ${futureRows.length}`);
  console.log(`  Tras dedupe ID:  ${merged.length}`);
  console.log(`  Emails clientes: ${emailByPhone.size}`);

  return { merged, emailByPhone };
}

async function buildImportPlan(services, merged, emailByPhone) {
  const now = mexicoNow();
  const mapped = [];
  const skipped = {};
  const overlaps = [];

  for (const row of merged) {
    const result = mapSetmoreRow(row, { services, emailByPhone, now });
    if (result.skip) {
      skipped[result.reason] = (skipped[result.reason] || 0) + 1;
      if (result.reason === 'unknown_service') {
        skipped._samples = skipped._samples || [];
        if (skipped._samples.length < 5) skipped._samples.push(result.setmoreService);
      }
      continue;
    }
    mapped.push(result);
  }

  mapped.sort((a, b) => {
    const d = a.appointment.full_date.localeCompare(b.appointment.full_date);
    if (d !== 0) return d;
    return a.appointment.time.localeCompare(b.appointment.time);
  });

  for (let i = 0; i < mapped.length; i += 1) {
    const a = mapped[i].appointment;
    const endA = timeToMins(a.time) + a.duration + a.buffer;
    for (let j = i + 1; j < mapped.length; j += 1) {
      const b = mapped[j].appointment;
      if (b.full_date !== a.full_date) break;
      if (b.equipment !== a.equipment) continue;
      const startB = timeToMins(b.time);
      const endB = startB + b.duration + b.buffer;
      const startA = timeToMins(a.time);
      if (startA < endB && endA > startB) {
        overlaps.push({ a: `${a.full_date} ${a.time} ${a.patient}`, b: `${b.full_date} ${b.time} ${b.patient}`, equipment: a.equipment });
        if (overlaps.length >= 20) break;
      }
    }
    if (overlaps.length >= 20) break;
  }

  const patientsByPhone = new Map();
  for (const item of mapped) {
    const phone10 = item.patient.Phone.replace(/\D/g, '').slice(-10);
    if (!patientsByPhone.has(phone10)) patientsByPhone.set(phone10, item.patient);
    else {
      const prev = patientsByPhone.get(phone10);
      if (!prev.Email && item.patient.Email) prev.Email = item.patient.Email;
    }
  }

  const past = mapped.filter((m) => m.appointment.full_date < now.dateStr).length;
  const today = mapped.filter((m) => m.appointment.full_date === now.dateStr).length;
  const future = mapped.filter((m) => m.appointment.full_date > now.dateStr).length;

  return {
    mapped,
    patients: [...patientsByPhone.values()],
    skipped,
    overlaps,
    stats: { past, today, future, total: mapped.length, patients: patientsByPhone.size },
  };
}

function timeToMins(timeStr) {
  const m = String(timeStr).match(/(\d+):(\d+)\s*(AM|PM)/i);
  if (!m) return 0;
  let h = Number(m[1]);
  const min = Number(m[2]);
  if (m[3].toUpperCase() === 'PM' && h !== 12) h += 12;
  if (m[3].toUpperCase() === 'AM' && h === 12) h = 0;
  return h * 60 + min;
}

async function insertPatients(supabase, patients) {
  let inserted = 0;
  const batchSize = 100;
  for (let i = 0; i < patients.length; i += batchSize) {
    const batch = patients.slice(i, i + batchSize);
    const { error } = await supabase.from('patients').insert(batch);
    if (error) throw new Error(`patients insert: ${error.message}`);
    inserted += batch.length;
    process.stdout.write(`\r  Pacientes: ${inserted}/${patients.length}`);
  }
  process.stdout.write('\n');
  return inserted;
}

async function insertAppointments(supabase, appointments) {
  let inserted = 0;
  const batchSize = 80;
  for (let i = 0; i < appointments.length; i += batchSize) {
    const batch = appointments.slice(i, i + batchSize);
    const { error } = await supabase.from('appointments').insert(batch);
    if (error) throw new Error(`appointments insert batch ${i}: ${error.message}`);
    inserted += batch.length;
    process.stdout.write(`\r  Citas: ${inserted}/${appointments.length}`);
  }
  process.stdout.write('\n');
  return inserted;
}

async function main() {
  const supabase = getSupabase();
  const url = process.env.SUPABASE_GDL_URL || process.env.NEXT_PUBLIC_SUPABASE_GDL_URL;
  const key = process.env.SUPABASE_GDL_SERVICE_ROLE_KEY;

  if (!dryRun && (!url || !key)) {
    console.error('\n❌ Faltan SUPABASE_GDL_URL y SUPABASE_GDL_SERVICE_ROLE_KEY en .env.local');
    console.error('   Supabase → Settings → API → service_role → pégala en .env.local');
    process.exit(1);
  }

  let services;
  if (supabase) {
    const { data, error: srvErr } = await supabase
      .from('services')
      .select('name, duration, buffer, is_active, clinic')
      .eq('is_active', true)
      .eq('clinic', 'Oxygengdl')
      .order('name');
    if (srvErr) throw srvErr;
    services = data;
  } else {
    services = [
      { name: 'CAMARA 1, 60 MIN', duration: 60, buffer: 30 },
      { name: 'CAMARA 2 60 MIN', duration: 60, buffer: 30 },
      { name: 'CAMARA 3 60 MIN', duration: 60, buffer: 30 },
      { name: 'VALORACION', duration: 45, buffer: 0 },
    ];
    console.log('\n[dry-run] Sin service_role — usando catálogo de servicios por defecto.');
  }

  if (!services?.length) throw new Error('No hay servicios activos para Oxygengdl');

  console.log('\n📋 Servicios en app:');
  for (const s of services) console.log(`  · ${s.name} (${s.duration}+${s.buffer})`);

  const { merged, emailByPhone } = loadRows();
  const plan = await buildImportPlan(services, merged, emailByPhone);

  console.log('\n📊 Plan de importación');
  console.log(`  Citas a insertar:  ${plan.stats.total}`);
  console.log(`  Pacientes únicos:  ${plan.stats.patients}`);
  console.log(`  Pasadas:           ${plan.stats.past}`);
  console.log(`  Hoy:               ${plan.stats.today}`);
  console.log(`  Futuras:           ${plan.stats.future}`);
  console.log('  Omitidas:', plan.skipped);
  if (plan.skipped._samples?.length) console.log('  Servicios desconocidos (muestra):', plan.skipped._samples);

  if (plan.overlaps.length) {
    console.log(`\n⚠️  ${plan.overlaps.length}+ empalmes detectados (revisar):`);
    for (const o of plan.overlaps.slice(0, 5)) {
      console.log(`  · ${o.equipment}: ${o.a} ↔ ${o.b}`);
    }
  }

  if (dryRun) {
    console.log('\n[dry-run] Sin cambios en la base de datos.');
    console.log('  Pacientes sin cartera/pagos (wallets={}, adeudo=0)');
    console.log(`  Nota en citas: "${IMPORT_NOTE}"`);
    return;
  }

  if (!noClear) {
    if (!supabase) throw new Error('Se requiere SUPABASE_GDL_SERVICE_ROLE_KEY para limpiar e importar');
    await clearAllData(supabase);
  }

  console.log('\n⬆️  Insertando pacientes (sin pagos ni cartera)…');
  await insertPatients(supabase, plan.patients);

  console.log('⬆️  Insertando citas…');
  const apptRows = plan.mapped.map((m) => m.appointment);
  await insertAppointments(supabase, apptRows);

  console.log('\n✅ Importación completa.');
  console.log('   Revisa el calendario en la app antes del corte con Setmore.');
}

main().catch((err) => {
  console.error('\n❌', err.message || err);
  process.exit(1);
});
