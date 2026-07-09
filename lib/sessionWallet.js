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
  if (equip) return equip;
  const name = String(serviceName ?? '').trim();
  if (name) return name;
  return priceWalletKey(unitPrice) || 'general';
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
export function reversePurchaseSessions(wallets = {}, adeudo = 0, tx = {}) {
  const eqName = resolveWalletStorageKey({
    serviceName: tx.serviceName,
    equipment: tx.equipment,
    unitPrice: tx.unitPrice,
  });
  const nextWallets = { ...(wallets || {}) };
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

/**
 * Resuelve de dónde leer/descontar saldo: paciente individual o grupo compartido.
 */
export function resolveWalletContext({ patient, sessionGroup, equipment, servicePrice }) {
  if (sessionGroup?.id && patient?.sessionGroupId === sessionGroup.id) {
    return {
      source: 'group',
      wallets: sessionGroup.wallets || {},
      adeudo: Number(sessionGroup.adeudo) || 0,
      packageHistory: sessionGroup.packageHistory || [],
      groupId: sessionGroup.id,
    };
  }
  return {
    source: 'individual',
    wallets: patient?.wallets || {},
    adeudo: Number(patient?.adeudo) || 0,
    packageHistory: patient?.packageHistory || [],
    groupId: null,
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
  if (walletContext.source === 'group') {
    const { error: groupErr } = await supabase
      .from('session_groups')
      .update({ wallets: consumed.wallets, adeudo: nextAdeudo })
      .eq('id', walletContext.groupId);
    if (groupErr) throw groupErr;
  } else {
    let patRes = await supabase.from('patients').update({
      wallets: consumed.wallets,
      adeudo: nextAdeudo,
      historico_sesiones: historicoSesiones,
    }).eq('id', patientId);
    if (patRes.error && /column|adeudo/i.test(patRes.error.message || '')) {
      patRes = await supabase.from('patients').update({
        wallets: consumed.wallets,
        historico_sesiones: historicoSesiones,
      }).eq('id', patientId);
    }
    if (patRes.error) throw patRes.error;
    return;
  }

  const { error: histErr } = await supabase
    .from('patients')
    .update({ historico_sesiones: historicoSesiones })
    .eq('id', patientId);
  if (histErr) throw histErr;
}
