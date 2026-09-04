#!/usr/bin/env node

/**
 * Importa clientes Setmore (Unknown-3) como expedientes activos SIN borrar nada.
 * Pacientes que ya existen (mismo teléfono) se omiten.
 *
 * Uso:
 *   npm run import-setmore:customers:gdl:dry
 *   npm run import-setmore:customers:gdl
 *
 * Archivo por defecto: ~/Downloads/Unknown-3
 */

import { createClient } from '@supabase/supabase-js';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { fetchAllRows } from '../lib/clinicBackup.js';
import { digitsOnly, loadSetmoreCustomers } from '../lib/setmoreImport.js';

const DOWNLOADS = join(homedir(), 'Downloads');
const args = new Set(process.argv.slice(2));
const dryRun = args.has('--dry-run');
const fileArg = process.argv.find((a) => a.startsWith('--customers='))?.split('=').slice(1).join('=');
const customersPath = fileArg || join(DOWNLOADS, 'Unknown-3');

const CUSTOMER_NOTE = 'Directorio Setmore — sin cita 2026 al importar';

function getSupabase() {
  const url = process.env.SUPABASE_GDL_URL || process.env.NEXT_PUBLIC_SUPABASE_GDL_URL;
  const key = process.env.SUPABASE_GDL_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('Faltan SUPABASE_GDL_URL y SUPABASE_GDL_SERVICE_ROLE_KEY en .env.local');
  }
  return createClient(url, key, { auth: { persistSession: false } });
}

function patientPhoneLast10(row) {
  return digitsOnly(row?.Phone || row?.phone || '').slice(-10);
}

async function insertPatients(supabase, patients) {
  let inserted = 0;
  const batchSize = 100;
  for (let i = 0; i < patients.length; i += batchSize) {
    const batch = patients.slice(i, i + batchSize);
    const { error } = await supabase.from('patients').insert(batch);
    if (error) throw new Error(`patients insert: ${error.message}`);
    inserted += batch.length;
    process.stdout.write(`\r  Pacientes nuevos: ${inserted}/${patients.length}`);
  }
  if (patients.length) process.stdout.write('\n');
  return inserted;
}

async function main() {
  console.log(`\n📂 Clientes Setmore: ${customersPath}`);
  const customers = loadSetmoreCustomers(customersPath);
  console.log(`  Filas válidas (nombre + teléfono): ${customers.length}`);

  if (!customers.length) {
    throw new Error('No se encontraron clientes. Verifica la ruta del archivo Unknown-3.');
  }

  const supabase = getSupabase();
  const existing = await fetchAllRows(supabase, 'patients');
  const existingPhones = new Set(
    existing.map((p) => patientPhoneLast10(p)).filter((p) => p.length === 10),
  );

  const toInsert = customers.filter((c) => !existingPhones.has(c.Phone));
  const skipped = customers.length - toInsert.length;

  console.log('\n📊 Plan');
  console.log(`  En base hoy:     ${existing.length}`);
  console.log(`  Ya registrados:  ${skipped} (mismo teléfono — no se tocan)`);
  console.log(`  Nuevos a crear:  ${toInsert.length}`);

  if (dryRun) {
    console.log('\n[dry-run] Sin cambios.');
    console.log('  Muestra nuevos:', toInsert.slice(0, 8).map((c) => c.Name));
    return;
  }

  if (!toInsert.length) {
    console.log('\n✓ No hay clientes nuevos que agregar.');
    return;
  }

  const rows = toInsert.map((c) => ({
    Name: c.Name,
    Phone: c.Phone,
    Email: c.Email || '',
    protocol: 'Wellness',
    notes: CUSTOMER_NOTE,
    prefers_email: true,
    prefers_sms: false,
    prefers_sms_reminder: true,
  }));

  console.log('\n⬆️  Insertando expedientes (sin borrar existentes)…');
  await insertPatients(supabase, rows);

  const { count } = await supabase.from('patients').select('*', { count: 'exact', head: true });
  console.log(`\n✅ Listo. Pacientes en base: ${count}`);
}

main().catch((err) => {
  console.error('\n❌', err.message || err);
  process.exit(1);
});
