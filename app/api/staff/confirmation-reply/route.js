import { NextResponse } from 'next/server';
import { CLINIC_OXYGENDGL, isShenandoah, normalizeClinicId } from '../../../../lib/clinicRegistry.js';
import { readStaffSessionFromRequest } from '../../../../lib/staffSession.js';
import { assertStaffClinicAccess } from '../../../../lib/staffDbServer.js';
import { getSupabaseAdmin } from '../../../../lib/supabaseAdmin.js';
import {
  CONFIRMATION_STATUS,
  parseConfirmationReply,
} from '../../../../lib/appointmentConfirmation.js';
import { applyConfirmationReplyToAppointment } from '../../../../lib/processConfirmationInbound.js';

/**
 * Staff marks SI/NO when the patient replied by phone/WhatsApp
 * or when LabsMobile cannot deliver MO replies (common in MX without virtual number).
 */
export async function POST(request) {
  try {
    const user = readStaffSessionFromRequest(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const clinicName = normalizeClinicId(body.clinic || CLINIC_OXYGENDGL);
    try {
      assertStaffClinicAccess(user, clinicName);
    } catch {
      return NextResponse.json({ error: 'Clinic access denied' }, { status: 403 });
    }

    const appointmentId = body.appointmentId;
    if (!appointmentId) {
      return NextResponse.json({ error: 'appointmentId required' }, { status: 400 });
    }

    let reply = body.reply === 'confirmed' || body.reply === 'declined'
      ? body.reply
      : parseConfirmationReply(body.replyText || body.reply);
    if (!reply) {
      return NextResponse.json({ error: 'invalid_reply', message: 'Use SI or NO.' }, { status: 400 });
    }

    const supabase = getSupabaseAdmin(clinicName);
    const { data: appt, error } = await supabase
      .from('appointments')
      .select('id, patient, phone, time, full_date, equipment, confirmation_status, notes')
      .eq('id', appointmentId)
      .maybeSingle();
    if (error) throw error;
    if (!appt) return NextResponse.json({ error: 'not_found' }, { status: 404 });

    const status = appt.confirmation_status || CONFIRMATION_STATUS.NONE;
    if (
      status !== CONFIRMATION_STATUS.PENDING
      && status !== CONFIRMATION_STATUS.NO_RESPONSE
    ) {
      return NextResponse.json({
        ok: false,
        error: 'not_waiting',
        message: isShenandoah(clinicName)
          ? 'This appointment is not waiting for YES/NO.'
          : 'Esta cita no está esperando SI/NO.',
      }, { status: 400 });
    }

    const replyText = String(body.replyText || (reply === 'confirmed' ? 'SI' : 'NO')).trim().slice(0, 160);
    const staffLabel = user.name || user.email || 'Staff';

    const result = await applyConfirmationReplyToAppointment({
      supabase,
      clinicName,
      appointment: appt,
      reply,
      replyText: `${replyText} (staff: ${staffLabel})`,
      source: 'staff',
    });

    if (!result.ok) {
      return NextResponse.json({ ok: false, error: result.error }, { status: 400 });
    }

    return NextResponse.json({
      ok: true,
      reply: result.reply,
      status: result.nextStatus,
      appointmentId: appt.id,
    });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
