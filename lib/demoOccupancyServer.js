import {
  DEMO_OCCUPANCY_PERCENT,
  generateDemoOccupancyKeys,
  mergePortalAppointments,
  normalizeDemoOverrides,
  normalizeDemoSlots,
  toggleDemoOverride,
  buildDemoPreview,
} from './demoOccupancy.js';
import { filterRowsByClinic, getClinicTimezone, normalizeClinicId } from './clinicRegistry.js';

export {
  DEMO_OCCUPANCY_PERCENT,
  mergePortalAppointments,
  buildDemoPreview,
  toggleDemoOverride,
  normalizeDemoOverrides,
  normalizeDemoSlots,
};

function isMissingColumnError(error) {
  return !!error?.message && /column|schema cache/i.test(error.message);
}

export function readDemoConfig(companyConfig) {
  const row = companyConfig || {};
  return {
    enabled: row.demo_occupancy_enabled === true,
    percent: Number(row.demo_occupancy_percent) || DEMO_OCCUPANCY_PERCENT,
    slots: normalizeDemoSlots(row.demo_occupancy_slots),
    overrides: normalizeDemoOverrides(row.demo_occupancy_overrides),
  };
}

export async function loadDemoCompanyConfig(supabase, clinicName) {
  const clinicId = normalizeClinicId(clinicName);
  let res = await supabase
    .from('company_config')
    .select('id, demo_occupancy_enabled, demo_occupancy_percent, demo_occupancy_slots, demo_occupancy_overrides, start_time, end_time, interval_mins, booking_limit_hours, weekly_schedule')
    .eq('clinic', clinicId)
    .maybeSingle();

  if (res.error && isMissingColumnError(res.error)) {
    res = await supabase
      .from('company_config')
      .select('id, start_time, end_time, interval_mins, booking_limit_hours, weekly_schedule')
      .limit(1)
      .maybeSingle();
  }

  return res;
}

export async function saveDemoCompanyConfig(supabase, configId, patch) {
  if (!configId) throw new Error('Missing company_config id');
  const res = await supabase.from('company_config').update(patch).eq('id', configId).select('id').maybeSingle();
  if (res.error && isMissingColumnError(res.error)) {
    throw new Error('Faltan columnas demo en company_config. Ejecuta scripts/supabase-demo-occupancy.sql');
  }
  if (res.error) throw res.error;
  return res.data;
}

export function regenerateDemoSlots({
  services,
  companyConfig,
  realAppointments,
  blockedSlots,
  clinicName,
  overrides = [],
  percent = DEMO_OCCUPANCY_PERCENT,
}) {
  const timezone = getClinicTimezone(clinicName);
  const scopedServices = filterRowsByClinic(services, clinicName);
  return generateDemoOccupancyKeys({
    services: scopedServices,
    companyConfig,
    realAppointments,
    blockedSlots,
    timezone,
    percent,
    overrides,
  });
}
