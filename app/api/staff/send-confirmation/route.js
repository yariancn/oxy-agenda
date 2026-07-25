import { NextResponse } from 'next/server';
import { CLINIC_SHENANDOAH, isShenandoah, normalizeClinicId } from '../../../../lib/clinicRegistry.js';
import { readStaffSessionFromRequest } from '../../../../lib/staffSession.js';
import { getSupabaseAdmin } from '../../../../lib/supabaseAdmin.js';
import { sendConfirmationSmsForAppointment } from '../../../../lib/appointmentConfirmation.js';
import { assertStaffClinicAccess } from '../../../../lib/staffDbServer.js';

const ERROR_MESSAGES = {
  not_houston: 'SMS confirmation is only for Houston.',
  disabled: 'Confirmation SMS is disabled in Admin → Messages.',
  not_found: 'Appointment not found.',
  not_eligible: 'This appointment is not eligible (not a first session, no phone, or SMS off).',
  outside_window: 'Outside automatic send window.',
  invalid_phone: 'Invalid phone number.',
  invalid_datetime: 'Invalid appointment date or time.',
  sms_failed: 'SMS could not be sent.',
};

export async function POST(request) {
  try {
    const user = readStaffSessionFromRequest(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const clinicName = normalizeClinicId(body.clinic || CLINIC_SHENANDOAH);
    try {
      assertStaffClinicAccess(user, clinicName);
    } catch {
      return NextResponse.json({ error: 'Clinic access denied' }, { status: 403 });
    }
    if (!isShenandoah(clinicName)) {
      return NextResponse.json({ ok: false, error: 'not_houston' }, { status: 400 });
    }

    const appointmentId = body.appointmentId;
    if (!appointmentId) {
      return NextResponse.json({ error: 'appointmentId required' }, { status: 400 });
    }

    const supabase = getSupabaseAdmin(clinicName);
    const result = await sendConfirmationSmsForAppointment({
      supabase,
      appointmentId,
      clinicName,
      force: true,
    });

    if (!result.ok) {
      return NextResponse.json(
        {
          ok: false,
          error: result.error,
          message: ERROR_MESSAGES[result.error] || result.error,
        },
        { status: result.error === 'not_found' ? 404 : 400 },
      );
    }

    return NextResponse.json({
      ok: true,
      sentAt: result.sentAt,
      appointmentId: result.appointmentId,
    });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
