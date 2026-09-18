/** Stable payment method keys used for corte / reports. */
export const PAYMENT_METHOD_KEYS = {
  CASH: 'cash',
  DEBIT: 'debit',
  CREDIT: 'credit',
  TRANSFER: 'transfer',
};

const CASH_ALIASES = new Set(['cash', 'efectivo']);
const DEBIT_ALIASES = new Set(['debit', 'debit card', 'tarjeta de débito', 'tarjeta de debito', 'débito', 'debito']);
const CREDIT_ALIASES = new Set(['credit', 'credit card', 'tarjeta de crédito', 'tarjeta de credito', 'crédito', 'credito']);
const TRANSFER_ALIASES = new Set(['transfer', 'transferencia', 'wire', 'zelle', 'ach']);

function normalizeLabel(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

export function resolvePaymentMethodKey(method) {
  const raw = String(method || '').trim();
  if (!raw) return '';
  const n = normalizeLabel(raw);
  if (CASH_ALIASES.has(n) || n.includes('efectivo') || n === 'cash') return PAYMENT_METHOD_KEYS.CASH;
  if (DEBIT_ALIASES.has(n) || n.includes('debit') || n.includes('debito')) return PAYMENT_METHOD_KEYS.DEBIT;
  if (CREDIT_ALIASES.has(n) || n.includes('credit') || n.includes('credito')) return PAYMENT_METHOD_KEYS.CREDIT;
  if (TRANSFER_ALIASES.has(n) || n.includes('transfer')) return PAYMENT_METHOD_KEYS.TRANSFER;
  return '';
}

export function isCashPaymentMethod(method) {
  return resolvePaymentMethodKey(method) === PAYMENT_METHOD_KEYS.CASH;
}

export function paymentMethodLabel(key, locale = 'es') {
  const en = locale === 'en';
  switch (key) {
    case PAYMENT_METHOD_KEYS.CASH:
      return en ? 'Cash' : 'Efectivo';
    case PAYMENT_METHOD_KEYS.DEBIT:
      return en ? 'Debit Card' : 'Tarjeta de Débito';
    case PAYMENT_METHOD_KEYS.CREDIT:
      return en ? 'Credit Card' : 'Tarjeta de Crédito';
    case PAYMENT_METHOD_KEYS.TRANSFER:
      return en ? 'Transfer' : 'Transferencia';
    default:
      return '';
  }
}

export function paymentMethodOptions(locale = 'es') {
  return [
    { value: PAYMENT_METHOD_KEYS.CREDIT, label: paymentMethodLabel(PAYMENT_METHOD_KEYS.CREDIT, locale) },
    { value: PAYMENT_METHOD_KEYS.DEBIT, label: paymentMethodLabel(PAYMENT_METHOD_KEYS.DEBIT, locale) },
    { value: PAYMENT_METHOD_KEYS.CASH, label: paymentMethodLabel(PAYMENT_METHOD_KEYS.CASH, locale) },
    { value: PAYMENT_METHOD_KEYS.TRANSFER, label: paymentMethodLabel(PAYMENT_METHOD_KEYS.TRANSFER, locale) },
  ];
}

/** Persist display label (keeps ticket/report readable) from stable key. */
export function paymentMethodStoredLabel(keyOrLabel, locale = 'es') {
  const key = resolvePaymentMethodKey(keyOrLabel) || keyOrLabel;
  if (Object.values(PAYMENT_METHOD_KEYS).includes(key)) {
    return paymentMethodLabel(key, locale);
  }
  return String(keyOrLabel || '').trim();
}

function moneyRound(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

/**
 * Normalize stored or draft split rows.
 * @returns {{ method: string, amount: number, label: string }[]}
 */
export function getPaymentSplits(txOrSplits, locale = 'es') {
  const raw = Array.isArray(txOrSplits)
    ? txOrSplits
    : (txOrSplits?.paymentSplits || txOrSplits?.payment_splits || []);
  if (!Array.isArray(raw) || !raw.length) return [];

  return raw
    .map((row) => {
      const method = resolvePaymentMethodKey(row?.method || row?.key || row?.paymentMethod);
      const amount = moneyRound(row?.amount);
      if (!method || amount <= 0) return null;
      return {
        method,
        amount,
        label: paymentMethodStoredLabel(method, locale),
      };
    })
    .filter(Boolean);
}

export function sumPaymentSplits(splits) {
  return moneyRound(getPaymentSplits(splits).reduce((sum, row) => sum + row.amount, 0));
}

/** True when the sale has 2–3 structured tender rows. */
export function isSplitPayment(tx) {
  return getPaymentSplits(tx).length >= 2;
}

/**
 * Build a readable combined label, e.g. "Efectivo $500 + Transferencia $300".
 */
export function formatPaymentSplitsLabel(splits, locale = 'es', { includeAmounts = true } = {}) {
  const rows = getPaymentSplits(splits, locale);
  if (!rows.length) return '';
  return rows
    .map((row) => (includeAmounts ? `${row.label} $${row.amount.toFixed(2)}` : row.label))
    .join(' + ');
}

/** Display string for tickets / ledger (split-aware, backward compatible). */
export function formatSalePaymentMethod(tx, locale = 'es') {
  if (isSplitPayment(tx)) {
    return formatPaymentSplitsLabel(tx, locale);
  }
  return String(tx?.paymentMethod || '').trim();
}

/**
 * Allocate one sale's total across method buckets (no double-count of full price).
 * @returns {Record<string, number>}
 */
export function allocateSaleByMethod(tx) {
  const out = {
    [PAYMENT_METHOD_KEYS.CASH]: 0,
    [PAYMENT_METHOD_KEYS.DEBIT]: 0,
    [PAYMENT_METHOD_KEYS.CREDIT]: 0,
    [PAYMENT_METHOD_KEYS.TRANSFER]: 0,
    other: 0,
  };
  const splits = getPaymentSplits(tx);
  if (splits.length) {
    for (const row of splits) {
      out[row.method] = moneyRound((out[row.method] || 0) + row.amount);
    }
    return out;
  }
  const price = moneyRound(tx?.price);
  if (price <= 0) return out;
  const key = resolvePaymentMethodKey(tx?.paymentMethod) || 'other';
  out[key] = moneyRound((out[key] || 0) + price);
  return out;
}

/** Cash portion of a sale (full price if single cash tender; else sum of cash splits). */
export function cashAmountFromSale(tx) {
  return moneyRound(allocateSaleByMethod(tx)[PAYMENT_METHOD_KEYS.CASH] || 0);
}

/**
 * Validate draft split rows against charge total.
 * @returns {{ ok: true, splits: object[] } | { ok: false, error: 'empty'|'count'|'methods'|'amounts'|'sum' }}
 */
export function validatePaymentSplits(draftSplits, total, locale = 'es') {
  const target = moneyRound(total);
  const cleaned = getPaymentSplits(draftSplits, locale);
  if (cleaned.length < 2 || cleaned.length > 3) {
    return { ok: false, error: 'count' };
  }
  const methods = cleaned.map((row) => row.method);
  if (new Set(methods).size !== methods.length) {
    return { ok: false, error: 'methods' };
  }
  if (cleaned.some((row) => row.amount <= 0)) {
    return { ok: false, error: 'amounts' };
  }
  if (Math.abs(sumPaymentSplits(cleaned) - target) > 0.009) {
    return { ok: false, error: 'sum' };
  }
  return { ok: true, splits: cleaned };
}
