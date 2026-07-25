import {
  applyPurchaseSessions,
  reversePurchaseSessions,
  sumWalletBalance,
  repairLegacyWalletKeys,
  resolveWalletStorageKey,
  reconcileAdeudoAgainstWallet,
} from './sessionWallet.js';

export function normalizeGroup(row) {
  if (!row) return null;
  const packageHistory = row.package_history || [];
  // Cancel orphan wallet vs group adeudo automatically (same rule as individual charts).
  const reconciled = reconcileAdeudoAgainstWallet(
    row.wallets || {},
    Number(row.adeudo) || 0,
    packageHistory,
  );
  return {
    id: row.id,
    name: row.name || '',
    titularPatientId: row.titular_patient_id,
    wallets: reconciled.wallets,
    adeudo: reconciled.adeudo,
    packageHistory,
    createdAt: row.created_at,
    _walletRepairPending: reconciled.changed,
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
  return String(patient.id) === String(group.titularPatientId);
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

/**
 * Join rules. Individual wallet balance is OK — it migrates into the group on link
 * (otherwise paid members like Marisol vanish from search with no explanation).
 */
export function canJoinSessionGroup(patient, group, { allowWalletMigrate = true } = {}) {
  if (!patient?.id) return { ok: false, reason: 'missing_patient' };
  if (patient.sessionGroupId && String(patient.sessionGroupId) !== String(group?.id || '')) {
    return { ok: false, reason: 'other_group' };
  }
  if ((Number(patient.adeudo) || 0) > 0) return { ok: false, reason: 'member_debt' };
  if ((Number(group?.adeudo) || 0) > 0) return { ok: false, reason: 'group_debt' };
  if (!allowWalletMigrate && sumWalletBalance(patient.wallets) > 0) {
    return { ok: false, reason: 'member_has_wallet' };
  }
  return {
    ok: true,
    willMigrateWallet: sumWalletBalance(patient.wallets) > 0,
  };
}

/** Name/phone search with accent folding and multi-token match (e.g. "marisol pulido"). */
export function patientMatchesSharedSearch(patient, query = '') {
  const raw = String(query || '').trim();
  if (!raw) return false;
  const fold = (s) => String(s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
  const name = fold(patient?.patient || patient?.name || patient?.Name || '');
  const phone = String(patient?.phone || patient?.Phone || '').replace(/\D/g, '');
  const digits = raw.replace(/\D/g, '');
  const tokens = fold(raw).split(/\s+/).filter(Boolean);
  if (digits.length >= 3 && phone.includes(digits)) return true;
  if (!tokens.length) return false;
  return tokens.every((t) => name.includes(t));
}

/**
 * Classify a search hit for shared-wallet UI (never hide a name match silently).
 */
export function classifySharedWalletCandidate(patient, {
  titularId = null,
  group = null,
} = {}) {
  if (!patient?.id) return { status: 'blocked', reason: 'missing_patient' };
  if (titularId != null && String(patient.id) === String(titularId)) {
    return { status: 'blocked', reason: 'is_titular' };
  }
  if (patient.sessionGroupId && (!group?.id || String(patient.sessionGroupId) !== String(group.id))) {
    return { status: 'blocked', reason: 'other_group' };
  }
  if ((Number(patient.adeudo) || 0) > 0) {
    return { status: 'blocked', reason: 'member_debt' };
  }
  if (group && (Number(group.adeudo) || 0) > 0) {
    return { status: 'blocked', reason: 'group_debt' };
  }
  const bal = sumWalletBalance(patient.wallets);
  if (bal > 0) {
    return { status: 'ok', reason: 'will_migrate_wallet', walletBalance: bal };
  }
  return { status: 'ok', reason: null, walletBalance: 0 };
}

/** Merge member remaining sessions into group wallets (price_* / legacy keys). */
export function mergeMemberWalletsIntoGroup(groupWallets = {}, memberWallets = {}, packageHistory = []) {
  const groupRepaired = repairLegacyWalletKeys(groupWallets, packageHistory).wallets;
  const memberMigrated = migrateTitularWalletsToGroup(memberWallets, packageHistory);
  const next = { ...groupRepaired };
  for (const [key, qty] of Object.entries(memberMigrated || {})) {
    const n = Number(qty) || 0;
    if (n <= 0) continue;
    next[key] = (Number(next[key]) || 0) + n;
  }
  return next;
}

/**
 * Migra el saldo actual del titular al grupo (no re-suma addedToWallet del historial:
 * eso duplicaba sesiones ya consumidas).
 */
export function migrateTitularWalletsToGroup(titularWallets = {}, packageHistory = []) {
  const { wallets: sourceWallets } = repairLegacyWalletKeys(titularWallets, packageHistory);
  const next = {};
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

export async function createSessionGroup(supabase, {
  name,
  titularPatient,
  memberPatients = [],
} = {}) {
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
      adeudo: Number(titularPatient.adeudo) || 0,
      package_history: titularPatient.packageHistory || [],
    }])
    .select('*')
    .single();
  if (groupErr) throw groupErr;

  let group = normalizeGroup(groupRow);

  const { error: patErr } = await supabase
    .from('patients')
    .update({ session_group_id: group.id, wallets: {}, adeudo: 0 })
    .eq('id', titularPatient.id);
  if (patErr) throw patErr;

  const linkedMembers = [];
  for (const member of memberPatients || []) {
    if (!member?.id || String(member.id) === String(titularPatient.id)) continue;
    const join = canJoinSessionGroup(member, group);
    if (!join.ok) throw new Error(join.reason);
    const updated = await addSessionGroupMember(supabase, group, member);
    if (updated?.wallets) group = { ...group, wallets: updated.wallets };
    linkedMembers.push(member);
  }

  return { group, linkedMembers };
}

export async function addSessionGroupMember(supabase, group, memberPatient) {
  const check = canJoinSessionGroup(memberPatient, group);
  if (!check.ok) throw new Error(check.reason);

  let nextWallets = group.wallets || {};
  if (check.willMigrateWallet) {
    nextWallets = mergeMemberWalletsIntoGroup(
      group.wallets || {},
      memberPatient.wallets || {},
      group.packageHistory || memberPatient.packageHistory || [],
    );
    const { error: groupErr } = await supabase
      .from('session_groups')
      .update({ wallets: nextWallets })
      .eq('id', group.id);
    if (groupErr) throw groupErr;
  }

  const { error } = await supabase
    .from('patients')
    .update({ session_group_id: group.id, wallets: {}, adeudo: 0 })
    .eq('id', memberPatient.id);
  if (error) throw error;

  return { wallets: nextWallets };
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
