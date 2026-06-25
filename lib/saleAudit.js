export function formatSaleAuditDetail(tx, currency = 'MXN') {
  const ticket = tx.ticketNumber ?? tx.ticket_number ?? tx.id;
  const service = tx.serviceName || tx.equipment || '—';
  const sessions = tx.sessions ?? 0;
  const price = Number(tx.price) || 0;
  const method = tx.paymentMethod || '—';
  return `Ticket #${ticket} · ${service} · ${sessions} ses. · $${price} ${currency} · ${method}`;
}

export function formatSaleCancelAuditDetail(tx, currency = 'MXN') {
  return `CANCELACIÓN: ${formatSaleAuditDetail(tx, currency)}`;
}
