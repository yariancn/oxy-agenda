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
