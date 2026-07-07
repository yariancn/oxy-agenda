import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '../../../../lib/supabaseAdmin.js';
import { submitPublicBooking } from '../../../../lib/publicBooking.js';
import { normalizePromoCode } from '../../../../lib/promoters.js';
import { filterRowsByClinic, isMissingClinicColumnError, isPublicClinic, normalizeClinicId } from '../../../../lib/clinicRegistry.js';

function sanitizeCompanyConfig(row) {
  if (!row) return null;
  const {
    master_pin,
    financial_pin,
    ...safe
  } = row;
  return safe;
}

async function fetchActiveAppointments(supabase) {
  let res = await supabase
    .from('appointments')
    .select('equipment, full_date, time, duration, buffer, check_in_status, clinic')
    .neq('check_in_status', 'Cancelado');
  if (res.error && isMissingClinicColumnError(res.error)) {
    res = await supabase
      .from('appointments')
      .select('equipment, full_date, time, duration, buffer, check_in_status')
      .neq('check_in_status', 'Cancelado');
  }
  return res;
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const clinicName = normalizeClinicId(searchParams.get('clinic') || 'Oxygengdl');
    if (!isPublicClinic(clinicName)) {
      return NextResponse.json({ error: 'Invalid clinic' }, { status: 400 });
    }

    const supabase = getSupabaseAdmin(clinicName);
    const [resSrv, resApp, resBlock, resConf, resPromo] = await Promise.all([
      supabase.from('services').select('*').eq('is_active', true),
      fetchActiveAppointments(supabase),
      supabase.from('blocked_slots').select('*'),
      supabase.from('company_config').select('*').eq('clinic', clinicName).maybeSingle(),
      supabase.from('promoters').select('code, name').eq('is_active', true),
    ]);

    if (resSrv.error) throw resSrv.error;
    if (resApp.error) throw resApp.error;
    if (resBlock.error) throw resBlock.error;
    if (resConf.error) throw resConf.error;
    if (resPromo.error && !/promoters|schema cache/i.test(resPromo.error.message || '')) {
      throw resPromo.error;
    }

    return NextResponse.json({
      services: filterRowsByClinic(resSrv.data || [], clinicName),
      appointments: filterRowsByClinic(resApp.data || [], clinicName),
      blockedSlots: filterRowsByClinic(resBlock.data || [], clinicName),
      companyConfig: sanitizeCompanyConfig(resConf.data) || {
        start_time: '08:00',
        end_time: '20:00',
        interval_mins: 30,
        booking_limit_hours: 2,
      },
      promoters: resPromo.data || [],
    });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const {
      clinicName: rawClinic = 'Oxygengdl',
      portalTag,
      locale = 'es',
      formData,
      selectedService,
      selectedDate,
      selectedTime,
    } = body;

    const clinicName = normalizeClinicId(rawClinic);
    if (!isPublicClinic(clinicName)) {
      return NextResponse.json({ error: 'Invalid clinic' }, { status: 400 });
    }
    if (!selectedService || !selectedDate || !selectedTime || !formData?.name || !formData?.phone) {
      return NextResponse.json({ error: 'Missing booking fields' }, { status: 400 });
    }

    const supabase = getSupabaseAdmin(clinicName);
    const result = await submitPublicBooking({
      supabase,
      clinicName,
      portalTag,
      locale,
      formData: {
        ...formData,
        promoterCode: normalizePromoCode(formData.promoterCode),
      },
      selectedService,
      selectedDate,
      selectedTime,
    });

    if (result.error) {
      const message = result.error.message === 'PHONE_LENGTH'
        ? 'PHONE_LENGTH'
        : result.error.message === 'SLOT_UNAVAILABLE'
          ? 'SLOT_UNAVAILABLE'
          : result.error.message;
      return NextResponse.json({ error: message }, { status: 400 });
    }

    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
