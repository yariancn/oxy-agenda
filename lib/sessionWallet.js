export function priceWalletKey(price) {
  const n = Number(price);
  if (!n || Number.isNaN(n)) return null;
  return `price_${n}`;
}

export function sumWalletBalance(wallets = {}) {
  return Object.values(wallets || {}).reduce((sum, n) => sum + (Number(n) || 0), 0);
}

/** Saldo pagado disponible en cartera (equipo, tier de precio o cámara alterna). */
export function getAvailableWalletEntry(wallets = {}, equipment, servicePrice = null) {
  const next = wallets || {};
  const eq = equipment;

  if ((next[eq] || 0) > 0) return { key: eq, balance: next[eq] };

  const priceKey = priceWalletKey(servicePrice);
  if (priceKey && (next[priceKey] || 0) > 0) {
    return { key: priceKey, balance: next[priceKey] };
  }

  const fallback = Object.keys(next).find((key) =>
    (key.toLowerCase().includes('cámara') || key.toLowerCase().includes('camara') || key.toLowerCase().includes('chamber'))
    && (next[key] || 0) > 0,
  );
  if (fallback) return { key: fallback, balance: next[fallback] };

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
  nextWallets[equipment] = (nextWallets[equipment] || 0) + addedToWallet;

  return {
    wallets: nextWallets,
    adeudo: nextAdeudo,
    debtCleared,
    addedToWallet,
  };
}

/** Revierte una venta POS (soporta tickets antiguos sin desglose). */
export function reversePurchaseSessions(wallets = {}, adeudo = 0, tx = {}) {
  const eqName = tx.equipment || tx.serviceName;
  const nextWallets = { ...wallets };
  const addedToWallet = tx.addedToWallet ?? tx.sessions ?? 0;
  const debtCleared = tx.debtCleared ?? 0;

  nextWallets[eqName] = Math.max(0, (nextWallets[eqName] || 0) - addedToWallet);
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
