import { isGdlCluster, normalizeClinicId } from './clinicRegistry.js';

/** Fondo fijo México (MXN). USA se define después → 0 por ahora. */
export const PETTY_CASH_FLOAT_MXN = 3000;

export const CASH_DRAWER_EVENT_ARQUEO = 'arqueo';
export const CASH_DRAWER_EVENT_RETIRO = 'retiro';

export function getPettyCashFloat(clinic) {
  const id = normalizeClinicId(clinic);
  if (isGdlCluster(id)) return PETTY_CASH_FLOAT_MXN;
  return 0;
}

export function expenseCreatedMs(row = {}) {
  const raw = row.created_at || row.createdAt || '';
  const t = Date.parse(raw);
  return Number.isNaN(t) ? 0 : t;
}

export function filterExpensesSince(expenses = [], sinceMs = 0) {
  return (expenses || []).filter((row) => {
    const ms = expenseCreatedMs(row);
    if (sinceMs > 0 && ms > 0 && ms <= sinceMs) return false;
    return true;
  });
}

export function sumExpenses(expenses = []) {
  const total = (expenses || []).reduce((sum, row) => sum + (Number(row.amount) || 0), 0);
  return Math.round(total * 100) / 100;
}

/**
 * Caja esperada y monto a retirar.
 * esperado en cajón = fondo fijo + ventas efectivo − gastos
 * a retirar (corte) = ventas − gastos (el fondo fijo se queda)
 */
export function computeCashDrawerTotals({
  cashSalesTotal = 0,
  expensesTotal = 0,
  floatAmount = 0,
} = {}) {
  const sales = Math.round((Number(cashSalesTotal) || 0) * 100) / 100;
  const expenses = Math.round((Number(expensesTotal) || 0) * 100) / 100;
  const floatAmt = Math.round((Number(floatAmount) || 0) * 100) / 100;
  const expectedInDrawer = Math.round((floatAmt + sales - expenses) * 100) / 100;
  const withdrawAmount = Math.round((sales - expenses) * 100) / 100;
  return {
    floatAmount: floatAmt,
    cashSalesTotal: sales,
    expensesTotal: expenses,
    expectedInDrawer,
    withdrawAmount: Math.max(0, withdrawAmount),
  };
}

export function validatePettyCashExpense({ amount, reason } = {}) {
  const value = Number(amount);
  const note = String(reason || '').trim();
  if (!Number.isFinite(value) || value <= 0) {
    return { ok: false, error: 'invalid_amount' };
  }
  if (note.length < 2) {
    return { ok: false, error: 'reason_required' };
  }
  return {
    ok: true,
    amount: Math.round(value * 100) / 100,
    reason: note,
  };
}

export function buildPettyCashExpenseRow({
  clinic,
  amount,
  reason,
  createdBy = '',
} = {}) {
  const validated = validatePettyCashExpense({ amount, reason });
  if (!validated.ok) return validated;
  return {
    ok: true,
    row: {
      clinic: normalizeClinicId(clinic),
      amount: validated.amount,
      reason: validated.reason,
      created_by: String(createdBy || '').trim(),
    },
  };
}

/** Último retiro: cash_drawer_events primero; si no hay, corte legacy en audit_logs. */
export function resolveLastRetiroTimestampMs({ drawerEvents = [], auditCuts = [] } = {}) {
  let best = 0;
  for (const row of drawerEvents || []) {
    if (String(row.event_type) !== CASH_DRAWER_EVENT_RETIRO) continue;
    const t = Date.parse(row.created_at || row.period_to || '');
    if (!Number.isNaN(t) && t > best) best = t;
  }
  for (const row of auditCuts || []) {
    const details = typeof row?.details === 'object'
      ? row.details
      : (() => {
        try { return JSON.parse(String(row?.details || '')); } catch { return null; }
      })();
    const iso = details?.closedAt || row?.timestamp || row?.created_at;
    const t = Date.parse(iso || '');
    if (!Number.isNaN(t) && t > best) best = t;
  }
  return best;
}

export function buildCashDrawerEventPayload({
  eventType,
  clinic,
  floatAmount = 0,
  cashSalesTotal = 0,
  expensesTotal = 0,
  expectedInDrawer = 0,
  withdrawAmount = 0,
  countedAmount = 0,
  deliveredBy = '',
  receivedBy = '',
  notes = '',
  ticketCount = 0,
  expenseCount = 0,
  periodFrom = null,
  periodTo = null,
  details = {},
  createdBy = '',
} = {}) {
  const counted = Math.round((Number(countedAmount) || 0) * 100) / 100;
  const expected = Math.round((Number(expectedInDrawer) || 0) * 100) / 100;
  const difference = Math.round((counted - expected) * 100) / 100;
  return {
    clinic: normalizeClinicId(clinic),
    event_type: eventType,
    float_amount: Math.round((Number(floatAmount) || 0) * 100) / 100,
    cash_sales_total: Math.round((Number(cashSalesTotal) || 0) * 100) / 100,
    expenses_total: Math.round((Number(expensesTotal) || 0) * 100) / 100,
    expected_in_drawer: expected,
    withdraw_amount: Math.round((Number(withdrawAmount) || 0) * 100) / 100,
    counted_amount: counted,
    difference,
    matched: difference === 0,
    delivered_by: String(deliveredBy || '').trim(),
    received_by: String(receivedBy || '').trim(),
    notes: String(notes || '').trim(),
    ticket_count: Number(ticketCount) || 0,
    expense_count: Number(expenseCount) || 0,
    period_from: periodFrom,
    period_to: periodTo || new Date().toISOString(),
    details,
    created_by: String(createdBy || '').trim(),
  };
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatWhen(iso, locale = 'es') {
  if (!iso) return '';
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return String(iso);
  return new Date(t).toLocaleString(locale === 'en' ? 'en-US' : 'es-MX');
}

export function buildArqueoTicketHtml({
  event,
  companyConfig = {},
  clinicName = '',
  locale = 'es',
  currency = 'MXN',
} = {}) {
  const es = locale !== 'en';
  const clinic = companyConfig.name || clinicName || '';
  const money = (n) => `$${(Number(n) || 0).toFixed(2)} ${currency}`;
  const when = formatWhen(event.period_to || event.created_at, locale);
  return `
    <div style="font-family:monospace;font-size:12px;line-height:1.35;padding:4px;">
      <p style="text-align:center;font-weight:900;font-size:14px;margin:0 0 6px;">${es ? 'ARQUEO DE CAJA' : 'CASH COUNT'}</p>
      <p style="text-align:center;margin:0 0 8px;">${escapeHtml(clinic)}</p>
      <p>${es ? 'Fecha' : 'Date'}: ${escapeHtml(when)}</p>
      <p>${es ? 'Realizado por' : 'By'}: ${escapeHtml(event.created_by || '')}</p>
      <hr style="border:none;border-top:1px dashed #000;margin:8px 0;" />
      <p>${es ? 'Fondo fijo' : 'Float'}: ${money(event.float_amount)}</p>
      <p>${es ? 'Ventas efectivo' : 'Cash sales'}: ${money(event.cash_sales_total)}</p>
      <p>${es ? 'Gastos caja chica' : 'Petty cash'}: −${money(event.expenses_total)}</p>
      <p><strong>${es ? 'Esperado en caja' : 'Expected in drawer'}:</strong> ${money(event.expected_in_drawer)}</p>
      <p><strong>${es ? 'Contado' : 'Counted'}:</strong> ${money(event.counted_amount)}</p>
      <p><strong>${es ? 'Diferencia' : 'Difference'}:</strong> ${money(event.difference)}</p>
      <p>${event.matched ? (es ? '✓ COINCIDE' : '✓ MATCHED') : (es ? '⚠ NO COINCIDE' : '⚠ MISMATCH')}</p>
      ${event.notes ? `<p>${es ? 'Notas' : 'Notes'}: ${escapeHtml(event.notes)}</p>` : ''}
      <hr style="border:none;border-top:1px dashed #000;margin:8px 0;" />
      <p style="text-align:center;font-size:10px;">${es ? 'Solo conteo — no es retiro' : 'Count only — not a withdrawal'}</p>
    </div>
  `;
}

/** Filtra gastos por rango de fechas ISO (inclusive, por día local UTC date string). */
export function filterExpensesByDateRange(expenses = [], startDate, endDate) {
  const start = String(startDate || '').slice(0, 10);
  const end = String(endDate || '').slice(0, 10);
  return (expenses || []).filter((row) => {
    const iso = String(row.created_at || '').slice(0, 10);
    if (!iso) return false;
    if (start && iso < start) return false;
    if (end && iso > end) return false;
    return true;
  });
}
