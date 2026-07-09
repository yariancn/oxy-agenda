import {
  applyPurchaseSessions,
  reversePurchaseSessions,
  sumWalletBalance,
  repairLegacyWalletKeys,
  resolveWalletStorageKey,
} from './sessionWallet.js';

export function normalizeGroup(row) {
  if (!row) return null;
  const packageHistory = row.package_history || [];
  const repaired = repairLegacyWalletKeys(row.wallets || {}, packageHistory);
  return {
    id: row.id,
    name: row.name || '',
    titularPatientId: row.titular_patient_id,
    wallets: repaired.wallets,
    adeudo: Number(row.adeudo) || 0,
    packageHistory,
    createdAt: row.created_at,
    _walletRepairPending: repaired.changed,
  };
}

export function findGroupById(groups, groupId) {
  return (groups || []).find((g) => g.id === groupId) || null;
}

export function findGroupForPatient(patient, groups) {
  if (!patient?.sessionGroupId) return null;
  return findGroupById(groups, patient.sessionGroupId);
}

export function isGroupTitular(patient, group) {
  if (!patient || !group) return false;
  return patient.id === group.titularPatientId;
}

export function getGroupMembers(group, patients = []) {
  if (!group?.id) return [];
  return (patients || []).filter((p) => p.sessionGroupId === group.id);
}

export function getTitularPatient(group, patients = []) {
  return (patients || []).find((p) => p.id === group?.titularPatientId) || null;
}

export function enrichGroupForDisplay(group, patients = []) {
  if (!group) return null;
  const titular = getTitularPatient(group, patients);
  const members = getGroupMembers(group, patients);
  return {
    ...group,
    titularName: titular?.patient || '',
    members,
  };
}

export function canCreateSessionGroup(patient) {
  if (!patient?.id) return { ok: false, reason: 'missing_patient' };
  if (patient.sessionGroupId) return { ok: false, reason: 'already_in_group' };
  if ((Number(patient.adeudo) || 0) > 0) return { ok: false, reason: 'titular_debt' };
  return { ok: true };
}

export function canJoinSessionGroup(patient, group) {
  if (!patient?.id) return { ok: false, reason: 'missing_patient' };
  if (patient.sessionGroupId && patient.sessionGroupId !== group?.id) {
    return { ok: false, reason: 'other_group' };
  }
  if ((Number(patient.adeudo) || 0) > 0) return { ok: false, reason: 'member_debt' };
  if ((Number(group?.adeudo) || 0) > 0) return { ok: false, reason: 'group_debt' };
  if (sumWalletBalance(patient.wallets) > 0) return { ok: false, reason: 'member_has_wallet' };
  return { ok: true };
}

/** Migra carteras del titular al grupo usando claves price_* según historial de cobros. */
export function migrateTitularWalletsToGroup(titularWallets = {}, packageHistory = []) {
  const { wallets: sourceWallets } = repairLegacyWalletKeys(titularWallets, packageHistory);
  const next = {};
  for (const tx of packageHistory || []) {
    const price = Number(tx.unitPrice) || (tx.sessions ? Number(tx.price) / Number(tx.sessions) : 0);
    if (!price) continue;
    const key = `price_${price}`;
    next[key] = (next[key] || 0) + (Number(tx.addedToWallet) || 0);
  }
  for (const [key, qty] of Object.entries(sourceWallets || {})) {
    if ((Number(qty) || 0) <= 0) continue;
    if (key.startsWith('price_')) {
      next[key] = (next[key] || 0) + Number(qty);
      continue;
    }
    const tx = (packageHistory || []).find((t) => t.equipment === key || t.serviceName === key);
    const price = tx
      ? (Number(tx.unitPrice) || (tx.sessions ? Number(tx.price) / Number(tx.sessions) : 0))
      : 0;
    const legacyKey = resolveWalletStorageKey({
      serviceName: tx?.serviceName || key,
      equipment: tx?.equipment || key,
      unitPrice: price,
    });
    const pKey = price ? `price_${price}` : legacyKey;
    next[pKey] = (next[pKey] || 0) + Number(qty);
  }
  return next;
}

export async function createSessionGroup(supabase, { name, titularPatient, patients }) {
  const check = canCreateSessionGroup(titularPatient);
  if (!check.ok) throw new Error(check.reason);

  const titularRepaired = repairLegacyWalletKeys(
    titularPatient.wallets,
    titularPatient.packageHistory,
  );
  const wallets = migrateTitularWalletsToGroup(titularRepaired.wallets, titularPatient.packageHistory);

  const { data: groupRow, error: groupErr } = await supabase
    .from('session_groups')
    .insert([{
      name: String(name || '').trim() || `Grupo ${titularPatient.patient}`,
      titular_patient_id: titularPatient.id,
      wallets,
      adeudo: 0,
      package_history: titularPatient.packageHistory || [],
    }])
    .select('*')
    .single();
  if (groupErr) throw groupErr;

  const { error: patErr } = await supabase
    .from('patients')
    .update({ session_group_id: groupRow.id, wallets: {} })
    .eq('id', titularPatient.id);
  if (patErr) throw patErr;

  return normalizeGroup(groupRow);
}

export async function addSessionGroupMember(supabase, group, memberPatient) {
  const check = canJoinSessionGroup(memberPatient, group);
  if (!check.ok) throw new Error(check.reason);

  const { error } = await supabase
    .from('patients')
    .update({ session_group_id: group.id, wallets: {} })
    .eq('id', memberPatient.id);
  if (error) throw error;
}

export async function removeSessionGroupMember(supabase, memberPatientId) {
  const { error } = await supabase
    .from('patients')
    .update({ session_group_id: null })
    .eq('id', memberPatientId);
  if (error) throw error;
}

export function applyGroupPurchase(group, unitPrice, sessions) {
  const price = Number(unitPrice) || 0;
  const walletKey = price ? `price_${price}` : null;
  if (!walletKey) throw new Error('invalid_price');

  const applied = applyPurchaseSessions(group.wallets, group.adeudo, walletKey, sessions);
  return {
    ...group,
    wallets: applied.wallets,
    adeudo: applied.adeudo,
  };
}

export function reverseGroupPurchase(group, tx) {
  const repaired = repairLegacyWalletKeys(group.wallets, group.packageHistory);
  const price = Number(tx.unitPrice) || (tx.sessions ? Number(tx.price) / Number(tx.sessions) : 0);
  const walletKey = price ? `price_${price}` : (tx.equipment || tx.serviceName);
  const reversed = reversePurchaseSessions(repaired.wallets, group.adeudo, {
    ...tx,
    equipment: walletKey,
  }, group.packageHistory);
  return {
    ...group,
    wallets: reversed.wallets,
    adeudo: reversed.adeudo,
  };
}
