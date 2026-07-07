import { formatClinicField, formatClinicPhone } from './clinicText.js';
import { getLegalLinks } from './legalLinks.js';
import { getClinicDefaultName, isShenandoah, normalizeClinicId } from './clinicRegistry.js';

export const CLINIC_LOGO_PATH = '/1c3300f3-f5e7-4682-b627-257e868ed467.jpg';

const LEGAL_FOOTER = {
  gdl: {
    es: 'Este comprobante no sustituye el CFDI cuando la ley lo exija. Consulte nuestro aviso de privacidad y términos en los enlaces indicados. Servicios de oxigenación hiperbárica bajo supervisión del personal autorizado.',
    en: 'This receipt does not replace a CFDI when required by law. See our privacy notice and terms at the links below. Hyperbaric oxygen services under authorized staff supervision.',
  },
  Shenandoah: {
    es: 'Este recibo no constituye factura fiscal. Los servicios están sujetos a los términos y condiciones publicados. REGENOXY LLC — oxigenación hiperbárica bajo supervisión del personal autorizado.',
    en: 'This receipt is not a tax invoice. Services are subject to published terms and conditions. REGENOXY LLC — hyperbaric oxygen under authorized staff supervision.',
  },
};

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function money(amount, currency = 'MXN') {
  const n = Number(amount) || 0;
  const symbol = currency === 'USD' ? '$' : '$';
  return `${symbol}${n.toFixed(2)} ${currency}`;
}

export function buildPosTicketHtml({
  receipt,
  companyConfig = {},
  clinicName = 'Oxygengdl',
  locale = 'es',
  labels = {},
  logoUrl = CLINIC_LOGO_PATH,
  origin = '',
}) {
  const clinicId = normalizeClinicId(clinicName);
  const currency = isShenandoah(clinicId) ? 'USD' : 'MXN';
  const legal = (isShenandoah(clinicId) ? LEGAL_FOOTER.Shenandoah : LEGAL_FOOTER.gdl)[locale === 'en' ? 'en' : 'es'];
  const links = getLegalLinks(clinicId);
  const clinicDisplay = formatClinicField(companyConfig.name) || getClinicDefaultName(clinicId);
  const address = formatClinicField(companyConfig.address);
  const phone = formatClinicPhone(companyConfig.phone);
  const thanks = formatClinicField(companyConfig.ticket_message) || labels.receiptThanks || '';
  const sessions = Number(receipt.sessions) || 1;
  const total = Number(receipt.price) || 0;
  const unitPrice = receipt.unitPrice != null
    ? Number(receipt.unitPrice)
    : (sessions > 0 ? total / sessions : total);
  const subtotal = unitPrice * sessions;
  const ticketNo = receipt.ticketNumber ?? receipt.ticket_number ?? receipt.id;
  const logoSrc = logoUrl.startsWith('http') ? logoUrl : `${String(origin || '').replace(/\/$/, '')}${logoUrl}`;
  const privacyLabel = locale === 'en' ? 'Privacy' : 'Privacidad';
  const termsLabel = locale === 'en' ? 'Terms' : 'Términos';

  const patientLines = [
    receipt.patient && `<p><strong>${labels.receiptClient || 'Cliente:'}</strong> ${escapeHtml(String(receipt.patient).toUpperCase())}</p>`,
    receipt.phone && `<p>${labels.receiptPhone || 'Tel:'} ${escapeHtml(receipt.phone)}</p>`,
    receipt.email && `<p>${labels.receiptEmail || 'Email:'} ${escapeHtml(receipt.email)}</p>`,
    receipt.dob && `<p>${labels.receiptDob || 'Nac.:'} ${escapeHtml(receipt.dob)}</p>`,
    receipt.protocol && `<p>${labels.receiptProtocol || 'Protocolo:'} ${escapeHtml(receipt.protocol)}</p>`,
  ].filter(Boolean).join('');

  const notesBlock = receipt.ticketNotes
    ? `<div style="margin-top:8px;border-top:1px dashed #999;padding-top:6px;">
        <p style="margin:0 0 4px;font-weight:bold;">${labels.receiptNotes || 'NOTAS:'}</p>
        <p style="margin:0;white-space:pre-wrap;font-size:10px;">${escapeHtml(receipt.ticketNotes)}</p>
      </div>`
    : `<div style="margin-top:8px;border-top:1px dashed #999;padding-top:6px;min-height:36px;">
        <p style="margin:0 0 4px;font-weight:bold;">${labels.receiptNotes || 'NOTAS:'}</p>
        <p style="margin:0;font-size:10px;color:#888;">&nbsp;</p>
      </div>`;

  return `
    <div style="width:52mm;max-width:52mm;font-family:monospace;font-size:10px;text-transform:uppercase;color:#000;">
      <div style="text-align:center;margin-bottom:8px;">
        <img src="${escapeHtml(logoSrc)}" alt="" style="max-width:42mm;max-height:18mm;object-fit:contain;margin:0 auto 6px;display:block;" />
        <h2 style="font-size:14px;margin:0 0 4px;line-height:1.2;">${escapeHtml(clinicDisplay)}</h2>
        ${address ? `<p style="margin:0 0 2px;font-size:9px;line-height:1.3;">${escapeHtml(address)}</p>` : ''}
        ${phone ? `<p style="margin:0 0 4px;font-size:9px;">Tel: ${escapeHtml(phone)}</p>` : ''}
      </div>
      <p style="margin:0 0 2px;">${labels.receiptTicket || 'Ticket:'} #${escapeHtml(String(ticketNo))}</p>
      <p style="margin:0 0 6px;">${labels.receiptDate || 'Fecha:'} ${escapeHtml(receipt.date || '')}</p>
      ${patientLines}
      <div style="margin:8px 0;border-top:1px solid #000;border-bottom:1px solid #000;padding:6px 0;">
        <p style="margin:0 0 4px;">${escapeHtml(String(receipt.serviceName || '').toUpperCase())}</p>
        <p style="margin:0;">${labels.receiptSessions || 'Sesiones:'} ${sessions} × ${money(unitPrice, currency)}</p>
        <p style="margin:4px 0 0;">${labels.receiptSubtotal || 'SUBTOTAL:'} ${money(subtotal, currency)}</p>
        <p style="margin:4px 0 0;font-weight:bold;">${labels.receiptTotal || 'TOTAL:'} ${money(total, currency)}</p>
      </div>
      <p style="margin:0;">${labels.receiptPaidWith || 'PAGADO CON:'} ${escapeHtml(receipt.paymentMethod || '')}</p>
      <p style="margin:0 0 6px;">${labels.receiptServedBy || 'Le atendió:'} ${escapeHtml(receipt.operator || '')}</p>
      ${notesBlock}
      ${thanks ? `<p style="text-align:center;font-style:italic;margin-top:8px;font-size:10px;">${escapeHtml(thanks)}</p>` : ''}
      <p style="font-size:8px;line-height:1.35;margin-top:8px;text-transform:none;">${escapeHtml(legal)}</p>
      <p style="font-size:8px;margin-top:4px;text-transform:none;">
        ${links.privacy ? `<span>${privacyLabel}: ${escapeHtml(links.privacy)}</span>` : ''}
        ${links.terms ? `<br/><span>${termsLabel}: ${escapeHtml(links.terms)}</span>` : ''}
      </p>
    </div>`;
}

/** Texto corto para SMS del ticket POS (sin HTML). */
export function buildPosTicketSmsText({
  receipt,
  companyConfig = {},
  clinicName = 'Oxygengdl',
  locale = 'es',
  labels = {},
}) {
  const clinicId = normalizeClinicId(clinicName);
  const currency = isShenandoah(clinicId) ? 'USD' : 'MXN';
  const clinicDisplay = formatClinicField(companyConfig.name) || getClinicDefaultName(clinicId);
  const thanks = formatClinicField(companyConfig.ticket_message) || labels.receiptThanks || '';
  const sessions = Number(receipt.sessions) || 1;
  const total = Number(receipt.price) || 0;
  const unitPrice = receipt.unitPrice != null
    ? Number(receipt.unitPrice)
    : (sessions > 0 ? total / sessions : total);
  const ticketNo = receipt.ticketNumber ?? receipt.ticket_number ?? receipt.id;
  const es = locale !== 'en';

  const lines = [
    clinicDisplay,
    `${labels.receiptTicket || (es ? 'Ticket' : 'Receipt')}: #${ticketNo}`,
    `${labels.receiptDate || (es ? 'Fecha' : 'Date')}: ${receipt.date || ''}`,
    receipt.patient ? `${labels.receiptClient || (es ? 'Cliente' : 'Client')}: ${String(receipt.patient).toUpperCase()}` : '',
    `${receipt.serviceName || ''} · ${sessions} ${labels.receiptSessions || (es ? 'ses.' : 'sess.')} × ${money(unitPrice, currency)}`,
    `${labels.receiptTotal || 'TOTAL'}: ${money(total, currency)}`,
    `${labels.receiptPaidWith || (es ? 'Pago' : 'Paid')}: ${receipt.paymentMethod || ''}`,
    thanks,
    formatClinicPhone(companyConfig.phone) ? `Tel: ${formatClinicPhone(companyConfig.phone)}` : '',
  ].filter(Boolean);

  return lines.join('\n').slice(0, 480);
}
