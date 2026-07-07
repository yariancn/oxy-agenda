import { NextResponse } from 'next/server';
import { canManageDemoOccupancy } from '../../../../lib/demoOccupancyAccess.js';
import {
  buildDemoPreview,
  readDemoConfig,
  loadDemoCompanyConfig,
  saveDemoCompanyConfig,
  regenerateDemoSlots,
  toggleDemoOverride,
} from '../../../../lib/demoOccupancyServer.js';
import {
  filterRowsByClinic,
  getClinicMeta,
  normalizeClinicId,
  selectActiveAppointments,
} from '../../../../lib/clinicRegistry.js';
import { getSupabaseAdmin } from '../../../../lib/supabaseAdmin.js';
import { readStaffSessionFromRequest } from '../../../../lib/staffSession.js';

async function loadPortalData(supabase, clinicName) {
  const clinicId = normalizeClinicId(clinicName);
  const [servicesRes, appointmentsRes, blocksRes, configRes] = await Promise.all([
    supabase.from('services').select('*').eq('is_active', true),
    selectActiveAppointments(supabase),
    supabase.from('blocked_slots').select('*'),
    loadDemoCompanyConfig(supabase, clinicId),
  ]);
  if (servicesRes.error) throw servicesRes.error;
  if (appointmentsRes.error) throw appointmentsRes.error;
  if (blocksRes.error) throw blocksRes.error;
  if (configRes.error) throw configRes.error;

  return {
    services: filterRowsByClinic(servicesRes.data || [], clinicId),
    appointments: filterRowsByClinic(appointmentsRes.data || [], clinicId),
    blockedSlots: filterRowsByClinic(blocksRes.data || [], clinicId),
    companyConfig: configRes.data,
  };
}

function defaultPreviewDate(timezone) {
  const now = new Date(new Date().toLocaleString('en-US', { timeZone: timezone }));
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

export async function GET(request) {
  try {
    const user = readStaffSessionFromRequest(request);
    if (!canManageDemoOccupancy(user)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const clinicName = normalizeClinicId(searchParams.get('clinic') || 'Oxygengdl');
    const previewDate = searchParams.get('date') || defaultPreviewDate(getClinicMeta(clinicName).timezone);

    const supabase = getSupabaseAdmin(clinicName);
    const data = await loadPortalData(supabase, clinicName);
    const demo = readDemoConfig(data.companyConfig);

    const preview = buildDemoPreview({
      services: data.services,
      companyConfig: data.companyConfig,
      realAppointments: data.appointments,
      blockedSlots: data.blockedSlots,
      timezone: getClinicMeta(clinicName).timezone,
      demoSlots: demo.slots,
      overrides: demo.overrides,
      previewDate,
    });

    return NextResponse.json({
      canManage: true,
      clinic: clinicName,
      bookingPath: getClinicMeta(clinicName).bookingPath,
      enabled: demo.enabled,
      percent: demo.percent,
      slotCount: demo.slots.length,
      overrideCount: demo.overrides.length,
      previewDate,
      preview,
    });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const user = readStaffSessionFromRequest(request);
    if (!canManageDemoOccupancy(user)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json();
    const clinicName = normalizeClinicId(body.clinic || 'Oxygengdl');
    const action = String(body.action || '').trim();

    const supabase = getSupabaseAdmin(clinicName);
    const data = await loadPortalData(supabase, clinicName);
    if (!data.companyConfig?.id) {
      return NextResponse.json({ error: 'company_config not found' }, { status: 400 });
    }

    const demo = readDemoConfig(data.companyConfig);
    let patch = {};

    if (action === 'enable') {
      const slots = regenerateDemoSlots({
        services: data.services,
        companyConfig: data.companyConfig,
        realAppointments: data.appointments,
        blockedSlots: data.blockedSlots,
        clinicName,
        overrides: demo.overrides,
        percent: demo.percent,
      });
      patch = {
        demo_occupancy_enabled: true,
        demo_occupancy_slots: slots,
      };
    } else if (action === 'disable') {
      patch = { demo_occupancy_enabled: false };
    } else if (action === 'regenerate') {
      const slots = regenerateDemoSlots({
        services: data.services,
        companyConfig: data.companyConfig,
        realAppointments: data.appointments,
        blockedSlots: data.blockedSlots,
        clinicName,
        overrides: demo.overrides,
        percent: demo.percent,
      });
      patch = {
        demo_occupancy_enabled: true,
        demo_occupancy_slots: slots,
      };
    } else if (action === 'toggle_override') {
      const overrides = toggleDemoOverride(demo.overrides, body.slotKey);
      patch = { demo_occupancy_overrides: overrides };
    } else {
      return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }

    await saveDemoCompanyConfig(supabase, data.companyConfig.id, patch);

    const refreshed = await loadPortalData(supabase, clinicName);
    const configRes = await loadDemoCompanyConfig(supabase, clinicName);
    const nextDemo = readDemoConfig(configRes.data);
    const previewDate = body.previewDate || defaultPreviewDate(getClinicMeta(clinicName).timezone);

    return NextResponse.json({
      success: true,
      enabled: nextDemo.enabled,
      percent: nextDemo.percent,
      slotCount: nextDemo.slots.length,
      overrideCount: nextDemo.overrides.length,
      preview: buildDemoPreview({
        services: refreshed.services,
        companyConfig: refreshed.companyConfig,
        realAppointments: refreshed.appointments,
        blockedSlots: refreshed.blockedSlots,
        timezone: getClinicMeta(clinicName).timezone,
        demoSlots: nextDemo.slots,
        overrides: nextDemo.overrides,
        previewDate,
      }),
    });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
