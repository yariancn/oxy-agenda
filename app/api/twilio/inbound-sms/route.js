import { NextResponse } from 'next/server';
import { CLINIC_SHENANDOAH } from '../../../../lib/clinicRegistry.js';
import { getSupabaseAdmin } from '../../../../lib/supabaseAdmin.js';
import { processConfirmationInboundReply } from '../../../../lib/processConfirmationInbound.js';
import { dispatchStaffConfirmationReplyAlert } from '../../../../lib/staffBookingAlert.js';
import { selectCompanyConfigForClinic } from '../../../../lib/clinicRegistry.js';
import { localeForClinic } from '../../../../lib/i18n.js';
import { applySmsOptOut, isSmsOptOutKeyword } from '../../../../lib/smsOptOut.js';

export async function POST(request) {
  try {
    const form = await request.formData();
    const from = String(form.get('From') || '');
    const body = String(form.get('Body') || '');

    const twiml = (message) => {
      const text = message.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      return new NextResponse(`<?xml version="1.0" encoding="UTF-8"?><Response><Message>${text}</Message></Response>`, {
        status: 200,
        headers: { 'Content-Type': 'text/xml' },
      });
    };

    if (isSmsOptOutKeyword(body)) {
      const supabase = getSupabaseAdmin(CLINIC_SHENANDOAH);
      const result = await applySmsOptOut({
        supabase,
        clinicName: CLINIC_SHENANDOAH,
        phone: from,
        body,
      });

      const [{ data: companyConfig }, { data: staffRoster }] = await Promise.all([
        selectCompanyConfigForClinic(supabase, CLINIC_SHENANDOAH),
        supabase.from('users_staff').select('name, email, phone, notify_on_booking, is_active').eq('is_active', true),
      ]);
      await dispatchStaffConfirmationReplyAlert({
        companyConfig: companyConfig || {},
        staffRoster: staffRoster || [],
        clinicName: CLINIC_SHENANDOAH,
        clinicDisplayName: companyConfig?.name,
        patientName: result.patientName || 'Patient',
        date: '',
        time: '',
        equipment: '',
        locale: localeForClinic(CLINIC_SHENANDOAH),
        reply: 'declined',
        replyText: `STOP / SMS opt-out${result.appointmentId ? ` · appt ${result.appointmentId}` : ''}`,
      }).catch(() => null);

      return twiml('You are unsubscribed from clinic text messages. Your appointment is marked pending cancellation until staff confirms. Reply START to opt in again, or call 7135913379.');
    }

    const result = await processConfirmationInboundReply({
      clinicName: CLINIC_SHENANDOAH,
      fromPhone: from,
      bodyText: body,
    });

    if (!result.ok && result.error === 'unrecognized_reply') {
      return twiml('Reply YES to confirm or NO to cancel your appointment.');
    }
    if (!result.ok && result.error === 'no_pending') {
      return twiml('We could not find a pending confirmation for this number. Please call the clinic.');
    }
    if (!result.ok) {
      return twiml('We could not process your reply. Please call the clinic.');
    }

    if (result.reply === 'confirmed') {
      return twiml(`Thanks ${result.appointment?.patient || ''}! Your appointment at ${result.appointment?.time || ''} is confirmed.`);
    }

    return twiml('We received your cancellation request. The clinic will confirm soon; your slot stays reserved until then.');
  } catch (err) {
    return new NextResponse('<?xml version="1.0" encoding="UTF-8"?><Response></Response>', {
      status: 200,
      headers: { 'Content-Type': 'text/xml' },
    });
  }
}
