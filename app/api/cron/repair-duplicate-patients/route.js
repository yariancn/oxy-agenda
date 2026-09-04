import { NextResponse } from 'next/server';
import { authorizeCron } from '../../../../lib/cronAuth.js';
import { getSupabaseAdmin } from '../../../../lib/supabaseAdmin.js';
import { CLINIC_OXYGENDGL } from '../../../../lib/clinicRegistry.js';
import { repairDuplicatePatientsByName } from '../../../../lib/deletePatientChart.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Manual repair for duplicate patient charts by exact/long name match.
 *
 * GET ?name=lucia%20torres%20santamaria&dryRun=1   — preview only
 * GET ?name=lucia%20torres%20santamaria&confirm=1  — delete duplicates (keeper = best chart)
 *
 * Requires name ≥ 8 chars. Never runs without dryRun=1 or confirm=1.
 */
export async function GET(request) {
  const denied = authorizeCron(request);
  if (denied) return denied;

  const { searchParams } = new URL(request.url);
  const name = String(searchParams.get('name') || '').trim();
  const dryRun = searchParams.get('dryRun') === '1';
  const confirm = searchParams.get('confirm') === '1';

  if (!name) {
    return NextResponse.json({
      ok: false,
      error: 'missing_name',
      hint: 'GET ?name=nombre%20completo&dryRun=1 para vista previa',
    }, { status: 400 });
  }

  if (!dryRun && !confirm) {
    return NextResponse.json({
      ok: false,
      error: 'confirm_required',
      hint: 'Agrega dryRun=1 (solo vista) o confirm=1 (ejecutar borrado de duplicados)',
    }, { status: 400 });
  }

  try {
    const supabase = getSupabaseAdmin(CLINIC_OXYGENDGL);
    const result = await repairDuplicatePatientsByName(supabase, {
      nameQuery: name,
      changedBy: 'Cron / reparación duplicados',
      dryRun,
    });
    const status = result.ok ? 200 : 400;
    return NextResponse.json(result, { status });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error.message || 'Repair failed' }, { status: 500 });
  }
}
