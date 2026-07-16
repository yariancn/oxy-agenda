import { NextResponse } from 'next/server';
import { authorizeCron } from '../../../../lib/cronAuth.js';
import { CLINIC_OXYGENDGL, CLINIC_SHENANDOAH } from '../../../../lib/clinicRegistry.js';
import { getSupabaseAdmin } from '../../../../lib/supabaseAdmin.js';
import { runAppointmentConfirmationCron } from '../../../../lib/appointmentConfirmation.js';
import { runAppointmentReminderCron } from '../../../../lib/appointmentReminder.js';

async function runRemindersForClinic(clinicName) {
  const supabase = getSupabaseAdmin(clinicName);
  const { data: config } = await supabase
    .from('company_config')
    .select('*')
    .eq('clinic', clinicName)
    .maybeSingle();

  return runAppointmentReminderCron({
    supabase,
    clinicName,
    companyConfig: config || {},
  });
}

export async function GET(request) {
  const denied = authorizeCron(request);
  if (denied) return denied;

  try {
    const supabaseTx = getSupabaseAdmin(CLINIC_SHENANDOAH);
    const confirmation = await runAppointmentConfirmationCron({
      supabase: supabaseTx,
      clinicName: CLINIC_SHENANDOAH,
    });

    const reminders = {
      [CLINIC_SHENANDOAH]: await runRemindersForClinic(CLINIC_SHENANDOAH),
      [CLINIC_OXYGENDGL]: await runRemindersForClinic(CLINIC_OXYGENDGL),
    };

    return NextResponse.json({ ok: true, confirmation, reminders });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error.message || 'Cron failed' }, { status: 500 });
  }
}
