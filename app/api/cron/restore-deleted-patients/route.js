import { NextResponse } from 'next/server';
import { authorizeCron } from '../../../../lib/cronAuth.js';
import { getSupabaseAdmin } from '../../../../lib/supabaseAdmin.js';
import { CLINIC_OXYGENDGL } from '../../../../lib/clinicRegistry.js';
import { restoreDeletedPatients } from '../../../../lib/restoreDeletedPatients.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

/**
 * Restore patient charts wrongly deleted by duplicate repair.
 * GET ?dryRun=1 — preview only
 */
export async function GET(request) {
  const denied = authorizeCron(request);
  if (denied) return denied;

  const { searchParams } = new URL(request.url);
  const dryRun = searchParams.get('dryRun') === '1';

  try {
    const supabase = getSupabaseAdmin(CLINIC_OXYGENDGL);
    const result = await restoreDeletedPatients(supabase, {
      dryRun,
      changedBy: 'Cron / restauración expedientes',
    });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ ok: false, error: error.message || 'Restore failed' }, { status: 500 });
  }
}
