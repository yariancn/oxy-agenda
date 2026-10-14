import { NextResponse } from 'next/server';
import { readStaffSessionFromRequest } from '../../../../lib/staffSession.js';
import { assertStaffClinicAccess } from '../../../../lib/staffDbServer.js';
import { getSupabaseAdmin } from '../../../../lib/supabaseAdmin.js';
import { localeForClinic, normalizeClinicId } from '../../../../lib/clinicRegistry.js';
import { sendPatientTextMessage } from '../../../../lib/clinicMessaging.js';
import { getResendApiKey, getResendFromAddress } from '../../../../lib/resendConfig.js';
import {
  buildCapacitacionConfirmationSms,
  buildCapacitacionEmail,
  buildCapacitacionReminderSms,
  CAPACITACION_LIST_COLUMNS,
  normalizeAttendeeEmail,
  normalizeAttendees,
  normalizeCapacitacion,
} from '../../../../lib/capacitaciones.js';
import { bumpAgendaLiveRev } from '../../../../lib/agendaLiveRev.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function sendCapacitacionEmail({
  clinicName,
  to,
  subject,
  html,
  text,
}) {
  const resendKey = getResendApiKey();
  if (!resendKey) return { ok: false, error: 'missing_resend_api_key' };
  const from = getResendFromAddress(clinicName);
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${resendKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: [to],
      subject,
      html,
      text,
    }),
  });
  if (!res.ok) {
    const errBody = await res.text().catch(() => '');
    return { ok: false, error: errBody.slice(0, 200) || 'resend_error' };
  }
  return { ok: true };
}

/**
 * POST { capacitacionId, kind: 'confirmation'|'reminder', clinic }
 * Sends SMS (if phone) and/or email (if address) to each attendee.
 */
export async function POST(request) {
  try {
    const user = readStaffSessionFromRequest(request);
    if (!user) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const clinicName = normalizeClinicId(body.clinic || user.clinic);
    try {
      assertStaffClinicAccess(user, clinicName);
    } catch {
      return NextResponse.json({ ok: false, error: 'Clinic access denied' }, { status: 403 });
    }

    const kind = String(body.kind || '').toLowerCase() === 'reminder' ? 'reminder' : 'confirmation';
    const capacitacionId = body.capacitacionId;
    if (!capacitacionId) {
      return NextResponse.json({ ok: false, error: 'capacitacionId required' }, { status: 400 });
    }

    const supabase = getSupabaseAdmin(clinicName);
    const { data: row, error } = await supabase
      .from('capacitaciones')
      .select(CAPACITACION_LIST_COLUMNS)
      .eq('id', capacitacionId)
      .maybeSingle();
    if (error) {
      if (/capacitaciones|relation|schema cache/i.test(error.message || '')) {
        return NextResponse.json({
          ok: false,
          error: 'missing_table',
          message: 'Ejecuta scripts/supabase-capacitaciones.sql en Supabase.',
        }, { status: 400 });
      }
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }
    if (!row) return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 });

    const cap = normalizeCapacitacion(row);
    const locale = localeForClinic(clinicName);
    const { data: config } = await supabase
      .from('company_config')
      .select('phone, name')
      .eq('clinic', clinicName)
      .maybeSingle();
    const clinicPhone = String(config?.phone || '').trim();
    const clinicDisplayName = String(config?.name || '').trim() || clinicName;

    const attendees = normalizeAttendees(cap.attendees);
    const stamp = new Date().toISOString();
    let smsSent = 0;
    let emailSent = 0;
    let skipped = 0;
    let sampleBody = '';
    let sampleEmailSubject = '';
    const errors = [];

    const nextAttendees = [];
    for (const att of attendees) {
      const phone = String(att.phone || '').trim();
      const email = normalizeAttendeeEmail(att.email);
      if (!phone && !email) {
        skipped += 1;
        nextAttendees.push(att);
        continue;
      }

      let next = { ...att };
      let anyOk = false;

      if (phone) {
        const smsBody = kind === 'reminder'
          ? buildCapacitacionReminderSms({
            attendeeName: att.name,
            title: cap.title,
            fullDate: cap.full_date,
            startTime: cap.start_time,
            endTime: cap.end_time,
            location: cap.location,
            locale,
          })
          : buildCapacitacionConfirmationSms({
            attendeeName: att.name,
            title: cap.title,
            fullDate: cap.full_date,
            startTime: cap.start_time,
            endTime: cap.end_time,
            location: cap.location,
            clinicPhone,
            locale,
          });

        const smsResult = await sendPatientTextMessage({
          clinicName,
          phone,
          smsBody,
          notifyType: kind === 'reminder' ? 'reminder' : 'booking',
          locale,
        });

        if (smsResult.ok) {
          anyOk = true;
          smsSent += 1;
          if (!sampleBody) sampleBody = smsBody;
          next = {
            ...next,
            ...(kind === 'reminder'
              ? { reminder_sent_at: stamp }
              : { confirmation_sent_at: stamp, confirmation_status: 'pending' }),
          };
        } else {
          errors.push({ attendeeId: att.id, channel: 'sms', error: smsResult.error || 'sms_failed' });
        }
      }

      if (email) {
        const mail = buildCapacitacionEmail({
          kind,
          attendeeName: att.name,
          title: cap.title,
          fullDate: cap.full_date,
          startTime: cap.start_time,
          endTime: cap.end_time,
          location: cap.location,
          clinicDisplayName,
          clinicPhone,
          locale,
        });
        const emailResult = await sendCapacitacionEmail({
          clinicName,
          to: email,
          subject: mail.subject,
          html: mail.html,
          text: mail.text,
        });
        if (emailResult.ok) {
          anyOk = true;
          emailSent += 1;
          if (!sampleEmailSubject) sampleEmailSubject = mail.subject;
          if (!sampleBody) sampleBody = mail.text;
          next = {
            ...next,
            ...(kind === 'reminder'
              ? { reminder_email_sent_at: stamp }
              : { confirmation_email_sent_at: stamp, confirmation_status: next.confirmation_status || 'pending' }),
          };
        } else {
          errors.push({ attendeeId: att.id, channel: 'email', error: emailResult.error || 'email_failed' });
        }
      }

      if (!anyOk && (phone || email)) {
        // kept errors above
      }
      nextAttendees.push(next);
    }

    const { error: updErr } = await supabase
      .from('capacitaciones')
      .update({
        attendees: nextAttendees,
        updated_at: stamp,
      })
      .eq('id', capacitacionId);
    if (updErr) {
      return NextResponse.json({
        ok: false,
        error: updErr.message,
        smsSent,
        emailSent,
        skipped,
      }, { status: 500 });
    }

    await bumpAgendaLiveRev(supabase, clinicName).catch(() => {});

    return NextResponse.json({
      ok: true,
      kind,
      sent: smsSent + emailSent,
      smsSent,
      emailSent,
      skipped,
      errors,
      attendees: nextAttendees,
      sampleBody,
      sampleEmailSubject,
    });
  } catch (err) {
    const status = err?.status || 500;
    return NextResponse.json({ ok: false, error: err?.message || 'failed' }, { status });
  }
}
