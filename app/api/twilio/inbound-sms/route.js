import { NextResponse } from 'next/server';
import { CLINIC_SHENANDOAH, getClinicTimezone, selectCompanyConfigForClinic } from '../../../../lib/clinicRegistry.js';
import { getSupabaseAdmin } from '../../../../lib/supabaseAdmin.js';
import {
  CONFIRMATION_STATUS,
  findPendingConfirmationByPhone,
  parseConfirmationReply,
} from '../../../../lib/appointmentConfirmation.js';
import { CANCEL_REQUEST_STATUS } from '../../../../lib/appointmentManage.js';
import {
  dispatchStaffConfirmationReplyAlert,
} from '../../../../lib/staffBookingAlert.js';
import { bumpAgendaLiveRev } from '../../../../lib/agendaLiveRev.js';
import { localeForClinic } from '../../../../lib/i18n.js';
import { insertAuditLog, publicCancelAuditLabels } from '../../../../lib/auditLog.js';

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
    // Look ahead enough for first visits booked several days out (e.g. next Friday).
    const fromIso = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const toIso = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

    const { data: appointments, error } = await supabase
      .from('appointments')
      .select('id, patient, phone, time, full_date, equipment, confirmation_status, confirmation_sent_at, notes')
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

    const stamp = new Date().toLocaleString('en-US', { timeZone: timezone });
    const declineNote = reply === 'declined'
      ? `[PATIENT SMS ${stamp}] Replied NO — cancellation pending staff approval.`
      : null;
    const newNotes = declineNote
      ? (match.notes ? `${match.notes}\n${declineNote}` : declineNote)
      : undefined;

    const { error: updateErr } = await supabase
      .from('appointments')
      .update({
        confirmation_status: nextStatus,
        confirmation_replied_at: new Date().toISOString(),
        confirmation_reply: String(body || '').trim().slice(0, 160),
        ...(reply === 'declined'
          ? {
            check_in_status: CANCEL_REQUEST_STATUS,
            ...(newNotes ? { notes: newNotes } : {}),
          }
          : {}),
      })
      .eq('id', match.id)
      .eq('confirmation_status', CONFIRMATION_STATUS.PENDING);

    if (updateErr) throw updateErr;

    // Refresh staff calendar so "Waiting for YES/NO" flips to Confirmed/Declined live.
    await bumpAgendaLiveRev(supabase, CLINIC_SHENANDOAH).catch(() => null);

    const [{ data: companyConfig }, { data: staffRoster }] = await Promise.all([
      selectCompanyConfigForClinic(supabase, CLINIC_SHENANDOAH),
      supabase
        .from('users_staff')
        .select('name, email, phone, notify_on_booking, is_active')
        .eq('is_active', true),
    ]);

    const locale = localeForClinic(CLINIC_SHENANDOAH);

    // Always SMS/email staff with the patient's reply (YES or NO).
    await dispatchStaffConfirmationReplyAlert({
      companyConfig: companyConfig || {},
      staffRoster: staffRoster || [],
      clinicName: CLINIC_SHENANDOAH,
      clinicDisplayName: companyConfig?.name,
      patientName: match.patient,
      date: match.full_date,
      time: match.time,
      equipment: match.equipment,
      locale,
      reply,
      replyText: body,
    }).catch(() => null);

    if (reply === 'confirmed') {
      await insertAuditLog(supabase, {
        appointmentId: match.id,
        patientName: match.patient,
        action: 'CONFIRMACIÓN SMS (YES)',
        changedBy: 'Patient (SMS)',
        details: `${match.full_date} ${match.time} · ${match.equipment || ''} · reply: ${String(body || '').trim().slice(0, 40)}`,
      });
      return twiml(`Thanks ${match.patient || ''}! Your appointment at ${match.time} is confirmed.`);
    }

    const cancelAudit = publicCancelAuditLabels(locale, 'sms_no');
    await insertAuditLog(supabase, {
      appointmentId: match.id,
      patientName: match.patient,
      action: cancelAudit.action,
      changedBy: cancelAudit.changedBy,
      details: `Pending approval · ${match.full_date} ${match.time} · ${match.equipment || ''} · reply: ${String(body || '').trim().slice(0, 40)}`,
    });

    return twiml('We received your cancellation request. The clinic will confirm soon; your slot stays reserved until then.');
  } catch (err) {
    return new NextResponse('<?xml version="1.0" encoding="UTF-8"?><Response></Response>', {
      status: 200,
      headers: { 'Content-Type': 'text/xml' },
    });
  }
}
