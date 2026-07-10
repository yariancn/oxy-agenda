import { createHash } from 'crypto';
import {
  filterRowsByClinic,
  getClinicTimezone,
  normalizeClinicId,
  shouldScopeTableByClinic,
} from './clinicRegistry.js';

function stableHash(input) {
  return createHash('sha256').update(JSON.stringify(input)).digest('hex').slice(0, 24);
}

function dateRangeForSync(timezone) {
  const now = new Date(new Date().toLocaleString('en-US', { timeZone: timezone }));
  const from = new Date(now);
  from.setDate(from.getDate() - 21);
  const to = new Date(now);
  to.setDate(to.getDate() + 120);
  return {
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10),
  };
}

async function queryWithClinicFallback(supabase, table, clinicId, build) {
  let query = build(supabase.from(table));
  if (shouldScopeTableByClinic(clinicId)) {
    query = query.eq('clinic', clinicId);
  }
  let res = await query;
  if (res.error && /clinic|column|schema cache/i.test(res.error.message || '')) {
    res = await build(supabase.from(table));
  }
  if (res.error) throw res.error;
  let data = res.data || [];
  if (shouldScopeTableByClinic(clinicId)) {
    data = filterRowsByClinic(data, clinicId);
  }
  return data;
}

export async function computeLiveSyncToken({ supabase, clinicName }) {
  const clinicId = normalizeClinicId(clinicName);
  const { from, to } = dateRangeForSync(getClinicTimezone(clinicName));

  const [appointments, blockedSlots, servicesRes, configRes] = await Promise.all([
    queryWithClinicFallback(supabase, 'appointments', clinicId, (q) =>
      q.select('id, time, full_date, equipment, check_in_status, outside_normal_hours, is_extended_block')
        .gte('full_date', from)
        .lte('full_date', to)
        .order('id', { ascending: true })),
    queryWithClinicFallback(supabase, 'blocked_slots', clinicId, (q) =>
      q.select('id, date, time, equipment, is_global')
        .order('id', { ascending: true })),
    supabase.from('services').select('id, name, is_active, equipment, start_time, end_time').order('id', { ascending: true }),
    supabase
      .from('company_config')
      .select('demo_occupancy_enabled, demo_occupancy_slots, demo_occupancy_overrides, start_time, end_time, weekly_schedule, interval_mins, booking_limit_hours')
      .eq('clinic', clinicId)
      .maybeSingle(),
  ]);

  if (servicesRes.error) throw servicesRes.error;

  const services = filterRowsByClinic(servicesRes.data || [], clinicId);

  const payload = {
    appointments: appointments.map((row) => [
      row.id,
      row.full_date,
      row.time,
      row.equipment,
      row.check_in_status,
      row.outside_normal_hours,
      row.is_extended_block,
      row.patient,
      row.duration,
      row.buffer,
      row.day,
      row.clinic,
    ]),
    blockedSlots: blockedSlots.map((row) => [
      row.id,
      row.date,
      row.time,
      row.equipment,
      row.is_global,
    ]),
    services: services.map((row) => [
      row.id,
      row.name,
      row.is_active,
      row.equipment,
      row.start_time,
      row.end_time,
    ]),
    schedule: configRes.data
      ? [
          configRes.data.start_time,
          configRes.data.end_time,
          configRes.data.interval_mins,
          configRes.data.booking_limit_hours,
          configRes.data.weekly_schedule,
          configRes.data.demo_occupancy_enabled,
          configRes.data.demo_occupancy_slots,
          configRes.data.demo_occupancy_overrides,
        ]
      : null,
  };

  return {
    token: stableHash(payload),
    at: new Date().toISOString(),
    counts: {
      appointments: appointments.length,
      blockedSlots: blockedSlots.length,
      services: services.length,
    },
  };
}
