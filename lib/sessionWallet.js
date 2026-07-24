export function priceWalletKey(price) {
  const n = Number(price);
  if (!n || Number.isNaN(n)) return null;
  return `price_${n}`;
}

function normWalletKey(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function isLegacyWalletKey(key) {
  const s = String(key ?? '');
  return !s || s === 'null' || s === 'undefined';
}

/** Clave estable para guardar sesiones pagadas en cartera. */
export function resolveWalletStorageKey({ serviceName, equipment, unitPrice } = {}) {
  const equip = String(equipment ?? '').trim();
  const name = String(serviceName ?? '').trim();
  const label = equip || name;
  const priceKey = priceWalletKey(unitPrice);
  const sharedChamberPool = /c[aá]mara|camara|chamber|silla|seat|flat\s*bed/i.test(label);

  if (priceKey && sharedChamberPool) return priceKey;
  if (equip) return equip;
  if (name) return name;
  return priceKey || 'general';
}

/** Etiqueta legible para una entrada de cartera. */
export function formatWalletKeyLabel(key, packageHistory = []) {
  const s = String(key ?? '');
  if (isLegacyWalletKey(key)) {
    const tx = (packageHistory || []).find((t) => (Number(t.addedToWallet) || Number(t.sessions) || 0) > 0)
      || packageHistory?.[0];
    return String(tx?.serviceName || tx?.equipment || '—').trim() || '—';
  }
  if (s.startsWith('price_')) return `$${s.replace(/^price_/, '')}`;
  return s;
}

/** Mueve saldos guardados bajo claves null/rotas al nombre del servicio del ticket. */
export function repairLegacyWalletKeys(wallets = {}, packageHistory = []) {
  const next = { ...(wallets || {}) };
  let legacyBal = 0;
  for (const k of Object.keys(next)) {
    if (isLegacyWalletKey(k)) {
      legacyBal += Number(next[k]) || 0;
      delete next[k];
    }
  }
  if (legacyBal <= 0) return { wallets: next, changed: false };

  const tx = (packageHistory || []).find((t) => (Number(t.addedToWallet) || Number(t.sessions) || 0) > 0)
    || packageHistory?.[0];
  const target = resolveWalletStorageKey({
    serviceName: tx?.serviceName,
    equipment: tx?.equipment,
    unitPrice: tx?.unitPrice,
  });
  next[target] = (Number(next[target]) || 0) + legacyBal;
  return { wallets: next, changed: true, targetKey: target };
}

export function sumWalletBalance(wallets = {}) {
  return Object.values(wallets || {}).reduce((sum, n) => sum + (Number(n) || 0), 0);
}

/** Saldo pagado disponible en cartera (equipo, tier de precio o cámara alterna). */
export function getAvailableWalletEntry(wallets = {}, equipment, servicePrice = null) {
  const next = wallets || {};
  const eq = String(equipment || '').trim();
  const eqNorm = normWalletKey(eq);

  if (eq && (Number(next[eq]) || 0) > 0) return { key: eq, balance: Number(next[eq]) };

  if (eqNorm) {
    for (const [key, balance] of Object.entries(next)) {
      if ((Number(balance) || 0) <= 0) continue;
      if (normWalletKey(key) === eqNorm) return { key, balance: Number(balance) };
    }
  }

  const priceKey = priceWalletKey(servicePrice);
  if (priceKey && (Number(next[priceKey]) || 0) > 0) {
    return { key: priceKey, balance: Number(next[priceKey]) };
  }

  const sharedPool = /c[aá]mara|camara|chamber|silla|seat|flat/i.test(eq);
  if (sharedPool) {
    for (const [key, balance] of Object.entries(next)) {
      if ((Number(balance) || 0) <= 0) continue;
      if (key.startsWith('price_')) return { key, balance: Number(balance) };
      if (/c[aá]mara|camara|chamber|silla|seat|flat/i.test(key)) {
        return { key, balance: Number(balance) };
      }
    }
  }

  for (const [key, balance] of Object.entries(next)) {
    if (!isLegacyWalletKey(key) || (Number(balance) || 0) <= 0) continue;
    return { key, balance: Number(balance) };
  }

  const fallback = Object.keys(next).find((key) =>
    (key.toLowerCase().includes('cámara') || key.toLowerCase().includes('camara') || key.toLowerCase().includes('chamber'))
    && (Number(next[key]) || 0) > 0,
  );
  if (fallback) return { key: fallback, balance: Number(next[fallback]) };

  if (/red\s*light|luz\s*roja/i.test(eq)) {
    const lightKey = Object.keys(next).find((key) =>
      /red\s*light|luz\s*roja/i.test(key) && (Number(next[key]) || 0) > 0,
    );
    if (lightKey) return { key: lightKey, balance: Number(next[lightKey]) };
  }

  // Last resort: any positive paid balance. Prevents "orphan wallet + false adeudo"
  // when the appointment equipment/price key does not match how the POS stored the purchase.
  let best = null;
  for (const [key, balance] of Object.entries(next)) {
    const bal = Number(balance) || 0;
    if (bal <= 0) continue;
    if (!best || bal > best.balance) best = { key, balance: bal };
  }
  if (best) return best;

  return null;
}

export function hasPaidSessionBalance(wallets = {}, equipment, servicePrice = null) {
  return Boolean(getAvailableWalletEntry(wallets, equipment, servicePrice));
}

/** Descuenta 1 sesión pagada de cartera si hay saldo. */
export function consumeSessionFromWallet(wallets = {}, equipment, servicePrice = null) {
  const next = { ...wallets };
  const entry = getAvailableWalletEntry(next, equipment, servicePrice);
  if (!entry) {
    return { wallets: next, deducted: false, walletKey: null };
  }
  next[entry.key] = Math.max(0, entry.balance - 1);
  return { wallets: next, deducted: true, walletKey: entry.key };
}

/**
 * Aplica compra POS: primero liquida adeudo, el resto va a cartera.
 */
export function applyPurchaseSessions(wallets = {}, adeudo = 0, equipment, sessions) {
  const qty = Math.max(0, Number(sessions) || 0);
  let nextAdeudo = Math.max(0, Number(adeudo) || 0);
  const nextWallets = { ...wallets };

  const debtCleared = Math.min(nextAdeudo, qty);
  nextAdeudo -= debtCleared;
  const addedToWallet = qty - debtCleared;
  const storageKey = String(equipment ?? '').trim() || 'general';
  nextWallets[storageKey] = (Number(nextWallets[storageKey]) || 0) + addedToWallet;

  return {
    wallets: nextWallets,
    adeudo: nextAdeudo,
    debtCleared,
    addedToWallet,
  };
}

/** Revierte una venta POS (soporta tickets antiguos sin desglose). */
export function reversePurchaseSessions(wallets = {}, adeudo = 0, tx = {}, packageHistory = null) {
  const history = packageHistory ?? tx?.packageHistory ?? [];
  const repaired = repairLegacyWalletKeys(wallets, history);
  const eqName = resolveWalletStorageKey({
    serviceName: tx.serviceName,
    equipment: tx.equipment,
    unitPrice: tx.unitPrice,
  });
  const nextWallets = { ...repaired.wallets };
  const addedToWallet = tx.addedToWallet ?? tx.sessions ?? 0;
  const debtCleared = tx.debtCleared ?? 0;

  let remaining = addedToWallet;
  if ((Number(nextWallets[eqName]) || 0) > 0) {
    const take = Math.min(Number(nextWallets[eqName]) || 0, remaining);
    nextWallets[eqName] = Math.max(0, (Number(nextWallets[eqName]) || 0) - take);
    remaining -= take;
  }
  if (remaining > 0) {
    for (const key of Object.keys(nextWallets)) {
      if (!isLegacyWalletKey(key) || (Number(nextWallets[key]) || 0) <= 0) continue;
      const take = Math.min(Number(nextWallets[key]) || 0, remaining);
      nextWallets[key] = Math.max(0, (Number(nextWallets[key]) || 0) - take);
      remaining -= take;
      if (remaining <= 0) break;
    }
  }

  const nextAdeudo = Math.max(0, (Number(adeudo) || 0) + debtCleared);

  return { wallets: nextWallets, adeudo: nextAdeudo };
}

/** Devuelve 1 sesión a cartera (devolución / cancelación con reembolso). */
export function creditSessionToWallet(wallets = {}, { equipment, serviceName, servicePrice = null, packageHistory = [] } = {}) {
  const repaired = repairLegacyWalletKeys(wallets, packageHistory);
  const next = { ...repaired.wallets };
  const key = resolveWalletStorageKey({
    serviceName: serviceName || equipment,
    equipment,
    unitPrice: servicePrice,
  });
  next[key] = (Number(next[key]) || 0) + 1;
  return next;
}

/**
 * Revierte el impacto de un no-show:
 * si hay adeudo (sesión sin saldo), baja 1; si no, regresa 1 sesión a cartera.
 */
export function reverseNoShowWalletImpact(wallets = {}, adeudo = 0, {
  equipment,
  servicePrice = null,
  packageHistory = [],
} = {}) {
  const currentAdeudo = Math.max(0, Number(adeudo) || 0);
  if (currentAdeudo > 0) {
    return {
      wallets: repairLegacyWalletKeys(wallets, packageHistory).wallets,
      adeudo: currentAdeudo - 1,
      restored: 'adeudo',
    };
  }
  return {
    wallets: creditSessionToWallet(wallets, { equipment, servicePrice, packageHistory }),
    adeudo: 0,
    restored: 'wallet',
  };
}

/** Ajuste manual de cartera (+/- sesiones) sin cobro. */
export function adjustWalletSessions(wallets = {}, {
  equipment,
  serviceName,
  servicePrice = null,
  packageHistory = [],
  delta = 1,
} = {}) {
  const repaired = repairLegacyWalletKeys(wallets, packageHistory);
  const next = { ...repaired.wallets };
  const key = resolveWalletStorageKey({
    serviceName: serviceName || equipment,
    equipment,
    unitPrice: servicePrice,
  });
  next[key] = Math.max(0, (Number(next[key]) || 0) + Number(delta || 0));
  if (next[key] === 0) delete next[key];
  return next;
}

/** Repara cartera + historial antes de leer/escribir saldo. */
export function normalizeWalletState(wallets = {}, packageHistory = []) {
  return repairLegacyWalletKeys(wallets, packageHistory);
}

function sumPurchasedSessionsLocal(packageHistory = []) {
  return (packageHistory || []).reduce((sum, tx) => sum + (Number(tx.sessions) || 0), 0);
}

/**
 * Cancels false adeudo against orphan wallet sessions (classic key-mismatch seal).
 * Example: bought 5, sealed 5 times but one seal missed the wallet key →
 * historico=5, wallet=1, adeudo=1 → after reconcile wallet=0, adeudo=0.
 */
export function reconcileAdeudoAgainstWallet(wallets = {}, adeudo = 0, packageHistory = []) {
  const repaired = repairLegacyWalletKeys(wallets, packageHistory);
  let nextWallets = { ...repaired.wallets };
  let nextAdeudo = Math.max(0, Number(adeudo) || 0);
  let cleared = 0;

  while (nextAdeudo > 0 && sumWalletBalance(nextWallets) > 0) {
    const consumed = consumeSessionFromWallet(nextWallets, '', null);
    if (!consumed.deducted) break;
    nextWallets = consumed.wallets;
    if (consumed.walletKey && (Number(nextWallets[consumed.walletKey]) || 0) === 0) {
      delete nextWallets[consumed.walletKey];
    }
    nextAdeudo -= 1;
    cleared += 1;
  }

  return {
    wallets: nextWallets,
    adeudo: nextAdeudo,
    cleared,
    changed: cleared > 0 || repaired.changed,
    legacyRepaired: repaired.changed,
  };
}

/**
 * Full automatic balance for a chart (no staff button):
 * - purchased sessions cover Finalizado + No Asistió (unjustified)
 * - Falta Justificada / cortesía do NOT consume the package
 * - unpaid takes stay as red adeudo until POS payment
 * - paid 5 + took 5 ⇒ pending 0 and adeudo 0
 *
 * Identity targeted: purchased + adeudo ≈ historico + wallet
 */
export function reconcilePatientWalletState({
  wallets = {},
  adeudo = 0,
  historicoSesiones = 0,
  packageHistory = [],
} = {}) {
  const step1 = reconcileAdeudoAgainstWallet(wallets, adeudo, packageHistory);
  let nextWallets = step1.wallets;
  let nextAdeudo = step1.adeudo;
  const purchased = sumPurchasedSessionsLocal(packageHistory);
  const historico = Math.max(0, Number(historicoSesiones) || 0);
  let trimmed = 0;

  // Excess paid sessions left after all charged takes:
  // (historico + wallet) - (purchased + adeudo)
  let excess = (historico + sumWalletBalance(nextWallets)) - (purchased + nextAdeudo);
  while (excess > 0 && sumWalletBalance(nextWallets) > 0) {
    const consumed = consumeSessionFromWallet(nextWallets, '', null);
    if (!consumed.deducted) break;
    nextWallets = consumed.wallets;
    if (consumed.walletKey && (Number(nextWallets[consumed.walletKey]) || 0) === 0) {
      delete nextWallets[consumed.walletKey];
    }
    trimmed += 1;
    excess -= 1;
  }

  return {
    wallets: nextWallets,
    adeudo: nextAdeudo,
    cleared: step1.cleared,
    trimmed,
    purchased,
    historico,
    pending: sumWalletBalance(nextWallets),
    changed: step1.changed || trimmed > 0,
  };
}

/**
 * Resuelve de dónde leer/descontar saldo: paciente individual o grupo compartido.
 */
export function resolveWalletContext({ patient, sessionGroup, equipment, servicePrice }) {
  if (sessionGroup?.id && patient?.sessionGroupId === sessionGroup.id) {
    const repaired = repairLegacyWalletKeys(
      sessionGroup.wallets || {},
      sessionGroup.packageHistory || [],
    );
    return {
      source: 'group',
      wallets: repaired.wallets,
      adeudo: Number(sessionGroup.adeudo) || 0,
      packageHistory: sessionGroup.packageHistory || [],
      groupId: sessionGroup.id,
      walletRepairPending: repaired.changed,
    };
  }
  const repaired = repairLegacyWalletKeys(patient?.wallets || {}, patient?.packageHistory || []);
  return {
    source: 'individual',
    wallets: repaired.wallets,
    adeudo: Number(patient?.adeudo) || 0,
    packageHistory: patient?.packageHistory || [],
    groupId: null,
    walletRepairPending: repaired.changed,
  };
}

export async function persistWalletAfterConsume({
  supabase,
  walletContext,
  consumed,
  nextAdeudo,
  patientId,
  historicoSesiones,
}) {
  const pid = patientId != null && String(patientId).trim() !== '' ? patientId : null;
  if (!pid) {
    throw new Error('No se pudo actualizar la cartera: falta el ID del paciente.');
  }

  if (walletContext?.source === 'group') {
    const groupId = walletContext.groupId != null && String(walletContext.groupId).trim() !== ''
      ? walletContext.groupId
      : null;
    if (!groupId) {
      throw new Error('No se pudo actualizar el grupo de sesiones: falta el ID del grupo.');
    }
    const { error: groupErr } = await supabase
      .from('session_groups')
      .update({ wallets: consumed.wallets, adeudo: nextAdeudo })
      .eq('id', groupId);
    if (groupErr) throw groupErr;

    const { error: histErr } = await supabase
      .from('patients')
      .update({ historico_sesiones: historicoSesiones })
      .eq('id', pid);
    if (histErr) throw histErr;
    return;
  }

  let patRes = await supabase.from('patients').update({
    wallets: consumed.wallets,
    adeudo: nextAdeudo,
    historico_sesiones: historicoSesiones,
  }).eq('id', pid);
  if (patRes.error && /column|adeudo/i.test(patRes.error.message || '')) {
    patRes = await supabase.from('patients').update({
      wallets: consumed.wallets,
      historico_sesiones: historicoSesiones,
    }).eq('id', pid);
  }
  if (patRes.error) throw patRes.error;
}
