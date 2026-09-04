#!/usr/bin/env node

/**
 * Respaldo JSON de tablas críticas GDL (pacientes, citas, auditoría, caja).
 *
 * Uso:
 *   npm run backup:gdl
 *   npm run backup:gdl -- --out=/ruta/carpeta
 */

import { createClient } from '@supabase/supabase-js';
import { backupClinicTables } from '../lib/clinicBackup.js';

const args = new Set(process.argv.slice(2));
const outArg = process.argv.find((a) => a.startsWith('--out='))?.split('=').slice(1).join('=');

function getSupabase() {
  const url = process.env.SUPABASE_GDL_URL || process.env.NEXT_PUBLIC_SUPABASE_GDL_URL;
  const key = process.env.SUPABASE_GDL_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('Faltan SUPABASE_GDL_URL y SUPABASE_GDL_SERVICE_ROLE_KEY en .env.local');
  }
  return createClient(url, key, { auth: { persistSession: false } });
}

async function main() {
  const supabase = getSupabase();
  console.log('\n💾 Respaldo GDL…');
  const { dir, manifest } = await backupClinicTables(supabase, {
    outDir: outArg || null,
    label: 'gdl',
  });

  console.log('\n✓ Respaldo guardado en:');
  console.log(`  ${dir}`);
  for (const [table, info] of Object.entries(manifest.tables)) {
    if (info.skipped) console.log(`  · ${table}: omitida (${info.reason})`);
    else console.log(`  · ${table}: ${info.count} filas`);
  }
}

main().catch((err) => {
  console.error('\n❌', err.message || err);
  process.exit(1);
});
