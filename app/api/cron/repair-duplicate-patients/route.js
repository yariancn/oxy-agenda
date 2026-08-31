import { NextResponse } from 'next/server';
import { authorizeCron } from '../../../../lib/cronAuth.js';
import { getSupabaseAdmin } from '../../../../lib/supabaseAdmin.js';
import { CLINIC_OXYGENDGL } from '../../../../lib/clinicRegistry.js';
import { repairDuplicatePatientsByName } from '../../../../lib/deletePatientChart.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * One-shot / manual repair for duplicate patient charts by name.
 * GET ?name=lucia%20torres  (default: lucia torres)
 */
export async function GET(request) {
  const denied = authorizeCron(request);
  if (denied) return denied;

  const { searchParams } = new URL(request.url);
  const name = String(searchParams.get('name') || 'lucia torres').trim();

  try {
    const supabase = getSupabaseAdmin(CLINIC_OXYGENDGL);
    const result = await repairDuplicatePatientsByName(supabase, {
      nameQuery: name,
      changedBy: 'Cron / reparación duplicados',
    });
    const status = result.ok ? 200 : 400;
    return NextResponse.json(result, { status });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error.message || 'Repair failed' }, { status: 500 });
  }
}
