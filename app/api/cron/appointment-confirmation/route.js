import { NextResponse } from 'next/server';
import { authorizeCron } from '../../../../lib/cronAuth.js';
import { CLINIC_SHENANDOAH } from '../../../../lib/clinicRegistry.js';
import { getSupabaseAdmin } from '../../../../lib/supabaseAdmin.js';
import { runAppointmentConfirmationCron } from '../../../../lib/appointmentConfirmation.js';

export async function GET(request) {
  const denied = authorizeCron(request);
  if (denied) return denied;

  try {
    const supabase = getSupabaseAdmin(CLINIC_SHENANDOAH);
    const result = await runAppointmentConfirmationCron({
      supabase,
      clinicName: CLINIC_SHENANDOAH,
    });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ ok: false, error: error.message || 'Cron failed' }, { status: 500 });
  }
}
