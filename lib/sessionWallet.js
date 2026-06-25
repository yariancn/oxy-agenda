/** Saldo pagado disponible en cartera (equipo solicitado o cámara alterna). */
export function getAvailableWalletEntry(wallets = {}, equipment) {
  const next = wallets || {};
  const eq = equipment;
  if ((next[eq] || 0) > 0) return { key: eq, balance: next[eq] };

  const fallback = Object.keys(next).find((key) =>
    (key.toLowerCase().includes('cámara') || key.toLowerCase().includes('camara'))
    && (next[key] || 0) > 0,
  );
  if (fallback) return { key: fallback, balance: next[fallback] };
  return null;
}

export function hasPaidSessionBalance(wallets = {}, equipment) {
  return Boolean(getAvailableWalletEntry(wallets, equipment));
}

/** Descuenta 1 sesión pagada de cartera si hay saldo. */
export function consumeSessionFromWallet(wallets = {}, equipment) {
  const next = { ...wallets };
  const entry = getAvailableWalletEntry(next, equipment);
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
