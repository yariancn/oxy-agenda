import { NextResponse } from 'next/server';
import { buildIcsContent, buildAppointmentTimes, timezoneForClinic } from '../../../../lib/calendarLinks.js';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const date = searchParams.get('date') || '';
  const time = searchParams.get('time') || '';
  const durationMins = Number(searchParams.get('duration')) || 60;
  const bufferMins = Number(searchParams.get('buffer')) || 0;
  const title = searchParams.get('title') || 'Appointment';
  const details = searchParams.get('details') || '';
  const location = searchParams.get('location') || '';
  const timezone = searchParams.get('tz') || timezoneForClinic('Guadalajara');

  const window = buildAppointmentTimes({ date, time, durationMins, bufferMins });
  if (!window) {
    return NextResponse.json({ error: 'Invalid date or time' }, { status: 400 });
  }

  const ics = buildIcsContent({
    title,
    startStamp: window.startStamp,
    endStamp: window.endStamp,
    details,
    location,
    timezone,
    uid: `${window.startStamp}-${title.replace(/\s+/g, '-').slice(0, 40)}@oxy-agenda`,
  });

  const filename = `appointment-${date}.ics`;
  return new NextResponse(ics, {
    status: 200,
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  });
}
