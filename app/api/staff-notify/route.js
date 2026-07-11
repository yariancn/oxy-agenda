import { NextResponse } from 'next/server';
import { dispatchStaffBookingAlert } from '../../../lib/staffBookingAlert.js';
import { getSupabaseAdmin } from '../../../lib/supabaseAdmin.js';

async function loadStaffRoster(clinicName) {
  const supabase = getSupabaseAdmin(clinicName);
  const { data, error } = await supabase
    .from('users_staff')
    .select('name, email, phone, notify_on_booking, is_active')
    .eq('is_active', true);
  if (error) return [];
  return data || [];
}

export async function POST(request) {
  try {
    const body = await request.json();
    const {
      companyConfig = {},
      staffRoster,
      clinicName = 'Guadalajara',
      clinicDisplayName,
      patientName,
      date,
      time,
      equipment,
      locale = 'es',
      source = 'public',
      promoterCode = '',
      isFirstSession = false,
    } = body;

    if (!patientName || !date || !time) {
      return NextResponse.json({ success: false, error: 'Missing appointment fields' }, { status: 400 });
    }

    const roster = Array.isArray(staffRoster) && staffRoster.length
      ? staffRoster
      : await loadStaffRoster(clinicName);

    const result = await dispatchStaffBookingAlert({
      companyConfig,
      staffRoster: roster,
      clinicName,
      clinicDisplayName,
      patientName,
      date,
      time,
      equipment,
      locale,
      source,
      promoterCode,
      isFirstSession,
    });

    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
