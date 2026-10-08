import { NextResponse } from 'next/server';
import { readStaffSessionFromRequest } from '../../../../lib/staffSession.js';
import { assertStaffClinicAccess } from '../../../../lib/staffDbServer.js';
import { getSupabaseAdmin } from '../../../../lib/supabaseAdmin.js';
import { localeForClinic, normalizeClinicId } from '../../../../lib/clinicRegistry.js';
import { sendPatientTextMessage } from '../../../../lib/clinicMessaging.js';
import {
  buildCapacitacionConfirmationSms,
  buildCapacitacionReminderSms,
  CAPACITACION_LIST_COLUMNS,
  normalizeAttendees,
  normalizeCapacitacion,
} from '../../../../lib/capacitaciones.js';
import { bumpAgendaLiveRev } from '../../../../lib/agendaLiveRev.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST { capacitacionId, kind: 'confirmation'|'reminder', clinic }
 * Sends SMS to attendees with a phone; stamps sent timestamps on the row.
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

    const attendees = normalizeAttendees(cap.attendees);
    const stamp = new Date().toISOString();
    let sent = 0;
    let skipped = 0;
    const errors = [];

    const nextAttendees = [];
    for (const att of attendees) {
      if (!att.phone) {
        skipped += 1;
        nextAttendees.push(att);
        continue;
      }
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

      const result = await sendPatientTextMessage({
        clinicName,
        phone: att.phone,
        smsBody,
        notifyType: kind === 'reminder' ? 'reminder' : 'booking',
        locale,
      });

      if (!result.ok) {
        errors.push({ attendeeId: att.id, error: result.error || 'sms_failed' });
        nextAttendees.push(att);
        continue;
      }

      sent += 1;
      nextAttendees.push({
        ...att,
        ...(kind === 'reminder'
          ? { reminder_sent_at: stamp }
          : { confirmation_sent_at: stamp, confirmation_status: 'pending' }),
      });
    }

    const { error: updErr } = await supabase
      .from('capacitaciones')
      .update({
        attendees: nextAttendees,
        updated_at: stamp,
      })
      .eq('id', capacitacionId);
    if (updErr) {
      return NextResponse.json({ ok: false, error: updErr.message, sent, skipped }, { status: 500 });
    }

    await bumpAgendaLiveRev(supabase, clinicName).catch(() => {});

    return NextResponse.json({
      ok: true,
      kind,
      sent,
      skipped,
      errors,
      attendees: nextAttendees,
    });
  } catch (err) {
    const status = err?.status || 500;
    return NextResponse.json({ ok: false, error: err?.message || 'failed' }, { status });
  }
}
