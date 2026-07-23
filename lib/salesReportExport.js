/**
 * Flatten package_history sales into CSV-ready rows with one field per column.
 */

function pad2(n) {
  return String(n).padStart(2, '0');
}

/** Best-effort YYYY-MM-DD for filtering / Excel sorting. */
export function saleTxIsoDate(tx = {}) {
  const created = String(tx.createdAt || tx.created_at || '').trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(created)) return created.slice(0, 10);

  const idNum = Number(tx.id);
  if (Number.isFinite(idNum) && idNum > 1e11) {
    const d = new Date(idNum);
    if (!Number.isNaN(d.getTime())) {
      return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
    }
  }

  const raw = String(tx.date || '').trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);

  const parsed = Date.parse(raw);
  if (!Number.isNaN(parsed)) {
    const d = new Date(parsed);
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  }

  return '';
}

function yesNo(value, locale = 'es') {
  const on = value === true || value === 'true' || value === 1 || value === '1';
  if (locale === 'en') return on ? 'Yes' : 'No';
  return on ? 'Sí' : 'No';
}

function moneyCell(value) {
  if (value == null || value === '') return '';
  const n = Number(value);
  if (!Number.isFinite(n)) return String(value);
  return String(n);
}

export function salesReportHeaders(locale = 'es') {
  if (locale === 'en') {
    return [
      'Ticket',
      'Date (display)',
      'Date (ISO)',
      'Patient name',
      'Phone',
      'Email',
      'Protocol',
      'Package / service',
      'Equipment / wallet key',
      'Sessions purchased',
      'Unit price',
      'Amount paid',
      'Currency',
      'Payment method',
      'Partial payment',
      'Package total sessions',
      'Balance due',
      'Sessions added to wallet',
      'Debt sessions cleared',
      'Operator',
      'Ticket notes',
      'Shared wallet / group',
      'Patient ID',
      'Sale ID',
    ];
  }
  return [
    'Ticket',
    'Fecha (pantalla)',
    'Fecha (ISO)',
    'Nombre paciente',
    'Teléfono',
    'Correo',
    'Protocolo',
    'Paquete / servicio',
    'Equipo / clave cartera',
    'Sesiones compradas',
    'Precio unitario',
    'Cantidad pagada',
    'Moneda',
    'Tipo de pago',
    'Pago parcial',
    'Sesiones totales del paquete',
    'Saldo pendiente',
    'Sesiones a cartera',
    'Adeudo liquidado (sesiones)',
    'Operador',
    'Notas del ticket',
    'Cartera compartida / grupo',
    'ID paciente',
    'ID venta',
  ];
}

export function saleTxToReportRow(tx = {}, { currency = '', locale = 'es' } = {}) {
  const ticket = tx.ticketNumber || tx.ticket_number || String(tx.id || '').slice(-6);
  const patientName = tx.patientName || tx.patient || '';
  return [
    ticket,
    tx.date || '',
    saleTxIsoDate(tx),
    patientName,
    tx.phone || '',
    tx.email || '',
    tx.protocol || '',
    tx.serviceName || tx.description || '',
    tx.equipment || '',
    tx.sessions ?? '',
    moneyCell(tx.unitPrice),
    moneyCell(tx.price),
    currency,
    tx.paymentMethod || '',
    yesNo(tx.partialPayment, locale),
    tx.packageTotalSessions ?? '',
    moneyCell(tx.balanceDue),
    tx.addedToWallet ?? '',
    tx.debtCleared ?? '',
    tx.operator || '',
    tx.ticketNotes || '',
    tx.groupName || '',
    tx.patientId || '',
    tx.id || '',
  ];
}

/**
 * Collect sales from patient charts and shared session groups (deduped by sale id).
 */
export function collectSalesReportRows({
  patients = [],
  sessionGroups = [],
  startDate = '',
  endDate = '',
} = {}) {
  const start = startDate <= endDate ? startDate : endDate;
  const end = startDate <= endDate ? endDate : startDate;
  const byId = new Map();

  for (const p of patients || []) {
    for (const tx of p.packageHistory || []) {
      const key = String(tx.id || `${p.id}-${tx.ticketNumber || tx.date}-${tx.price}`);
      byId.set(key, {
        ...tx,
        patientId: p.id,
        patientName: p.patient || tx.patient || '',
        phone: tx.phone || p.phone || '',
        email: tx.email || p.email || '',
        protocol: tx.protocol || p.protocol || '',
        groupName: '',
      });
    }
  }

  for (const g of sessionGroups || []) {
    for (const tx of g.packageHistory || []) {
      const key = String(tx.id || `group-${g.id}-${tx.ticketNumber || tx.date}-${tx.price}`);
      if (byId.has(key)) {
        const existing = byId.get(key);
        byId.set(key, {
          ...existing,
          groupName: g.name || existing.groupName || '',
        });
        continue;
      }
      byId.set(key, {
        ...tx,
        patientId: tx.patientId || g.titular_patient_id || '',
        patientName: tx.patientName || tx.patient || g.name || '',
        phone: tx.phone || '',
        email: tx.email || '',
        protocol: tx.protocol || '',
        groupName: g.name || '',
      });
    }
  }

  const rows = [...byId.values()].filter((tx) => {
    if (!start || !end) return true;
    const iso = saleTxIsoDate(tx);
    if (!iso) return true;
    return iso >= start && iso <= end;
  });

  rows.sort((a, b) => {
    const isoA = saleTxIsoDate(a);
    const isoB = saleTxIsoDate(b);
    if (isoA && isoB && isoA !== isoB) return isoB.localeCompare(isoA);
    return (Number(b.id) || 0) - (Number(a.id) || 0);
  });

  return { start, end, rows };
}

export function buildSalesReportCsv({
  patients = [],
  sessionGroups = [],
  startDate = '',
  endDate = '',
  currency = '',
  locale = 'es',
  clinicSlug = 'clinic',
} = {}) {
  const { start, end, rows } = collectSalesReportRows({
    patients,
    sessionGroups,
    startDate,
    endDate,
  });
  return {
    start,
    end,
    rows,
    filename: `ventas_${clinicSlug}_${start || 'todo'}_${end || 'todo'}.csv`,
    headers: salesReportHeaders(locale),
    csvRows: rows.map((tx) => saleTxToReportRow(tx, { currency, locale })),
  };
}
