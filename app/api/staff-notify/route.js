import { NextResponse } from 'next/server';
import { dispatchStaffBookingAlert } from '../../../lib/staffBookingAlert.js';

export async function POST(request) {
  try {
    const body = await request.json();
    const {
      companyConfig = {},
      clinicName = 'Guadalajara',
      clinicDisplayName,
      patientName,
      date,
      time,
      equipment,
      locale = 'es',
      source = 'public',
      promoterCode = '',
    } = body;

    if (!patientName || !date || !time) {
      return NextResponse.json({ success: false, error: 'Missing appointment fields' }, { status: 400 });
    }

    const result = await dispatchStaffBookingAlert({
      companyConfig,
      clinicName,
      clinicDisplayName,
      patientName,
      date,
      time,
      equipment,
      locale,
      source,
      promoterCode,
    });

    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
