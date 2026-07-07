import { PUBLIC_SESSION } from './sessionPresets.js';
import { buildDaySlots, getAppointmentSlotBlockReason } from './publicBookingSlots.js';

export const DEMO_OCCUPANCY_PERCENT = 30;
export const DEMO_OCCUPANCY_DAYS = 14;

export function slotOccupancyKey(equipment, fullDate, time) {
  return `${String(equipment || '').trim()}|${fullDate}|${String(time || '').trim()}`;
}

export function parseOccupancyKey(key) {
  const parts = String(key || '').split('|');
  return {
    equipment: parts[0] || '',
    full_date: parts[1] || '',
    time: parts[2] || '',
  };
}

function formatIsoDate(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function normalizeDemoOverrides(raw) {
  if (!Array.isArray(raw)) return [];
  return [...new Set(raw.map((k) => String(k || '').trim()).filter(Boolean))];
}

export function normalizeDemoSlots(raw) {
  return normalizeDemoOverrides(raw);
}

function isReallyOccupied(key, realAppointments, service) {
  const { equipment, full_date, time } = parseOccupancyKey(key);
  return Boolean(getAppointmentSlotBlockReason({
    time,
    equipment,
    full_date,
    duration: service?.duration || PUBLIC_SESSION.duration,
    buffer: service?.buffer ?? PUBLIC_SESSION.buffer,
    appointments: realAppointments,
    blockedSlots: [],
  }));
}

/** Genera claves de ~30% de huecos libres, repartidos por día y equipo. */
export function generateDemoOccupancyKeys({
  services = [],
  companyConfig,
  realAppointments = [],
  blockedSlots = [],
  timezone,
  days = DEMO_OCCUPANCY_DAYS,
  percent = DEMO_OCCUPANCY_PERCENT,
  overrides = [],
}) {
  const overrideSet = new Set(normalizeDemoOverrides(overrides));
  const buckets = new Map();

  const start = new Date(new Date().toLocaleString('en-US', { timeZone: timezone }));

  for (let i = 0; i < days; i += 1) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    const fullDate = formatIsoDate(d);

    for (const service of services) {
      if (service.is_active === false) continue;
      const duration = Number(service.duration) || PUBLIC_SESSION.duration;
      const buffer = Number(service.buffer ?? PUBLIC_SESSION.buffer);

      const daySlots = buildDaySlots({
        dbConfig: companyConfig,
        selectedDate: fullDate,
        equipmentName: service.name,
        service,
        dbAppointments: realAppointments,
        dbBlockedSlots: blockedSlots,
        timezone,
        duration,
        buffer,
      });

      const bucketKey = `${fullDate}|${service.name}`;
      const available = daySlots
        .filter((slot) => slot.status === 'available')
        .map((slot) => slotOccupancyKey(service.name, fullDate, slot.time))
        .filter((key) => !overrideSet.has(key));

      if (available.length) buckets.set(bucketKey, available);
    }
  }

  const allCandidates = [];
  for (const slots of buckets.values()) allCandidates.push(...slots);
  const target = Math.max(0, Math.floor(allCandidates.length * (percent / 100)));
  if (!target) return [];

  const picked = [];
  const bucketLists = [...buckets.values()].filter((list) => list.length);
  let round = 0;
  while (picked.length < target && bucketLists.some((list) => list.length)) {
    const list = bucketLists[round % bucketLists.length];
    if (list.length) {
      const stride = Math.max(1, Math.floor(list.length / Math.ceil(target / bucketLists.length)));
      const idx = Math.min(list.length - 1, stride * Math.floor(picked.length / bucketLists.length));
      picked.push(list.splice(idx, 1)[0]);
    }
    round += 1;
    if (round > target * bucketLists.length * 4) break;
  }

  while (picked.length < target) {
    const remaining = bucketLists.flatMap((list) => list);
    if (!remaining.length) break;
    const stride = Math.max(1, Math.floor(remaining.length / (target - picked.length)));
    for (let i = 0; picked.length < target && i < remaining.length; i += stride) {
      picked.push(remaining[i]);
    }
    break;
  }

  return [...new Set(picked)].slice(0, target);
}

export function demoKeysToAppointments(keys, services = []) {
  const byName = new Map(services.map((s) => [s.name, s]));
  return normalizeDemoSlots(keys).map((key) => {
    const { equipment, full_date, time } = parseOccupancyKey(key);
    const service = byName.get(equipment) || {};
    return {
      equipment,
      full_date,
      time,
      duration: Number(service.duration) || PUBLIC_SESSION.duration,
      buffer: Number(service.buffer ?? PUBLIC_SESSION.buffer),
      check_in_status: 'Agendado',
      _demo: true,
    };
  });
}

export function mergePortalAppointments(realAppointments, {
  enabled,
  demoSlots = [],
  overrides = [],
  services = [],
}) {
  if (!enabled) return realAppointments || [];
  const overrideSet = new Set(normalizeDemoOverrides(overrides));
  const byName = new Map(services.map((s) => [s.name, s]));
  const merged = [...(realAppointments || [])];

  for (const key of normalizeDemoSlots(demoSlots)) {
    if (overrideSet.has(key)) continue;
    const service = byName.get(parseOccupancyKey(key).equipment);
    if (isReallyOccupied(key, merged, service)) continue;
    merged.push(...demoKeysToAppointments([key], services));
  }

  return merged;
}

export function toggleDemoOverride(overrides, key) {
  const normalized = normalizeDemoOverrides(overrides);
  const slot = String(key || '').trim();
  if (!slot) return normalized;
  if (normalized.includes(slot)) return normalized.filter((k) => k !== slot);
  return [...normalized, slot];
}

export function buildDemoPreview({
  services,
  companyConfig,
  realAppointments,
  blockedSlots,
  timezone,
  demoSlots,
  overrides,
  previewDate,
}) {
  const overrideSet = new Set(normalizeDemoOverrides(overrides));
  const demoSet = new Set(normalizeDemoSlots(demoSlots));
  const rows = [];

  for (const service of services) {
    if (service.is_active === false) continue;
    const duration = Number(service.duration) || PUBLIC_SESSION.duration;
    const buffer = Number(service.buffer ?? PUBLIC_SESSION.buffer);
    const daySlots = buildDaySlots({
      dbConfig: companyConfig,
      selectedDate: previewDate,
      equipmentName: service.name,
      service,
      dbAppointments: realAppointments,
      dbBlockedSlots: blockedSlots,
      timezone,
      duration,
      buffer,
    });

    for (const slot of daySlots) {
      const key = slotOccupancyKey(service.name, previewDate, slot.time);
      let kind = slot.status;
      if (slot.status === 'available' && demoSet.has(key) && !overrideSet.has(key)) {
        kind = 'demo';
      } else if (demoSet.has(key) && overrideSet.has(key)) {
        kind = 'demo_override';
      }
      rows.push({
        key,
        equipment: service.name,
        time: slot.time,
        kind,
      });
    }
  }

  return rows.sort((a, b) => a.time.localeCompare(b.time) || a.equipment.localeCompare(b.equipment));
}
