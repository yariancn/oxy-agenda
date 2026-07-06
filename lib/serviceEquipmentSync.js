import { getEquipmentShortLabel } from './calendarDisplay.js';

/**
 * Las citas guardan equipment por nombre (texto). Al renombrar un servicio hay que
 * actualizar referencias o las citas "desaparecen" del calendario sin borrarse.
 */

export async function countAppointmentsForEquipment(supabase, equipmentName) {
  const name = String(equipmentName || '').trim();
  if (!name) return 0;
  const { count, error } = await supabase
    .from('appointments')
    .select('id', { count: 'exact', head: true })
    .eq('equipment', name)
    .neq('check_in_status', 'Cancelado');
  if (error) throw error;
  return count || 0;
}

export function serviceScheduleKey(duration, buffer) {
  return `${Number(duration) || 60}:${Number(buffer ?? 30)}`;
}

export function hasServiceScheduleChange(original, next) {
  if (!original) return false;
  return serviceScheduleKey(original.duration, original.buffer)
    !== serviceScheduleKey(next.duration, next.buffer);
}

export async function renameEquipmentAcrossClinic(supabase, oldName, newName) {
  const oldTrim = String(oldName || '').trim();
  const newTrim = String(newName || '').trim();
  if (!oldTrim || !newTrim || oldTrim === newTrim) {
    return { appointments: 0, blockedSlots: 0, patients: 0 };
  }

  let appointments = 0;
  let blockedSlots = 0;
  let patients = 0;

  const { data: apptRows, error: apptErr } = await supabase
    .from('appointments')
    .update({ equipment: newTrim })
    .eq('equipment', oldTrim)
    .select('id');
  if (apptErr) throw apptErr;
  appointments = apptRows?.length || 0;

  const { data: blockRows, error: blockErr } = await supabase
    .from('blocked_slots')
    .update({ equipment: newTrim })
    .eq('equipment', oldTrim)
    .select('id');
  if (blockErr) throw blockErr;
  blockedSlots = blockRows?.length || 0;

  const { data: patientRows, error: patErr } = await supabase
    .from('patients')
    .select('id, wallets');
  if (patErr) throw patErr;

  for (const row of patientRows || []) {
    const wallets = row.wallets && typeof row.wallets === 'object' ? row.wallets : null;
    if (!wallets || wallets[oldTrim] == null) continue;
    const nextWallets = { ...wallets };
    nextWallets[newTrim] = (Number(nextWallets[newTrim]) || 0) + (Number(nextWallets[oldTrim]) || 0);
    delete nextWallets[oldTrim];
    const { error } = await supabase.from('patients').update({ wallets: nextWallets }).eq('id', row.id);
    if (error) throw error;
    patients += 1;
  }

  return { appointments, blockedSlots, patients };
}

function activeServiceNames(services = []) {
  return services
    .filter((s) => s.is_active !== false)
    .map((s) => String(s.name || '').trim())
    .filter(Boolean);
}

/** Citas cuyo equipment no coincide con un servicio activo. */
export function findOrphanEquipmentNames(activeServiceNamesList, appointments = []) {
  const known = new Set((activeServiceNamesList || []).map((n) => String(n || '').trim()).filter(Boolean));
  const orphans = [];
  const seen = new Set();
  for (const app of appointments) {
    if (app.check_in_status === 'Cancelado') continue;
    const eq = String(app.equipment || '').trim();
    if (!eq || known.has(eq) || seen.has(eq)) continue;
    seen.add(eq);
    orphans.push(eq);
  }
  return orphans;
}

function normalizeEquipmentKey(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Encuentra el servicio activo que corresponde a un nombre huérfano de cita. */
export function resolveOrphanToService(orphanName, services = []) {
  const eq = String(orphanName || '').trim();
  if (!eq) return null;

  const active = (services || []).filter((s) => s.is_active !== false);
  const exact = active.find((s) => s.name === eq);
  if (exact) return exact.name;

  const eqNorm = normalizeEquipmentKey(eq);
  const normMatch = active.filter((s) => normalizeEquipmentKey(s.name) === eqNorm);
  if (normMatch.length === 1) return normMatch[0].name;

  const chamberNum = eq.match(/chamber\s*(\d+)/i)?.[1] || eq.match(/c[aá]mara\s*(\d+)/i)?.[1];
  if (chamberNum) {
    const chamberMatches = active.filter((s) => new RegExp(`(?:chamber|c[aá]mara)\\s*${chamberNum}\\b`, 'i').test(s.name));
    if (chamberMatches.length === 1) return chamberMatches[0].name;
  }

  if (/red\s*light|luz\s*roja/i.test(eq)) {
    const lightMatches = active.filter((s) => /red\s*light|luz\s*roja/i.test(s.name));
    if (lightMatches.length === 1) return lightMatches[0].name;
  }

  const short = getEquipmentShortLabel(eq);
  const byShort = active.filter((s) => getEquipmentShortLabel(s.name) === short);
  if (byShort.length === 1) return byShort[0].name;

  return null;
}

/** Para mostrar citas en la columna correcta sin duplicar equipos en el calendario. */
export function resolveAppointmentEquipment(equipment, services = []) {
  const eq = String(equipment || '').trim();
  if (!eq) return eq;

  const names = activeServiceNames(services);
  if (names.includes(eq)) return eq;

  const target = resolveOrphanToService(eq, services);
  return target || eq;
}

/** Solo servicios activos — nunca columnas huérfanas duplicadas. */
export function buildCalendarEquipmentColumns(services = []) {
  const columns = activeServiceNames(services);
  return {
    columns,
    orphans: new Set(),
  };
}

export async function autoRepairOrphanEquipmentNames(supabase, services = [], appointments = []) {
  const names = activeServiceNames(services);
  const orphans = findOrphanEquipmentNames(names, appointments);
  const repairs = [];

  for (const orphan of orphans) {
    const target = resolveOrphanToService(orphan, services);
    if (!target || target === orphan) continue;
    await renameEquipmentAcrossClinic(supabase, orphan, target);
    repairs.push({ from: orphan, to: target });
  }

  return repairs;
}

export function countAppointmentsForServiceResolved(serviceName, services = [], appointments = []) {
  const name = String(serviceName || '').trim();
  if (!name) return 0;
  return (appointments || []).filter(
    (a) => a.check_in_status !== 'Cancelado' && resolveAppointmentEquipment(a.equipment, services) === name,
  ).length;
}

export function applyEquipmentRepairsToAppointments(appointments = [], repairs = []) {
  if (!repairs.length) return appointments;
  const map = new Map(repairs.map((r) => [r.from, r.to]));
  return appointments.map((app) => {
    const nextEq = map.get(app.equipment);
    return nextEq ? { ...app, equipment: nextEq } : app;
  });
}
