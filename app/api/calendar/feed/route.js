import { NextResponse } from 'next/server';
import {
  buildAvailabilitySlotsForRange,
  buildFeedIcsContent,
  computeFeedRevision,
  feedDateWindow,
  filterAppointmentsForPromoter,
} from '../../../../lib/calendarFeed.js';
import {
  loadCompanyConfigForFeed,
  resolvePromoterFeedToken,
} from '../../../../lib/calendarFeedAuth.js';
import { normalizePromoCode } from '../../../../lib/promoters.js';
import { timezoneForClinic } from '../../../../lib/calendarLinks.js';
import { getSupabaseAdmin } from '../../../../lib/supabaseAdmin.js';

const PUBLIC_CLINICS = new Set(['Guadalajara', 'Shenandoah']);

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const clinic = searchParams.get('clinic') || '';
    const token = String(searchParams.get('token') || '').trim();

    if (!PUBLIC_CLINICS.has(clinic) || !token) {
      return new NextResponse('Not found', { status: 404 });
    }

    const supabase = getSupabaseAdmin(clinic);
    const { data: config, error: configError } = await loadCompanyConfigForFeed(supabase, clinic);

    if (configError || !config) {
      return new NextResponse('Not found', { status: 404 });
    }

    if (config.calendar_feed_enabled !== true) {
      return new NextResponse('Not found', { status: 404 });
    }

    let promoterCode = '';
    const clinicToken = String(config.calendar_feed_token || '').trim();
    if (clinicToken && clinicToken === token) {
      promoterCode = '';
    } else {
      const promoterResult = await resolvePromoterFeedToken(supabase, token);
      if (promoterResult.columnMissing) {
        return new NextResponse('Not found', { status: 404 });
      }
      const promoter = promoterResult.data;
      if (
        promoterResult.error
        || !promoter?.is_active
        || !promoter?.calendar_feed_token
        || promoter.calendar_feed_token !== token
      ) {
        return new NextResponse('Not found', { status: 404 });
      }
      promoterCode = normalizePromoCode(promoter.code);
    }

    const { from, to } = feedDateWindow();
    const [
      { data: appointments, error: appsError },
      { data: services, error: servicesError },
      { data: blockedSlots, error: blockedError },
    ] = await Promise.all([
      supabase
        .from('appointments')
        .select('id, patient, phone, equipment, full_date, time, duration, buffer, check_in_status, notes, promoter_code')
        .gte('full_date', from)
        .lte('full_date', to)
        .neq('check_in_status', 'Cancelado')
        .order('full_date', { ascending: true }),
      supabase
        .from('services')
        .select('name, duration, buffer, start_time, end_time, is_active'),
      supabase
        .from('blocked_slots')
        .select('*'),
    ]);

    if (appsError) {
      return NextResponse.json({ error: appsError.message }, { status: 500 });
    }
    if (servicesError) {
      return NextResponse.json({ error: servicesError.message }, { status: 500 });
    }
    if (blockedError) {
      return NextResponse.json({ error: blockedError.message }, { status: 500 });
    }

    const allAppointments = appointments || [];
    const scopedAppointments = promoterCode
      ? filterAppointmentsForPromoter(allAppointments, promoterCode)
      : allAppointments;

    const timezone = timezoneForClinic(clinic);
    const availabilitySlots = promoterCode
      ? buildAvailabilitySlotsForRange({
        companyConfig: config,
        services: services || [],
        appointments: allAppointments,
        blockedSlots: blockedSlots || [],
        timezone,
        fromDate: from,
        toDate: to,
      })
      : [];

    const feedLabel = promoterCode
      ? `${config.name || clinic} — ${promoterCode}`
      : (config.name || clinic);

    const revision = computeFeedRevision({
      appointments: promoterCode ? scopedAppointments : allAppointments,
      blockedSlots: blockedSlots || [],
      services: services || [],
      promoterCode,
      availabilityCount: availabilitySlots.length,
    });
    const etag = `"${revision}"`;
    const ifNoneMatch = request.headers.get('if-none-match');
    if (ifNoneMatch && ifNoneMatch === etag) {
      return new NextResponse(null, {
        status: 304,
        headers: {
          ETag: etag,
          'Cache-Control': 'no-cache, must-revalidate',
        },
      });
    }

    const ics = buildFeedIcsContent({
      clinicName: clinic,
      clinicDisplayName: feedLabel,
      address: config.address,
      mapsUrl: config.maps_url,
      appointments: scopedAppointments,
      availabilitySlots,
    });

    const filename = promoterCode
      ? `oxy-${clinic.toLowerCase()}-${promoterCode.toLowerCase()}.ics`
      : `oxy-${clinic.toLowerCase()}-agenda.ics`;

    return new NextResponse(ics, {
      status: 200,
      headers: {
        'Content-Type': 'text/calendar; charset=utf-8',
        'Content-Disposition': `inline; filename="${filename}"`,
        'Cache-Control': 'no-cache, must-revalidate',
        ETag: etag,
        'Last-Modified': new Date().toUTCString(),
      },
    });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
