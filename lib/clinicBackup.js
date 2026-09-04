import { mkdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

/** Tables with patient / operational data worth backing up before destructive ops. */
export const BACKUP_TABLES = [
  'patients',
  'appointments',
  'audit_logs',
  'session_groups',
  'petty_cash_expenses',
  'cash_drawer_events',
];

export async function fetchAllRows(supabase, table, orderCol = 'id') {
  const all = [];
  let from = 0;
  const step = 1000;
  while (true) {
    const { data, error } = await supabase
      .from(table)
      .select('*')
      .order(orderCol, { ascending: true })
      .range(from, from + step - 1);
    if (error) throw new Error(`${table}: ${error.message}`);
    if (!data?.length) break;
    all.push(...data);
    if (data.length < step) break;
    from += step;
  }
  return all;
}

/**
 * Export clinic tables to JSON files under outDir (or ~/Downloads/oxy-backup-{label}-{stamp}).
 */
export async function backupClinicTables(supabase, {
  tables = BACKUP_TABLES,
  outDir = null,
  label = 'gdl',
} = {}) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const dir = outDir || join(homedir(), 'Downloads', `oxy-backup-${label}-${stamp}`);
  mkdirSync(dir, { recursive: true });

  const manifest = {
    at: new Date().toISOString(),
    label,
    tables: {},
  };

  for (const table of tables) {
    try {
      const rows = await fetchAllRows(supabase, table);
      writeFileSync(join(dir, `${table}.json`), JSON.stringify(rows));
      manifest.tables[table] = { count: rows.length, file: `${table}.json` };
    } catch (error) {
      const msg = String(error.message || error);
      if (/does not exist|schema cache/i.test(msg)) {
        manifest.tables[table] = { skipped: true, reason: msg };
        continue;
      }
      throw error;
    }
  }

  writeFileSync(join(dir, 'manifest.json'), JSON.stringify(manifest, null, 2));
  return { dir, manifest };
}
