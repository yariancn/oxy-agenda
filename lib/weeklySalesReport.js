import PDFDocument from 'pdfkit';
import { getSupabaseAdmin } from './supabaseAdmin.js';
import {
  CLINIC_OXYGENDGL,
  currencyForClinic,
  getClinicMeta,
} from './clinicRegistry.js';
import { collectSalesReportRows, saleTxIsoDate } from './salesReportExport.js';
import {
  PAYMENT_METHOD_KEYS,
  paymentMethodLabel,
  resolvePaymentMethodKey,
} from './paymentMethod.js';
import { getResendApiKey, getResendFromAddress } from './resendConfig.js';
import { normalizeGroup } from './sessionGroup.js';

const REPORT_TIMEZONE = 'America/Mexico_City';
const DEFAULT_RECIPIENT = 'yarianc@yahoo.com';

const METHOD_ORDER = [
  PAYMENT_METHOD_KEYS.CASH,
  PAYMENT_METHOD_KEYS.TRANSFER,
  PAYMENT_METHOD_KEYS.CREDIT,
  PAYMENT_METHOD_KEYS.DEBIT,
];

export function subtractDaysFromIso(isoDate, days) {
  const [Y, M, D] = isoDate.split('-').map(Number);
  const dt = new Date(Date.UTC(Y, M - 1, D));
  dt.setUTCDate(dt.getUTCDate() - days);
  return dt.toISOString().slice(0, 10);
}

export function todayIsoInTimezone(timeZone = REPORT_TIMEZONE, date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const y = parts.find((p) => p.type === 'year').value;
  const m = parts.find((p) => p.type === 'month').value;
  const d = parts.find((p) => p.type === 'day').value;
  return `${y}-${m}-${d}`;
}

/** Semana anterior completa: lunes a domingo (hora Ciudad de México). */
export function getPreviousWeekRange(timeZone = REPORT_TIMEZONE, referenceDate = new Date()) {
  const todayIso = todayIsoInTimezone(timeZone, referenceDate);
  const dayName = new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'long',
  }).format(referenceDate);
  const dow = {
    Sunday: 0,
    Monday: 1,
    Tuesday: 2,
    Wednesday: 3,
    Thursday: 4,
    Friday: 5,
    Saturday: 6,
  }[dayName];
  const daysBackToThisMonday = dow === 0 ? 6 : dow - 1;
  const endDate = subtractDaysFromIso(todayIso, daysBackToThisMonday + 1);
  const startDate = subtractDaysFromIso(todayIso, daysBackToThisMonday + 7);
  return { startDate, endDate };
}

export function formatIsoDateDisplay(iso, locale = 'es-MX') {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return new Intl.DateTimeFormat(locale, {
    timeZone: 'UTC',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(dt);
}

export function formatMoney(amount, currency = 'MXN') {
  const n = Number(amount) || 0;
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency }).format(n);
}

export function summarizeSalesRows(rows = []) {
  const byMethod = {
    [PAYMENT_METHOD_KEYS.CASH]: 0,
    [PAYMENT_METHOD_KEYS.TRANSFER]: 0,
    [PAYMENT_METHOD_KEYS.CREDIT]: 0,
    [PAYMENT_METHOD_KEYS.DEBIT]: 0,
    other: 0,
  };
  let total = 0;
  let txCount = 0;

  for (const tx of rows) {
    const price = Number(tx.price) || 0;
    if (price <= 0) continue;
    total += price;
    txCount += 1;
    const key = resolvePaymentMethodKey(tx.paymentMethod) || 'other';
    byMethod[key] = (byMethod[key] || 0) + price;
  }

  return { total, txCount, byMethod };
}

async function fetchAllRows(supabase, table) {
  const all = [];
  let from = 0;
  const step = 1000;
  while (true) {
    const { data, error } = await supabase.from(table).select('*').range(from, from + step - 1);
    if (error) throw new Error(error.message);
    const batch = data || [];
    all.push(...batch);
    if (batch.length < step) break;
    from += step;
  }
  return all;
}

export async function loadGdlSalesData({ startDate, endDate } = {}) {
  const supabase = getSupabaseAdmin(CLINIC_OXYGENDGL);
  const [patientRows, groupRows] = await Promise.all([
    fetchAllRows(supabase, 'patients'),
    fetchAllRows(supabase, 'session_groups'),
  ]);

  const patients = (patientRows || []).map((p) => ({
    id: p.id,
    patient: String(p.Name || p.name || p.Nombre || ''),
    phone: String(p.Phone || p.phone || ''),
    email: String(p.Email || p.email || ''),
    protocol: String(p.protocol || ''),
    packageHistory: p.package_history || [],
  }));

  const sessionGroups = (groupRows || []).map((g) => normalizeGroup(g)).filter(Boolean);

  const { rows } = collectSalesReportRows({ patients, sessionGroups, startDate, endDate });
  return { patients, sessionGroups, rows };
}

function pdfText(doc, value, maxLen = 40) {
  const raw = String(value || '').replace(/\s+/g, ' ').trim();
  if (raw.length <= maxLen) return raw;
  return `${raw.slice(0, maxLen - 1)}…`;
}

function buildPdfBuffer({ clinicLabel, startDate, endDate, summary, rows, currency }) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 48, size: 'LETTER' });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc.fontSize(18).font('Helvetica-Bold').text('Reporte semanal de ingresos', { align: 'center' });
    doc.moveDown(0.3);
    doc.fontSize(12).font('Helvetica').text(clinicLabel, { align: 'center' });
    doc.moveDown(0.5);
    doc.fontSize(10);
    doc.text(`Periodo: ${formatIsoDateDisplay(startDate)} — ${formatIsoDateDisplay(endDate)}`, { align: 'center' });
    doc.text(
      `Generado: ${new Intl.DateTimeFormat('es-MX', {
        timeZone: REPORT_TIMEZONE,
        dateStyle: 'full',
        timeStyle: 'short',
      }).format(new Date())}`,
      { align: 'center' },
    );
    doc.moveDown(1.2);

    doc.fontSize(14).font('Helvetica-Bold').text('Resumen de ingresos');
    doc.moveDown(0.4);
    doc.fontSize(12).font('Helvetica-Bold')
      .text(`Total: ${formatMoney(summary.total, currency)}`);
    doc.moveDown(0.3);
    doc.fontSize(11).font('Helvetica');
    for (const key of METHOD_ORDER) {
      doc.text(`${paymentMethodLabel(key, 'es')}: ${formatMoney(summary.byMethod[key] || 0, currency)}`);
    }
    if (summary.byMethod.other > 0) {
      doc.text(`Otros / sin clasificar: ${formatMoney(summary.byMethod.other, currency)}`);
    }
    doc.moveDown(0.2);
    doc.text(`Transacciones: ${summary.txCount}`);
    doc.moveDown(1);

    doc.fontSize(14).font('Helvetica-Bold').text('Detalle de movimientos');
    doc.moveDown(0.5);

    const cols = [
      { label: 'Fecha', width: 62 },
      { label: 'Ticket', width: 48 },
      { label: 'Paciente', width: 110 },
      { label: 'Servicio', width: 130 },
      { label: 'Pago', width: 72 },
      { label: 'Importe', width: 72 },
    ];
    const tableLeft = doc.page.margins.left;
    let y = doc.y;

    const drawTableHeader = () => {
      doc.fontSize(8).font('Helvetica-Bold');
      let x = tableLeft;
      for (const col of cols) {
        doc.text(col.label, x, y, { width: col.width, lineBreak: false });
        x += col.width;
      }
      y += 14;
      doc.moveTo(tableLeft, y).lineTo(564, y).strokeColor('#cccccc').stroke();
      y += 6;
    };

    drawTableHeader();
    doc.font('Helvetica');

    const paidRows = rows.filter((tx) => (Number(tx.price) || 0) > 0);
    for (const tx of paidRows) {
      if (y > 720) {
        doc.addPage();
        y = doc.page.margins.top;
        drawTableHeader();
      }
      const cells = [
        saleTxIsoDate(tx) || tx.date || '',
        String(tx.ticketNumber || tx.id || '').slice(-8),
        pdfText(tx.patientName || tx.patient, 22),
        pdfText(tx.serviceName || tx.description, 24),
        pdfText(tx.paymentMethod, 16),
        formatMoney(tx.price, currency),
      ];
      let x = tableLeft;
      doc.fontSize(7.5);
      for (let i = 0; i < cols.length; i += 1) {
        doc.text(cells[i], x, y, { width: cols[i].width, lineBreak: false });
        x += cols[i].width;
      }
      y += 12;
    }

    if (!paidRows.length) {
      doc.fontSize(10).text('Sin movimientos de ingreso en este periodo.', tableLeft, y);
    }

    doc.end();
  });
}

export function getWeeklyReportRecipients() {
  const raw = String(process.env.WEEKLY_REPORT_EMAIL_GDL || DEFAULT_RECIPIENT).trim();
  return raw.split(/[,;]+/).map((e) => e.trim()).filter(Boolean);
}

export async function runWeeklySalesReportGdl({ startDate, endDate } = {}) {
  const range = startDate && endDate ? { startDate, endDate } : getPreviousWeekRange();
  const { startDate: start, endDate: end } = range;

  const resendKey = getResendApiKey();
  if (!resendKey) {
    return { ok: false, error: 'missing_resend_api_key' };
  }

  const recipients = getWeeklyReportRecipients();
  if (!recipients.length) {
    return { ok: false, error: 'no_recipients' };
  }

  const { rows } = await loadGdlSalesData({ startDate: start, endDate: end });
  const summary = summarizeSalesRows(rows);
  const currency = currencyForClinic(CLINIC_OXYGENDGL);
  const meta = getClinicMeta(CLINIC_OXYGENDGL);
  const clinicLabel = `${meta.defaultName} · ${meta.regionLabel}`;

  const pdfBuffer = await buildPdfBuffer({
    clinicLabel,
    startDate: start,
    endDate: end,
    summary,
    rows,
    currency,
  });

  const filename = `ingresos_gdl_${start}_${end}.pdf`;
  const subject = `Reporte semanal de ingresos GDL (${start} — ${end})`;
  const html = `
    <p>Hola,</p>
    <p>Adjunto el reporte semanal de ingresos de <strong>${clinicLabel}</strong>.</p>
    <p><strong>Periodo:</strong> ${formatIsoDateDisplay(start)} — ${formatIsoDateDisplay(end)}</p>
    <p><strong>Ingresos totales:</strong> ${formatMoney(summary.total, currency)}</p>
    <ul>
      <li>Efectivo: ${formatMoney(summary.byMethod.cash || 0, currency)}</li>
      <li>Transferencia: ${formatMoney(summary.byMethod.transfer || 0, currency)}</li>
      <li>Tarjeta de crédito: ${formatMoney(summary.byMethod.credit || 0, currency)}</li>
      <li>Tarjeta de débito: ${formatMoney(summary.byMethod.debit || 0, currency)}</li>
    </ul>
    <p>El detalle completo está en el PDF adjunto.</p>
  `;

  const emailRes = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${resendKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: getResendFromAddress(CLINIC_OXYGENDGL),
      to: recipients,
      subject,
      html,
      attachments: [
        {
          filename,
          content: pdfBuffer.toString('base64'),
        },
      ],
    }),
  });

  if (!emailRes.ok) {
    const errText = await emailRes.text().catch(() => '');
    return {
      ok: false,
      error: errText.slice(0, 200),
      startDate: start,
      endDate: end,
      summary,
    };
  }

  return {
    ok: true,
    startDate: start,
    endDate: end,
    recipients,
    summary,
    txCount: summary.txCount,
    emailSent: true,
  };
}
