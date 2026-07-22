/**
 * One-shot: set prefers_sms=false for all patients + clinic SMS defaults off (non-first).
 * Usage:
 *   npx vercel env run -e production --project oxy-agenda-gdl -- node scripts/migrate-sms-optin.mjs gdl
 *   npx vercel env run -e production --project oxy-agenda-houston -- node scripts/migrate-sms-optin.mjs tx
 */
import { createClient } from '@supabase/supabase-js';

const target = String(process.argv[2] || '').toLowerCase();
const env = process.env;

function pick(urlKeys, keyKeys) {
  for (const u of urlKeys) {
    for (const k of keyKeys) {
      if (env[u] && env[k] && !String(env[k]).includes('[SENSITIVE]')) {
        return { url: env[u], key: env[k] };
      }
    }
  }
  return null;
}

const gdl = pick(
  ['SUPABASE_GDL_URL', 'NEXT_PUBLIC_SUPABASE_GDL_URL'],
  ['SUPABASE_GDL_SERVICE_ROLE_KEY'],
);
const tx = pick(
  ['SUPABASE_TX_URL', 'NEXT_PUBLIC_SUPABASE_TX_URL', 'NEXT_PUBLIC_SUPABASE_URL'],
  ['SUPABASE_TX_SERVICE_ROLE_KEY'],
);

const clinics = [];
if ((!target || target === 'gdl' || target === 'both') && gdl) clinics.push(['GDL', gdl]);
if ((!target || target === 'tx' || target === 'houston' || target === 'both') && tx) clinics.push(['TX', tx]);

if (!clinics.length) {
  console.error('No service-role credentials in env. Pass gdl|tx and run via vercel env run.');
  process.exit(1);
}

const CHUNK = 250;

async function migrate(label, { url, key }) {
  const sb = createClient(url, key, { auth: { persistSession: false } });
  console.log(`\n=== ${label} ===`);

  const { data: patients, error: pErr } = await sb.from('patients').select('id, prefers_sms');
  if (pErr) throw new Error(`patients select: ${pErr.message}`);
  const fixPatients = (patients || []).filter((p) => p.prefers_sms !== false);
  console.log('patients', patients?.length, 'sms not-false', fixPatients.length);
  for (let i = 0; i < fixPatients.length; i += CHUNK) {
    const ids = fixPatients.slice(i, i + CHUNK).map((p) => p.id);
    const { error } = await sb.from('patients').update({ prefers_sms: false }).in('id', ids);
    if (error) throw new Error(`patients update: ${error.message}`);
  }

  const { error: aProbe } = await sb.from('appointments').select('id').limit(1);
  void aProbe;
  const { data: apps, error: aErr } = await sb.from('appointments').select('id, prefers_sms');
  if (aErr) {
    console.log('appointments skip:', aErr.message);
  } else {
    const fixApps = (apps || []).filter((a) => a.prefers_sms !== false);
    console.log('appointments', apps?.length, 'sms not-false', fixApps.length);
    for (let i = 0; i < fixApps.length; i += CHUNK) {
      const ids = fixApps.slice(i, i + CHUNK).map((a) => a.id);
      const { error } = await sb.from('appointments').update({ prefers_sms: false }).in('id', ids);
      if (error) console.log('appointments update warn:', error.message);
    }
  }

  const { data: configs, error: cErr } = await sb.from('company_config').select('id, clinic');
  if (cErr) throw new Error(`company_config: ${cErr.message}`);
  for (const row of configs || []) {
    const { error } = await sb.from('company_config').update({
      notify_use_sms_booking: false,
      notify_use_sms_reschedule: false,
      notify_use_sms_cancel: false,
      notify_use_sms_reminder: false,
      notify_use_sms_first: true,
      notify_use_email_first: true,
      notify_use_email_booking: true,
      notify_use_email_reschedule: true,
      notify_use_email_cancel: true,
      notify_use_email_reminder: true,
    }).eq('id', row.id);
    if (error) throw new Error(`config ${row.clinic}: ${error.message}`);
    console.log('company_config updated', row.clinic || row.id);
  }

  const { count } = await sb.from('patients').select('id', { count: 'exact', head: true }).eq('prefers_sms', true);
  console.log('patients still prefers_sms=true:', count);
}

for (const [label, creds] of clinics) {
  await migrate(label, creds);
}
console.log('\nDONE');
