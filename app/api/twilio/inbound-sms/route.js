import { NextResponse } from 'next/server';
import { CLINIC_SHENANDOAH, getClinicTimezone } from '../../../../lib/clinicRegistry.js';
import { getSupabaseAdmin } from '../../../../lib/supabaseAdmin.js';
import {
  CONFIRMATION_STATUS,
  findPendingConfirmationByPhone,
  parseConfirmationReply,
} from '../../../../lib/appointmentConfirmation.js';

export async function POST(request) {
  try {
    const form = await request.formData();
    const from = String(form.get('From') || '');
    const body = String(form.get('Body') || '');
    const reply = parseConfirmationReply(body);

    const twiml = (message) => {
      const text = message.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      return new NextResponse(`<?xml version="1.0" encoding="UTF-8"?><Response><Message>${text}</Message></Response>`, {
        status: 200,
        headers: { 'Content-Type': 'text/xml' },
      });
    };

    if (!reply) {
      return twiml('Reply YES to confirm or NO to cancel your appointment.');
    }

    const supabase = getSupabaseAdmin(CLINIC_SHENANDOAH);
    const timezone = getClinicTimezone(CLINIC_SHENANDOAH);
    const now = new Date();
    const fromIso = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const toIso = new Date(now.getTime() + 48 * 60 * 60 * 1000).toISOString().slice(0, 10);

    const { data: appointments, error } = await supabase
      .from('appointments')
      .select('id, patient, phone, time, full_date, equipment, confirmation_status, confirmation_sent_at')
      .gte('full_date', fromIso)
      .lte('full_date', toIso)
      .eq('confirmation_status', CONFIRMATION_STATUS.PENDING);
    if (error) throw error;

    const match = findPendingConfirmationByPhone({
      appointments: appointments || [],
      phone: from,
      timezone,
      clinicName: CLINIC_SHENANDOAH,
    });

    if (!match) {
      return twiml('We could not find a pending confirmation for this number. Please call the clinic.');
    }

    const nextStatus = reply === 'confirmed'
      ? CONFIRMATION_STATUS.CONFIRMED
      : CONFIRMATION_STATUS.DECLINED;

    const { error: updateErr } = await supabase
      .from('appointments')
      .update({
        confirmation_status: nextStatus,
        confirmation_replied_at: new Date().toISOString(),
        confirmation_reply: String(body || '').trim().slice(0, 160),
        ...(reply === 'declined' ? { check_in_status: 'Cancelado' } : {}),
      })
      .eq('id', match.id)
      .eq('confirmation_status', CONFIRMATION_STATUS.PENDING);

    if (updateErr) throw updateErr;

    if (reply === 'confirmed') {
      return twiml(`Thanks ${match.patient || ''}! Your appointment at ${match.time} is confirmed.`);
    }
    return twiml('Your appointment has been cancelled. Call us if you need to reschedule.');
  } catch (err) {
    return new NextResponse('<?xml version="1.0" encoding="UTF-8"?><Response></Response>', {
      status: 200,
      headers: { 'Content-Type': 'text/xml' },
    });
  }
}
