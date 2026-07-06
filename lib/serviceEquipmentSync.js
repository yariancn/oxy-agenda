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

/** Equipos con citas activas que ya no están en el catálogo activo. */
export function findOrphanEquipmentColumns(activeServiceNames, appointments = []) {
  const known = new Set((activeServiceNames || []).map((n) => String(n || '').trim()).filter(Boolean));
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

export function buildCalendarEquipmentColumns(activeServiceNames, appointments = []) {
  const services = (activeServiceNames || []).map((n) => String(n || '').trim()).filter(Boolean);
  const orphans = findOrphanEquipmentColumns(services, appointments);
  return {
    columns: [...services, ...orphans],
    orphans: new Set(orphans),
  };
}
