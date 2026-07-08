'use client';

import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { buildPosTicketHtml } from '../lib/posTicket';
import { printThermalHtml } from '../lib/printReceipt';

const BUILD_SHA = (process.env.NEXT_PUBLIC_BUILD_SHA || 'dev').slice(0, 7);

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
  const [smsPhone, setSmsPhone] = useState('');

  useEffect(() => {
    if (!open || !receipt) return;
    setSmsPhone(String(receipt.phone || phone || '').trim());
    setPrintResult(null);
    setSmsResult(null);
  }, [open, receipt, phone]);

  if (!open || !receipt || typeof document === 'undefined') return null;

  const currency = activeClinic === 'Shenandoah' ? 'USD' : 'MXN';
  const t = labels;
  const hasSmsPhone = Boolean(String(smsPhone || '').trim());

  const buildReceiptHtml = (tx) => buildPosTicketHtml({
    receipt: { ...tx, phone: smsPhone || tx.phone },
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
    const toPhone = String(smsPhone || tx.phone || phone || '').trim();
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
        alert(t.receiptSmsError || 'No se pudo enviar el SMS.');
        return { ok: false };
      }
      setSmsResult('ok');
      return { ok: true };
    } catch {
      setSmsResult('error');
      alert(t.receiptSmsError || 'No se pudo enviar el SMS.');
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
      className="fixed inset-0 bg-slate-900/90 flex items-end sm:items-center justify-center p-0 sm:p-4"
      style={{ zIndex: 100050 }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="pos-receipt-title"
    >
      <div
        className="bg-slate-100 rounded-t-2xl sm:rounded-xl max-w-sm w-full p-4 max-h-[92dvh] overflow-y-auto shadow-2xl border-2 border-blue-500"
        onClick={(e) => e.stopPropagation()}
      >
        <p id="pos-receipt-title" className="text-center text-sm font-black text-slate-900 mb-1 uppercase">
          {t.receiptGenerated || 'Ticket generado'}
        </p>
        <p className="text-center text-[11px] font-bold text-blue-900 mb-3 normal-case leading-snug">
          {t.receiptChooseDelivery || 'Elige cómo entregar el ticket:'}
        </p>

        <div className="mb-4 rounded-xl border border-blue-200 bg-white p-3">
          <label className="block text-[9px] font-black uppercase text-slate-500 mb-1">
            {t.receiptSmsPhoneLabel || (locale === 'en' ? 'Mobile for SMS' : 'Celular para SMS')}
          </label>
          <p className="text-[9px] font-bold text-slate-500 mb-2 normal-case leading-snug">
            {t.receiptSmsPhoneEditable || (locale === 'en'
              ? 'Pre-filled from the chart. Edit if you want to send to another number.'
              : 'Se llena con el celular del expediente. Edítalo si quieres enviar a otro número.')}
          </p>
          <input
            type="tel"
            value={smsPhone}
            onChange={(e) => {
              setSmsPhone(e.target.value);
              setSmsResult(null);
            }}
            placeholder={t.receiptSmsPhonePlaceholder || (locale === 'en' ? '+1 713 555 1234' : '33 1234 5678')}
            className="w-full p-2.5 border-2 border-blue-300 rounded-lg text-sm font-bold text-slate-900"
          />
          {!hasSmsPhone && (
            <p className="text-[9px] font-bold text-amber-700 mt-2 normal-case leading-snug">
              {t.receiptSmsPhoneHint}
            </p>
          )}
        </div>

        <div className="flex flex-col gap-2.5 mb-4">
          <button
            type="button"
            onClick={() => runPrint(receipt)}
            className="w-full bg-slate-900 text-white font-black py-4 rounded-xl uppercase text-xs shadow-lg"
          >
            {t.printTicket || '🖨 Imprimir ticket'}
          </button>
          <button
            type="button"
            disabled={smsBusy}
            onClick={() => runSms(receipt)}
            className="w-full bg-blue-600 text-white font-black py-4 rounded-xl uppercase text-xs shadow-lg ring-2 ring-blue-300 disabled:opacity-60"
          >
            {t.receiptSendSms || '📱 Enviar por SMS'}
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
          {t.receiptPrintAccept || t.receiptSkipDelivery || t.close || 'Continuar sin enviar'}
        </button>
        <p className="text-center text-[8px] font-bold text-slate-400 mt-2 uppercase">v{BUILD_SHA}</p>
      </div>
    </div>,
    document.body,
  );
}
