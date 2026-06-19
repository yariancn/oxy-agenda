import { NextResponse } from 'next/server';
import { buildFeedIcsContent, feedDateWindow } from '../../../../lib/calendarFeed.js';
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
    const { data: config, error: configError } = await supabase
      .from('company_config')
      .select('calendar_feed_enabled, calendar_feed_token, name, address, maps_url')
      .eq('clinic', clinic)
      .maybeSingle();

    if (
      configError
      || !config?.calendar_feed_enabled
      || !config?.calendar_feed_token
      || config.calendar_feed_token !== token
    ) {
      return new NextResponse('Not found', { status: 404 });
    }

    const { from, to } = feedDateWindow();
    const { data: appointments, error: appsError } = await supabase
      .from('appointments')
      .select('id, patient, phone, equipment, full_date, time, duration, buffer, check_in_status, notes')
      .gte('full_date', from)
      .lte('full_date', to)
      .neq('check_in_status', 'Cancelado')
      .order('full_date', { ascending: true });

    if (appsError) {
      return NextResponse.json({ error: appsError.message }, { status: 500 });
    }

    const ics = buildFeedIcsContent({
      clinicName: clinic,
      clinicDisplayName: config.name,
      address: config.address,
      mapsUrl: config.maps_url,
      appointments: appointments || [],
    });

    return new NextResponse(ics, {
      status: 200,
      headers: {
        'Content-Type': 'text/calendar; charset=utf-8',
        'Content-Disposition': `inline; filename="oxy-${clinic.toLowerCase()}-agenda.ics"`,
        'Cache-Control': 'public, max-age=300',
      },
    });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
