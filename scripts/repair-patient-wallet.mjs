/**
 * Repair wallet/adeudo mismatches (orphan paid sessions + false debt).
 *
 * Usage (with service_role in env):
 *   CLINIC=GDL PATIENT='Cecilia Lizeth Monisivais' node scripts/repair-patient-wallet.mjs
 *   CLINIC=TX PATIENT='Cecilia' DRY_RUN=1 node scripts/repair-patient-wallet.mjs
 */
import { createClient } from '@supabase/supabase-js';
import { reconcilePatientWalletState, sumWalletBalance } from '../lib/sessionWallet.js';

function env(name) {
  return String(process.env[name] || '').trim();
}

function clinicClient(clinic) {
  const isTx = /tx|houston|shenandoah/i.test(clinic);
  const url = isTx
    ? (env('SUPABASE_TX_URL') || env('NEXT_PUBLIC_SUPABASE_TX_URL'))
    : (env('SUPABASE_GDL_URL') || env('NEXT_PUBLIC_SUPABASE_GDL_URL'));
  const key = isTx
    ? env('SUPABASE_TX_SERVICE_ROLE_KEY')
    : env('SUPABASE_GDL_SERVICE_ROLE_KEY');
  if (!url || !key) {
    throw new Error(`Missing Supabase URL/service_role for ${clinic}`);
  }
  return {
    sb: createClient(url, key, { auth: { persistSession: false } }),
    nameCol: isTx ? 'name' : 'Name',
  };
}

async function findPatients(sb, nameCol, needle) {
  const q = `%${needle}%`;
  const { data, error } = await sb.from('patients').select('*').ilike(nameCol, q);
  if (error) throw error;
  return data || [];
}

async function main() {
  const clinic = env('CLINIC') || 'GDL';
  const needle = env('PATIENT') || 'Monisivais';
  const dryRun = env('DRY_RUN') === '1';
  const { sb, nameCol } = clinicClient(clinic);
  const rows = await findPatients(sb, nameCol, needle);
  if (!rows.length) {
    console.error(`No patients matching "${needle}" in ${clinic}`);
    process.exit(1);
  }

  for (const p of rows) {
    const name = p.Name || p.name;
    const before = {
      adeudo: Number(p.adeudo) || 0,
      historico: Number(p.historico_sesiones) || 0,
      wallets: p.wallets || {},
      pending: sumWalletBalance(p.wallets || {}),
      purchased: (p.package_history || []).reduce((s, t) => s + (Number(t.sessions) || 0), 0),
    };
    const fixed = reconcilePatientWalletState({
      wallets: p.wallets || {},
      adeudo: p.adeudo,
      historicoSesiones: p.historico_sesiones,
      packageHistory: p.package_history || [],
    });
    console.log(JSON.stringify({
      clinic,
      id: p.id,
      name,
      before,
      after: {
        adeudo: fixed.adeudo,
        historico: fixed.historico,
        wallets: fixed.wallets,
        pending: fixed.pending,
        purchased: fixed.purchased,
        cleared: fixed.cleared,
        trimmed: fixed.trimmed,
      },
      dryRun,
    }, null, 2));

    if (!fixed.changed) {
      console.log('→ already balanced');
      continue;
    }
    if (dryRun) {
      console.log('→ dry run, not saved');
      continue;
    }
    const { error } = await sb.from('patients').update({
      wallets: fixed.wallets,
      adeudo: fixed.adeudo,
    }).eq('id', p.id);
    if (error) throw error;
    console.log('→ saved');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
