import { isSaleCancelled } from './saleCancel.js';

function moneyRound(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

/** Open package balance due (excludes cancelled tickets). */
export function sumOpenPackageBalanceDue(history = []) {
  return moneyRound(
    (history || []).reduce((sum, tx) => {
      if (isSaleCancelled(tx)) return sum;
      return sum + (Number(tx.balanceDue) || 0);
    }, 0),
  );
}

/**
 * Amount that actually entered the till for tender allocation.
 * Partial notes (balanceDue) are NOT cash until collected on a later ticket.
 *
 * Legacy footgun: staff left Total at full package price and only filled balanceDue
 * (e.g. price 3000 + balanceDue 1500 → only 1500 tendered). Correct new tickets store
 * amountCollected = paid now, with balanceDue as a note only.
 */
export function saleCollectedAmount(tx) {
  const collected = Number(tx?.amountCollected);
  if (Number.isFinite(collected) && collected > 0) {
    return moneyRound(collected);
  }
  const price = moneyRound(tx?.price);
  const due = moneyRound(tx?.balanceDue);
  if (tx?.partialPayment && due > 0 && price > due) {
    return moneyRound(price - due);
  }
  return price;
}

/**
 * Apply a later payment against open balanceDue notes (oldest first).
 * Does not create the new sale — only clears pending on prior partial tickets.
 */
export function settlePackageBalanceDue(history = [], paidAmount = 0, {
  settledAt = new Date().toISOString(),
  settledBy = '',
  settleTicketId = null,
} = {}) {
  let remaining = moneyRound(paidAmount);
  if (remaining <= 0) {
    return { history: history || [], settled: 0, remainingDue: sumOpenPackageBalanceDue(history) };
  }

  const next = (history || []).map((tx) => {
    if (remaining <= 0 || isSaleCancelled(tx)) return tx;
    const due = moneyRound(tx.balanceDue);
    if (due <= 0) return tx;
    const take = Math.min(due, remaining);
    remaining = moneyRound(remaining - take);
    const newDue = moneyRound(due - take);
    return {
      ...tx,
      balanceDue: newDue,
      ...(newDue <= 0 ? { balanceSettledAt: settledAt, balanceSettledBy: String(settledBy || '').trim().slice(0, 120) } : {}),
      balanceSettlements: [
        ...(Array.isArray(tx.balanceSettlements) ? tx.balanceSettlements : []),
        {
          amount: take,
          at: settledAt,
          by: String(settledBy || '').trim().slice(0, 120),
          ticketId: settleTicketId,
        },
      ],
    };
  });

  return {
    history: next,
    settled: moneyRound(paidAmount - remaining),
    remainingDue: sumOpenPackageBalanceDue(next),
  };
}
