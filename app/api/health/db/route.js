import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '../../../../lib/supabaseAdmin.js';

function decodeJwtClaims(key) {
  if (!String(key || '').startsWith('eyJ')) return null;
  try {
    const payload = key.split('.')[1];
    return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
}

function keyKind(value) {
  const key = String(value || '').trim();
  if (!key) return 'missing';
  if (key.startsWith('sb_publishable_')) return 'publishable_wrong';
  if (key.startsWith('sb_secret_')) return 'secret_ok_format';
  if (key.startsWith('eyJ')) {
    const claims = decodeJwtClaims(key);
    if (claims?.role === 'anon') return 'jwt_anon_wrong';
    if (claims?.role === 'service_role') return 'jwt_service_role';
    return 'jwt_unknown_role';
  }
  return 'unknown_format';
}

function keyDiagnostics(key, urlProjectId) {
  const trimmed = String(key || '').trim();
  const kind = keyKind(trimmed);
  const claims = decodeJwtClaims(trimmed);
  const jwtRef = claims?.ref || null;
  const jwtRole = claims?.role || null;
  let hint = null;

  if (kind === 'publishable_wrong' || kind === 'jwt_anon_wrong') {
    hint = 'Pegaste la key pública (anon/publishable). Necesitas Secret key o service_role del mismo proyecto.';
  } else if (jwtRef && urlProjectId && jwtRef !== urlProjectId) {
    hint = `La key es del proyecto ${jwtRef} pero la URL apunta a ${urlProjectId}. Cópialas del mismo proyecto Supabase.`;
  } else if (kind === 'jwt_service_role' || kind === 'secret_ok_format') {
    hint = 'Formato correcto, pero Supabase la rechaza. En Settings → API Keys crea/copia una Secret key (sb_secret_...) o revela service_role legacy si sigue activa.';
  }

  return { kind, jwtRole, jwtRef, hint };
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

  const projectId = urlProjectId(trimmedUrl);
  const keyInfo = keyDiagnostics(trimmedKey, projectId);
  const base = {
    clinic: clinicName,
    urlProjectId: projectId,
    urlPresent: Boolean(trimmedUrl),
    keyKind: keyInfo.kind,
    jwtRole: keyInfo.jwtRole,
    jwtRef: keyInfo.jwtRef,
  };

  if (!trimmedUrl || !trimmedKey) {
    return { ...base, status: 'missing_credentials' };
  }

  if (keyInfo.kind === 'publishable_wrong' || keyInfo.kind === 'jwt_anon_wrong') {
    return { ...base, status: 'wrong_key_type', hint: keyInfo.hint };
  }

  if (keyInfo.hint && keyInfo.jwtRef && projectId && keyInfo.jwtRef !== projectId) {
    return { ...base, status: 'wrong_project', hint: keyInfo.hint };
  }

  try {
    const supabase = getSupabaseAdmin(clinicName);
    const { data, error } = await supabase.from('services').select('name').limit(1);
    if (error) {
      return {
        ...base,
        status: 'error',
        hint: keyInfo.hint || error.message,
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
