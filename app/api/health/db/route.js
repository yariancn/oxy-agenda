import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '../../../../lib/supabaseAdmin.js';

function keyKind(value) {
  const key = String(value || '').trim();
  if (!key) return 'missing';
  if (key.startsWith('sb_publishable_')) return 'publishable_wrong';
  if (key.startsWith('sb_secret_')) return 'secret_ok_format';
  if (key.startsWith('eyJ')) return 'jwt_ok_format';
  return 'unknown_format';
}

function urlProjectId(url) {
  try {
    return new URL(url).hostname.split('.')[0];
  } catch {
    return null;
  }
}

async function probeClinic(clinicName, url, key) {
  const trimmedUrl = String(url || '').trim();
  const trimmedKey = String(key || '').trim();

  const base = {
    clinic: clinicName,
    urlProjectId: urlProjectId(trimmedUrl),
    urlPresent: Boolean(trimmedUrl),
    keyKind: keyKind(trimmedKey),
  };

  if (!trimmedUrl || !trimmedKey) {
    return { ...base, status: 'missing_credentials' };
  }

  if (base.keyKind === 'publishable_wrong') {
    return {
      ...base,
      status: 'wrong_key_type',
      hint: 'Pegaste la key publishable/anon. Usa service_role o sb_secret_ del mismo proyecto.',
    };
  }

  try {
    const supabase = getSupabaseAdmin(clinicName);
    const { data, error } = await supabase.from('services').select('name').limit(1);
    if (error) {
      return {
        ...base,
        status: 'error',
        hint: error.message,
      };
    }
    return {
      ...base,
      status: 'ok',
      sampleService: data?.[0]?.name || null,
    };
  } catch (error) {
    return {
      ...base,
      status: 'error',
      hint: error.message,
    };
  }
}

export async function GET() {
  const gdlUrl = process.env.SUPABASE_GDL_URL || process.env.NEXT_PUBLIC_SUPABASE_GDL_URL;
  const txUrl = process.env.SUPABASE_TX_URL || process.env.NEXT_PUBLIC_SUPABASE_TX_URL;
  const gdlKey = process.env.SUPABASE_GDL_SERVICE_ROLE_KEY;
  const txKey = process.env.SUPABASE_TX_SERVICE_ROLE_KEY;

  const [gdl, tx] = await Promise.all([
    probeClinic('Guadalajara', gdlUrl, gdlKey),
    probeClinic('Shenandoah', txUrl, txKey),
  ]);

  return NextResponse.json({
    buildSha: (process.env.VERCEL_GIT_COMMIT_SHA || 'dev').slice(0, 7),
    note: 'Cada clínica necesita SU PROPIA service_role key del SU PROPIO proyecto Supabase.',
    expected: {
      Guadalajara: 'yspysvrktdbyvduewlro',
      Shenandoah: 'dbvaoyunpumxokjfwukc',
    },
    gdl,
    tx,
    allOk: gdl.status === 'ok' && tx.status === 'ok',
  });
}
