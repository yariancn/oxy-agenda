'use client';

import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { buildPosTicketHtml } from '../lib/posTicket';
import { printThermalHtml } from '../lib/printReceipt';

export default function PosReceiptModal({
  open,
  receipt,
  phone = '',
  companyConfig = {},
  activeClinic = 'Oxygengdl',
  locale = 'es',
  labels = {},
  onClose,
}) {
  const [printResult, setPrintResult] = useState(null);
  const [smsResult, setSmsResult] = useState(null);
  const [smsBusy, setSmsBusy] = useState(false);

  if (!open || !receipt || typeof document === 'undefined') return null;

  const currency = activeClinic === 'Shenandoah' ? 'USD' : 'MXN';
  const t = labels;

  const buildReceiptHtml = (tx) => buildPosTicketHtml({
    receipt: tx,
    companyConfig,
    clinicName: activeClinic,
    locale,
    labels: t,
    origin: window.location.origin,
  });

  const runPrint = async (tx) => {
    setPrintResult('printing');
    const result = await printThermalHtml(
      buildReceiptHtml(tx),
      locale === 'en' ? 'POS receipt' : 'Ticket POS',
    );
    setPrintResult(result.ok ? 'ok' : 'error');
    return result;
  };

  const runSms = async (tx) => {
    const toPhone = String(tx.phone || phone || '').trim();
    if (!toPhone) {
      alert(t.receiptNoPhone || 'Sin celular');
      return { ok: false };
    }
    setSmsBusy(true);
    setSmsResult('sending');
    try {
      const res = await fetch('/api/staff/pos-receipt-sms', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clinic: activeClinic,
          receipt: { ...tx, phone: toPhone },
          companyConfig,
          locale,
          labels: t,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setSmsResult('error');
        return { ok: false };
      }
      setSmsResult('ok');
      return { ok: true };
    } catch {
      setSmsResult('error');
      return { ok: false };
    } finally {
      setSmsBusy(false);
    }
  };

  const handleClose = () => {
    setPrintResult(null);
    setSmsResult(null);
    onClose?.();
  };

  return createPortal(
    <div
      className="fixed inset-0 bg-slate-900/85 flex items-end sm:items-center justify-center p-0 sm:p-4"
      style={{ zIndex: 100050 }}
      onClick={handleClose}
    >
      <div
        className="bg-slate-100 rounded-t-2xl sm:rounded-xl max-w-sm w-full p-4 max-h-[92dvh] overflow-y-auto shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="text-center text-xs font-black text-slate-800 mb-1 uppercase">
          {t.receiptGenerated || 'Ticket generado'}
        </p>
        <p className="text-center text-[10px] font-bold text-blue-800 mb-3 normal-case">
          {t.receiptChooseDelivery || 'Elige cómo entregar el ticket:'}
        </p>

        <div className="grid grid-cols-2 gap-2 mb-4">
          <button
            type="button"
            onClick={() => runPrint(receipt)}
            className="bg-slate-900 text-white font-black py-3.5 rounded-xl uppercase text-[10px] shadow-lg"
          >
            {t.printTicket || '🖨 Imprimir'}
          </button>
          <button
            type="button"
            disabled={smsBusy || !String(receipt.phone || phone || '').trim()}
            onClick={() => runSms(receipt)}
            className="bg-blue-600 text-white font-black py-3.5 rounded-xl uppercase text-[10px] shadow-lg disabled:opacity-50"
          >
            {t.receiptSendSms || '📱 SMS'}
          </button>
        </div>

        {printResult === 'printing' && (
          <p className="text-center text-[10px] font-black text-slate-500 mb-2 uppercase">{t.receiptPrinting}</p>
        )}
        {printResult === 'ok' && (
          <p className="text-center text-[10px] font-black text-emerald-700 mb-2 uppercase">{t.receiptPrintSent}</p>
        )}
        {printResult === 'error' && (
          <p className="text-center text-[10px] font-black text-red-700 mb-2 normal-case">{t.receiptPrintError}</p>
        )}
        {smsResult === 'sending' && (
          <p className="text-center text-[10px] font-black text-slate-500 mb-2 uppercase">{t.receiptSmsSending}</p>
        )}
        {smsResult === 'ok' && (
          <p className="text-center text-[10px] font-black text-emerald-700 mb-2 uppercase">{t.receiptSmsSent}</p>
        )}
        {smsResult === 'error' && (
          <p className="text-center text-[10px] font-black text-red-700 mb-2 normal-case">{t.receiptSmsError}</p>
        )}

        <div className="bg-white p-4 font-mono text-sm mb-3 uppercase overflow-x-auto rounded-lg border" dangerouslySetInnerHTML={{ __html: buildReceiptHtml(receipt) }} />
        <div className="text-center text-[10px] font-bold text-slate-500 mb-3 normal-case">
          {receipt.sessions} {t.sessionsShort || 'ses.'} · {t.receiptTotal || 'TOTAL'} ${Number(receipt.price || 0).toFixed(2)} {currency}
        </div>

        <button
          type="button"
          onClick={handleClose}
          className="w-full bg-emerald-600 text-white font-black py-3 rounded-xl uppercase text-xs"
        >
          {t.receiptPrintAccept || t.close || 'Continuar'}
        </button>
      </div>
    </div>,
    document.body,
  );
}
