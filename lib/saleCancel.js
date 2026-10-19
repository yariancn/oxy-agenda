/** Soft-cancel POS tickets — keep audit trail, reverse wallet separately. */

export function isSaleCancelled(tx) {
  if (!tx || typeof tx !== 'object') return false;
  if (tx.cancelled === true || tx.voided === true) return true;
  const status = String(tx.status || '').toLowerCase();
  return status === 'cancelled' || status === 'canceled' || status === 'void' || status === 'voided';
}

export function markSaleCancelled(tx, {
  reason = '',
  cancelledBy = '',
  cancelledAt = new Date().toISOString(),
} = {}) {
  const why = String(reason || '').trim();
  if (!why) {
    throw new Error('cancel_reason_required');
  }
  return {
    ...tx,
    cancelled: true,
    status: 'cancelled',
    cancelReason: why.slice(0, 500),
    cancelledBy: String(cancelledBy || '').trim().slice(0, 120),
    cancelledAt: cancelledAt || new Date().toISOString(),
  };
}

/** Replace matching sale in history with a cancelled copy (does not remove the row). */
export function cancelSaleInHistory(history = [], txId, meta = {}) {
  let found = false;
  const next = (history || []).map((tx) => {
    if (String(tx.id) !== String(txId)) return tx;
    if (isSaleCancelled(tx)) {
      found = true;
      return tx;
    }
    found = true;
    return markSaleCancelled(tx, meta);
  });
  return { history: next, found, alreadyCancelled: found && isSaleCancelled(
    (history || []).find((tx) => String(tx.id) === String(txId)),
  ) };
}

export function activeSalesOnly(history = []) {
  return (history || []).filter((tx) => !isSaleCancelled(tx));
}

export function cancelledSalesOnly(history = []) {
  return (history || []).filter((tx) => isSaleCancelled(tx));
}
