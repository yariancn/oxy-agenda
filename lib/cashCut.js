import { collectSalesReportRows, saleTxIsoDate } from './salesReportExport.js';
import { isCashPaymentMethod, resolvePaymentMethodKey, paymentMethodLabel } from './paymentMethod.js';

export const CASH_CUT_AUDIT_ACTION = 'CORTE EFECTIVO';
export const CASH_CUT_AUDIT_ACTION_EN = 'CASH CUT';

export function saleTxCreatedMs(tx = {}) {
  const created = String(tx.createdAt || tx.created_at || '').trim();
  if (created) {
    const t = Date.parse(created);
    if (!Number.isNaN(t)) return t;
  }
  const idNum = Number(tx.id);
  if (Number.isFinite(idNum) && idNum > 1e11) return idNum;
  const iso = saleTxIsoDate(tx);
  if (iso) {
    const t = Date.parse(`${iso}T12:00:00`);
    if (!Number.isNaN(t)) return t;
  }
  return 0;
}

export function parseCashCutAuditDetails(details) {
  if (!details) return null;
  if (typeof details === 'object') return details;
  try {
    const parsed = JSON.parse(String(details));
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

export function isCashCutAuditRow(row) {
  const action = String(row?.action || '');
  return action === CASH_CUT_AUDIT_ACTION || action === CASH_CUT_AUDIT_ACTION_EN;
}

export function cashCutRowTimestampMs(row) {
  const details = parseCashCutAuditDetails(row?.details);
  if (details?.closedAt) {
    const t = Date.parse(details.closedAt);
    if (!Number.isNaN(t)) return t;
  }
  const raw = row?.timestamp || row?.created_at || row?.createdAt;
  const t = Date.parse(raw || '');
  return Number.isNaN(t) ? 0 : t;
}

/**
 * Cash sales after last corte (exclusive). If no prior cut, all known cash sales.
 */
export function collectCashSalesSinceCut({
  patients = [],
  sessionGroups = [],
  sinceMs = 0,
} = {}) {
  const collected = collectSalesReportRows({ patients, sessionGroups });
  const all = collected?.rows || [];
  const cash = all.filter((tx) => {
    if (!isCashPaymentMethod(tx.paymentMethod)) return false;
    const ms = saleTxCreatedMs(tx);
    if (sinceMs > 0 && ms > 0 && ms <= sinceMs) return false;
    return true;
  });

  cash.sort((a, b) => saleTxCreatedMs(a) - saleTxCreatedMs(b));

  const expectedCash = cash.reduce((sum, tx) => sum + (Number(tx.price) || 0), 0);
  const byMethod = {};
  for (const tx of all) {
    const key = resolvePaymentMethodKey(tx.paymentMethod) || 'other';
    if (sinceMs > 0) {
      const ms = saleTxCreatedMs(tx);
      if (ms > 0 && ms <= sinceMs) continue;
    }
    byMethod[key] = (byMethod[key] || 0) + (Number(tx.price) || 0);
  }

  return {
    sales: cash,
    expectedCash: Math.round(expectedCash * 100) / 100,
    ticketCount: cash.length,
    byMethod,
  };
}

export function buildCashCutRecord({
  expectedCash,
  countedCash,
  sales = [],
  closedBy = '',
  deliveredBy = '',
  receivedBy = '',
  clinic = '',
  locale = 'es',
  notes = '',
  sinceMs = 0,
  previousCutAt = null,
  periodFrom = null,
  periodTo = null,
} = {}) {
  const expected = Math.round((Number(expectedCash) || 0) * 100) / 100;
  const counted = Math.round((Number(countedCash) || 0) * 100) / 100;
  const difference = Math.round((counted - expected) * 100) / 100;
  const closedAt = new Date().toISOString();
  const entrega = String(deliveredBy || closedBy || '').trim();
  const recibe = String(receivedBy || '').trim();
  return {
    id: Date.now(),
    closedAt,
    closedBy: entrega || closedBy,
    deliveredBy: entrega,
    receivedBy: recibe,
    clinic,
    expectedCash: expected,
    countedCash: counted,
    difference,
    matched: difference === 0,
    notes: String(notes || '').trim(),
    sinceMs: Number(sinceMs) || 0,
    previousCutAt,
    periodFrom: periodFrom || (sinceMs > 0 ? new Date(sinceMs).toISOString() : null),
    periodTo: periodTo || closedAt,
    ticketCount: sales.length,
    tickets: sales.map((tx) => ({
      id: tx.id,
      ticketNumber: tx.ticketNumber || tx.ticket_number || '',
      patient: tx.patientName || tx.patient || '',
      amount: Number(tx.price) || 0,
      date: tx.date || saleTxIsoDate(tx),
      createdAt: tx.createdAt || tx.created_at || '',
    })),
    locale,
  };
}

function formatCutWhen(iso, locale = 'es') {
  if (!iso) return '';
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return String(iso);
  return new Date(t).toLocaleString(locale === 'en' ? 'en-US' : 'es-MX');
}

export function buildCashCutTicketHtml({
  cut,
  companyConfig = {},
  clinicName = '',
  locale = 'es',
  currency = 'MXN',
  copyLabel = '',
  copyRole = '',
} = {}) {
  const es = locale !== 'en';
  const title = es ? 'CORTE DE EFECTIVO' : 'CASH CUT';
  const clinic = companyConfig.name || clinicName || '';
  const money = (n) => `$${(Number(n) || 0).toFixed(2)} ${currency}`;
  const when = formatCutWhen(cut.closedAt, locale);
  const fromLabel = cut.periodFrom
    ? formatCutWhen(cut.periodFrom, locale)
    : (es ? 'Inicio (sin corte previo)' : 'Start (no prior cut)');
  const toLabel = formatCutWhen(cut.periodTo || cut.closedAt, locale);
  const deliveredBy = String(cut.deliveredBy || cut.closedBy || '').trim();
  const receivedBy = String(cut.receivedBy || '').trim();
  const copyBanner = copyLabel
    ? `<p style="text-align:center;font-weight:900;font-size:11px;margin:0 0 8px;border:2px solid #000;padding:4px;">${escapeHtml(copyLabel)}</p>`
    : '';
  const signatureBlock = (label, name) => `
      <div style="margin-top:14px;padding-top:8px;border-top:1px dashed #000;">
        <p style="font-size:10px;margin:0 0 18px;">${escapeHtml(label)}</p>
        <p style="font-size:10px;margin:0;border-bottom:1px solid #000;padding-bottom:2px;">${escapeHtml(name || '—')}</p>
        <p style="font-size:9px;margin:4px 0 0;text-align:center;">${es ? 'Firma' : 'Signature'}</p>
      </div>`;
  const footer = copyRole === 'deliver'
    ? signatureBlock(es ? 'Yo entrego el efectivo' : 'I deliver the cash', deliveredBy)
    : copyRole === 'receive'
      ? signatureBlock(es ? 'Yo recibo el efectivo' : 'I receive the cash', receivedBy)
      : `<hr style="border:none;border-top:1px dashed #000;margin:8px 0;" />
      <p style="text-align:center;font-size:10px;">${es ? 'Retiro de efectivo — guardar con el arqueo' : 'Cash withdrawal — keep with drawer count'}</p>`;
  const lines = (cut.tickets || []).slice(0, 40).map((t) => (
    `<p style="font-size:10px;margin:2px 0;">#${escapeHtml(t.ticketNumber || t.id)} ${escapeHtml(t.patient || '')} ${money(t.amount)}</p>`
  )).join('');
  const more = (cut.tickets || []).length > 40
    ? `<p style="font-size:10px;">… +${(cut.tickets || []).length - 40} ${es ? 'más' : 'more'}</p>`
    : '';

  return `
    <div style="font-family:monospace;font-size:12px;line-height:1.35;padding:4px;">
      ${copyBanner}
      <p style="text-align:center;font-weight:900;font-size:14px;margin:0 0 6px;">${title}</p>
      <p style="text-align:center;margin:0 0 8px;">${escapeHtml(clinic)}</p>
      <p>${es ? 'Corte' : 'Cut'}: ${escapeHtml(when)}</p>
      <p><strong>${es ? 'Entrega' : 'Delivered by'}:</strong> ${escapeHtml(deliveredBy || '—')}</p>
      <p><strong>${es ? 'Recibe' : 'Received by'}:</strong> ${escapeHtml(receivedBy || '—')}</p>
      <p><strong>${es ? 'Periodo' : 'Period'}</strong></p>
      <p>${es ? 'Desde' : 'From'}: ${escapeHtml(fromLabel)}</p>
      <p>${es ? 'Hasta' : 'To'}: ${escapeHtml(toLabel)}</p>
      <hr style="border:none;border-top:1px dashed #000;margin:8px 0;" />
      <p><strong>${es ? 'Tickets efectivo' : 'Cash tickets'}:</strong> ${cut.ticketCount || 0}</p>
      <p><strong>${es ? 'Esperado' : 'Expected'}:</strong> ${money(cut.expectedCash)}</p>
      <p><strong>${es ? 'Contado / retirado' : 'Counted / withdrawn'}:</strong> ${money(cut.countedCash)}</p>
      <p><strong>${es ? 'Diferencia' : 'Difference'}:</strong> ${money(cut.difference)}</p>
      <p>${cut.matched
    ? (es ? '✓ COINCIDE' : '✓ MATCHED')
    : (es ? '⚠ NO COINCIDE' : '⚠ MISMATCH')}</p>
      ${cut.notes ? `<p>${es ? 'Notas' : 'Notes'}: ${escapeHtml(cut.notes)}</p>` : ''}
      <hr style="border:none;border-top:1px dashed #000;margin:8px 0;" />
      <p style="font-weight:900;margin:0 0 4px;">${es ? 'Detalle' : 'Detail'}</p>
      ${lines || `<p style="font-size:10px;">${es ? '(Sin ventas en efectivo)' : '(No cash sales)'}</p>`}
      ${more}
      ${footer}
    </div>
  `;
}

/** Dos tickets en un solo trabajo de impresión (una copia por persona). */
export function buildCashCutDualCopyHtml(options = {}) {
  const es = options.locale !== 'en';
  const deliverCopy = buildCashCutTicketHtml({
    ...options,
    copyLabel: es ? 'COPIA — QUIEN ENTREGA' : 'COPY — DELIVERER',
    copyRole: 'deliver',
  });
  const receiveCopy = buildCashCutTicketHtml({
    ...options,
    copyLabel: es ? 'COPIA — QUIEN RECIBE' : 'COPY — RECEIVER',
    copyRole: 'receive',
  });
  return `${deliverCopy}<div style="page-break-after:always;height:0;overflow:hidden;"></div>${receiveCopy}`;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function formatMethodBreakdown(byMethod = {}, locale = 'es') {
  return Object.entries(byMethod || {})
    .filter(([, amount]) => Number(amount) > 0)
    .map(([key, amount]) => ({
      key,
      label: paymentMethodLabel(key, locale) || key,
      amount: Math.round(Number(amount) * 100) / 100,
    }));
}
