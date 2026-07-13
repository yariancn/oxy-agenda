import { NextResponse } from 'next/server';
import { normalizeClinicId } from '../../../../lib/clinicRegistry.js';
import { notifyPromoterNoShow } from '../../../../lib/promoterNoShowNotify.js';
import { readStaffSessionFromRequest } from '../../../../lib/staffSession.js';
import { getSupabaseAdmin } from '../../../../lib/supabaseAdmin.js';

export async function POST(request) {
  try {
    const user = readStaffSessionFromRequest(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const clinicName = normalizeClinicId(body.clinic);
    const appointmentId = body.appointmentId;
    if (!appointmentId) {
      return NextResponse.json({ error: 'appointmentId required' }, { status: 400 });
    }

    const supabase = getSupabaseAdmin(clinicName);
    const { data: appointment, error: apptErr } = await supabase
      .from('appointments')
      .select('id, patient, time, full_date, equipment, promoter_code, check_in_status')
      .eq('id', appointmentId)
      .maybeSingle();
    if (apptErr) return NextResponse.json({ error: apptErr.message }, { status: 500 });
    if (!appointment) return NextResponse.json({ error: 'not_found' }, { status: 404 });
    if (appointment.check_in_status !== 'No Asistió') {
      return NextResponse.json({ ok: true, skipped: true, reason: 'not_no_show' });
    }

    const { data: companyConfig } = await supabase
      .from('company_config')
      .select('name')
      .eq('clinic', clinicName)
      .maybeSingle();

    const result = await notifyPromoterNoShow({
      supabase,
      appointment,
      clinicName,
      companyConfig: companyConfig || {},
    });

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
