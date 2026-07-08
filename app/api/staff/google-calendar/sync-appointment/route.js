import { NextResponse } from 'next/server';
import {
  loadGoogleCalendarConfig,
  removeAppointmentFromGoogleCalendar,
  syncAppointmentToGoogleCalendar,
} from '../../../../../lib/googleCalendarSync.js';
import { canManageGoogleCalendar } from '../../../../../lib/googleCalendar.js';
import { readStaffSessionFromRequest } from '../../../../../lib/staffSession.js';
import { getSupabaseAdmin } from '../../../../../lib/supabaseAdmin.js';
import { normalizeClinicId } from '../../../../../lib/clinicRegistry.js';
import { feedDateWindow } from '../../../../../lib/calendarFeed.js';

export async function POST(request) {
  const user = readStaffSessionFromRequest(request);
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const clinic = normalizeClinicId(body.clinic || user.clinic || 'Oxygengdl');
  const appointmentId = body.appointmentId;
  const action = body.action === 'delete' ? 'delete' : 'upsert';
  const bulkSync = body.bulkSync === true;

  const supabase = getSupabaseAdmin(clinic);
  const configResult = await loadGoogleCalendarConfig(supabase, clinic);

  if (configResult.columnMissing) {
    return NextResponse.json({ skipped: true, reason: 'sql_required' });
  }
  if (configResult.error || !configResult.data) {
    return NextResponse.json({ error: configResult.error?.message || 'config_not_found' }, { status: 500 });
  }

  const companyConfig = configResult.data;
  if (!companyConfig.google_calendar_enabled || !companyConfig.google_calendar_refresh_token) {
    return NextResponse.json({ skipped: true, reason: 'not_connected' });
  }

  if (bulkSync) {
    if (!canManageGoogleCalendar(user)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { from, to } = feedDateWindow();
    const { data: appointments, error } = await supabase
      .from('appointments')
      .select('id, patient, phone, equipment, full_date, time, duration, buffer, check_in_status, notes, google_calendar_event_id')
      .gte('full_date', from)
      .lte('full_date', to)
      .neq('check_in_status', 'Cancelado');

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    let synced = 0;
    let failed = 0;
    for (const app of appointments || []) {
      const result = await syncAppointmentToGoogleCalendar({
        supabase,
        clinicName: clinic,
        companyConfig,
        appointment: app,
      });
      if (result.ok && !result.skipped) synced += 1;
      else if (!result.ok) failed += 1;
    }

    return NextResponse.json({ success: true, synced, failed, total: (appointments || []).length });
  }

  if (!appointmentId) {
    return NextResponse.json({ error: 'APPOINTMENT_ID_REQUIRED' }, { status: 400 });
  }

  const { data: appointment, error: appError } = await supabase
    .from('appointments')
    .select('id, patient, phone, equipment, full_date, time, duration, buffer, check_in_status, notes, google_calendar_event_id')
    .eq('id', appointmentId)
    .maybeSingle();

  if (appError) {
    return NextResponse.json({ error: appError.message }, { status: 500 });
  }
  if (!appointment) {
    return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });
  }

  const shouldDelete = action === 'delete' || appointment.check_in_status === 'Cancelado';
  const result = shouldDelete
    ? await removeAppointmentFromGoogleCalendar({
      supabase,
      clinicName: clinic,
      companyConfig,
      appointment,
    })
    : await syncAppointmentToGoogleCalendar({
      supabase,
      clinicName: clinic,
      companyConfig,
      appointment,
    });

  if (!result.ok) {
    return NextResponse.json({ success: false, error: result.error }, { status: 502 });
  }

  return NextResponse.json({ success: true, skipped: result.skipped || false, eventId: result.eventId });
}
