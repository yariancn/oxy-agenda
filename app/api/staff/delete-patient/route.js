import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '../../../../lib/supabaseAdmin.js';
import {
  attachStaffSessionCookie,
  resolveStaffApiUser,
} from '../../../../lib/staffApiSession.js';
import { assertStaffClinicAccess } from '../../../../lib/staffDbServer.js';
import { deletePatientChart } from '../../../../lib/deletePatientChart.js';
import { ROLE_LEVEL } from '../../../../lib/agent/constants.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST { clinic, patientId, keepPatientId?, reason? }
 * Managers+ only. Deletes a duplicate/orphan patient chart.
 */
export async function POST(request) {
  try {
    const user = await resolveStaffApiUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const level = Number(user.accessLevel);
    if (!Number.isFinite(level) || level > ROLE_LEVEL.MANAGER) {
      return NextResponse.json({ error: 'Solo gerencia puede eliminar expedientes.' }, { status: 403 });
    }

    const body = await request.json().catch(() => ({}));
    const clinic = body.clinic || user.clinic;
    assertStaffClinicAccess(user, clinic);

    const patientId = body.patientId || body.id;
    if (!patientId) {
      return NextResponse.json({ error: 'Falta patientId' }, { status: 400 });
    }

    const supabase = getSupabaseAdmin(clinic);
    const result = await deletePatientChart(supabase, {
      patientId,
      keepPatientId: body.keepPatientId || null,
      changedBy: user.name || user.email || 'Gerencia',
      reason: String(body.reason || 'Eliminar expediente').slice(0, 200),
    });

    if (!result.ok) {
      return NextResponse.json({ error: result.error || 'Delete failed' }, { status: 400 });
    }

    const response = NextResponse.json({ ok: true, ...result });
    return attachStaffSessionCookie(response, user);
  } catch (error) {
    const status = /Unauthorized|access denied/i.test(error.message) ? 401 : 500;
    return NextResponse.json({ error: error.message }, { status });
  }
}
