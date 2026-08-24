'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useStaffLocale } from './StaffLocaleContext';
import { isShenandoah } from '../lib/clinicRegistry';
import { printThermalHtml } from '../lib/printReceipt';
import {
  CASH_CUT_AUDIT_ACTION,
  CASH_CUT_AUDIT_ACTION_EN,
  buildCashCutRecord,
  buildCashCutDualCopyHtml,
  cashCutRowTimestampMs,
  collectCashSalesSinceCut,
  formatMethodBreakdown,
  isCashCutAuditRow,
  parseCashCutAuditDetails,
} from '../lib/cashCut';

function formatLocal(msOrIso, locale) {
  if (!msOrIso) return '';
  const t = typeof msOrIso === 'number' ? msOrIso : Date.parse(msOrIso);
  if (!Number.isFinite(t) || Number.isNaN(t)) return '';
  return new Date(t).toLocaleString(locale === 'en' ? 'en-US' : 'es-MX');
}

export default function CashCutModal({
  open,
  onClose,
  patients = [],
  sessionGroups = [],
  companyConfig = {},
  activeClinic = '',
  currentUserName = '',
  activeSupabase = null,
  onLogged,
}) {
  const { locale } = useStaffLocale();
  const es = locale !== 'en';
  const currency = isShenandoah(activeClinic) ? 'USD' : 'MXN';

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [lastCut, setLastCut] = useState(null);
  const [countedInput, setCountedInput] = useState('');
  const [deliveredBy, setDeliveredBy] = useState('');
  const [receivedBy, setReceivedBy] = useState('');
  const [notes, setNotes] = useState('');
  const [amountConfirmed, setAmountConfirmed] = useState(false);
  const [error, setError] = useState('');
  const [doneCut, setDoneCut] = useState(null);
  const [nowMs, setNowMs] = useState(() => Date.now());

  const sinceMs = lastCut ? cashCutRowTimestampMs(lastCut) : 0;
  const periodFromLabel = sinceMs > 0
    ? formatLocal(sinceMs, locale)
    : (es ? 'Sin corte previo (todo el efectivo registrado)' : 'No prior cut (all recorded cash)');
  const periodToLabel = formatLocal(nowMs, locale);

  const summary = useMemo(
    () => collectCashSalesSinceCut({ patients, sessionGroups, sinceMs }),
    [patients, sessionGroups, sinceMs],
  );

  const breakdown = useMemo(
    () => formatMethodBreakdown(summary.byMethod, locale),
    [summary.byMethod, locale],
  );

  const counted = parseFloat(countedInput);
  const countedOk = Number.isFinite(counted) && String(countedInput).trim() !== '';
  const difference = countedOk
    ? Math.round((counted - summary.expectedCash) * 100) / 100
    : null;
  const mismatch = countedOk && difference !== 0;
  const notesTrimmed = String(notes || '').trim();
  const deliveredTrimmed = String(deliveredBy || '').trim();
  const receivedTrimmed = String(receivedBy || '').trim();
  const namesOk = deliveredTrimmed.length >= 2 && receivedTrimmed.length >= 2;
  const notesOk = !mismatch || notesTrimmed.length >= 3;
  const canConfirm = !loading && !saving && countedOk && amountConfirmed && notesOk && namesOk;

  useEffect(() => {
    if (!open) return undefined;
    let cancelled = false;
    setError('');
    setDoneCut(null);
    setCountedInput('');
    setDeliveredBy(String(currentUserName || '').trim());
    setReceivedBy('');
    setNotes('');
    setAmountConfirmed(false);
    setNowMs(Date.now());
    setLoading(true);

    (async () => {
      try {
        if (!activeSupabase) {
          if (!cancelled) setLastCut(null);
          return;
        }
        const { data, error: qErr } = await activeSupabase
          .from('audit_logs')
          .select('*')
          .order('timestamp', { ascending: false })
          .limit(120);
        if (qErr) throw qErr;
        const cut = (data || []).find(isCashCutAuditRow) || null;
        if (!cancelled) setLastCut(cut);
      } catch (err) {
        if (!cancelled) {
          setLastCut(null);
          setError(err?.message || (es ? 'No se pudo cargar el último corte.' : 'Could not load last cut.'));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [open, activeSupabase, es, currentUserName]);

  if (!open) return null;

  const lastDetails = parseCashCutAuditDetails(lastCut?.details);

  const handleConfirm = async () => {
    setNowMs(Date.now());
    if (!countedOk) {
      setError(es ? 'Escribe el monto que se está retirando.' : 'Enter the amount being withdrawn.');
      return;
    }
    if (!amountConfirmed) {
      setError(es
        ? 'Marca la casilla confirmando el monto a retirar.'
        : 'Check the box confirming the withdrawal amount.');
      return;
    }
    if (mismatch && notesTrimmed.length < 3) {
      setError(es
        ? 'Si no coincide, la nota es obligatoria (explica la diferencia).'
        : 'If amounts do not match, a note is required (explain the difference).');
      return;
    }
    if (!namesOk) {
      setError(es
        ? 'Indica quién entrega y quién recibe el efectivo (nombre completo).'
        : 'Enter who delivers and who receives the cash (full name).');
      return;
    }

    const closedAtIso = new Date().toISOString();
    const cut = buildCashCutRecord({
      expectedCash: summary.expectedCash,
      countedCash: counted,
      sales: summary.sales,
      closedBy: deliveredTrimmed,
      deliveredBy: deliveredTrimmed,
      receivedBy: receivedTrimmed,
      clinic: activeClinic,
      locale,
      notes: notesTrimmed,
      sinceMs,
      previousCutAt: lastDetails?.closedAt || (sinceMs > 0 ? new Date(sinceMs).toISOString() : null),
      periodFrom: sinceMs > 0 ? new Date(sinceMs).toISOString() : null,
      periodTo: closedAtIso,
    });

    setSaving(true);
    setError('');
    try {
      if (activeSupabase) {
        const { error: insErr } = await activeSupabase.from('audit_logs').insert([{
          appointment_id: null,
          patient_name: es ? 'CAJA / EFECTIVO' : 'CASH DRAWER',
          action: es ? CASH_CUT_AUDIT_ACTION : CASH_CUT_AUDIT_ACTION_EN,
          changed_by: currentUserName || 'staff',
          details: JSON.stringify(cut),
        }]);
        if (insErr) throw insErr;
      }
      onLogged?.(cut);
      setDoneCut(cut);
      setLastCut({
        action: CASH_CUT_AUDIT_ACTION,
        details: cut,
        timestamp: cut.closedAt,
        changed_by: currentUserName,
      });

      const html = buildCashCutDualCopyHtml({
        cut,
        companyConfig,
        clinicName: activeClinic,
        locale,
        currency,
      });
      await printThermalHtml(html, es ? 'Corte efectivo (2 copias)' : 'Cash cut (2 copies)');
    } catch (err) {
      setError(err?.message || (es ? 'No se pudo guardar el corte.' : 'Could not save cash cut.'));
    } finally {
      setSaving(false);
    }
  };

  const reprint = async () => {
    if (!doneCut) return;
    const html = buildCashCutDualCopyHtml({
      cut: doneCut,
      companyConfig,
      clinicName: activeClinic,
      locale,
      currency,
    });
    await printThermalHtml(html, es ? 'Corte efectivo (2 copias)' : 'Cash cut (2 copies)');
  };

  return (
    <div className="fixed inset-0 z-[160] bg-slate-900/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl w-full max-w-lg max-h-[92dvh] overflow-hidden flex flex-col">
        <div className="bg-emerald-800 text-white p-4 sm:p-5 shrink-0">
          <h2 className="text-lg font-black uppercase tracking-widest">
            {es ? 'Corte de efectivo' : 'Cash cut'}
          </h2>
          <p className="text-emerald-100 text-xs mt-1 font-medium">
            {es
              ? 'Solo efectivo. El periodo va desde el último corte hasta este momento.'
              : 'Cash only. The period runs from the last cut until right now.'}
          </p>
        </div>

        <div className="p-4 sm:p-5 space-y-4 overflow-y-auto flex-1 min-h-0">
          {loading ? (
            <p className="text-sm font-bold text-slate-500 uppercase">{es ? 'Cargando…' : 'Loading…'}</p>
          ) : (
            <>
              <div className="rounded-xl border-2 border-slate-300 bg-slate-50 p-3 text-xs font-bold uppercase text-slate-800 space-y-2">
                <p className="text-[10px] font-black tracking-widest text-slate-500">
                  {es ? 'Periodo de este corte' : 'Period for this cut'}
                </p>
                <p>
                  <span className="text-slate-500">{es ? 'Desde' : 'From'}:</span>
                  {' '}
                  {periodFromLabel}
                </p>
                <p>
                  <span className="text-slate-500">{es ? 'Hasta' : 'To'}:</span>
                  {' '}
                  {periodToLabel}
                </p>
                {lastDetails?.deliveredBy || lastDetails?.closedBy ? (
                  <p className="text-[10px] text-slate-500 normal-case">
                    {es ? 'Último corte — entrega' : 'Last cut — delivered by'}
                    :
                    {' '}
                    {lastDetails.deliveredBy || lastDetails.closedBy}
                    {lastDetails.receivedBy ? (
                      <>
                        {' · '}
                        {es ? 'recibe' : 'received by'}
                        {' '}
                        {lastDetails.receivedBy}
                      </>
                    ) : null}
                  </p>
                ) : null}
              </div>

              <div className="rounded-xl border-2 border-emerald-300 bg-emerald-50 p-4">
                <p className="text-[10px] font-black uppercase text-emerald-800 tracking-widest mb-1">
                  {es ? 'Efectivo esperado en el periodo' : 'Expected cash in period'}
                </p>
                <p className="text-3xl font-black text-emerald-950">
                  ${summary.expectedCash.toFixed(2)}
                  {' '}
                  <span className="text-sm">{currency}</span>
                </p>
                <p className="text-[11px] font-bold uppercase text-emerald-900 mt-2">
                  {summary.ticketCount}
                  {' '}
                  {es ? 'ticket(s) en efectivo' : 'cash ticket(s)'}
                </p>
              </div>

              {breakdown.length > 0 && (
                <div className="rounded-xl border border-slate-200 p-3">
                  <p className="text-[10px] font-black uppercase text-slate-500 mb-2">
                    {es ? 'Otros métodos en el periodo (referencia)' : 'Other methods in period (reference)'}
                  </p>
                  <ul className="space-y-1 text-xs font-bold text-slate-700">
                    {breakdown.map((row) => (
                      <li key={row.key} className="flex justify-between gap-2">
                        <span>{row.label}</span>
                        <span>${row.amount.toFixed(2)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {summary.sales.length > 0 && (
                <div className="rounded-xl border border-slate-200 max-h-40 overflow-y-auto">
                  <p className="sticky top-0 bg-slate-100 px-3 py-2 text-[10px] font-black uppercase text-slate-500">
                    {es ? 'Tickets incluidos' : 'Included tickets'}
                  </p>
                  <ul className="divide-y divide-slate-100">
                    {summary.sales.map((tx) => (
                      <li key={String(tx.id)} className="px-3 py-2 text-[11px] font-bold text-slate-800 flex justify-between gap-2">
                        <span className="truncate">
                          #{tx.ticketNumber || String(tx.id).slice(-6)}
                          {' '}
                          {tx.patientName || tx.patient || ''}
                        </span>
                        <span className="shrink-0">${(Number(tx.price) || 0).toFixed(2)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-black uppercase text-slate-600 mb-1">
                    {es ? 'Quién entrega el efectivo' : 'Who delivers the cash'}
                  </label>
                  <input
                    type="text"
                    value={deliveredBy}
                    onChange={(e) => setDeliveredBy(e.target.value)}
                    className="w-full border-2 border-slate-300 rounded-lg p-2.5 text-sm font-bold text-slate-900"
                    placeholder={es ? 'Nombre de quien entrega' : 'Deliverer name'}
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-black uppercase text-slate-600 mb-1">
                    {es ? 'Quién recibe el efectivo' : 'Who receives the cash'}
                  </label>
                  <input
                    type="text"
                    value={receivedBy}
                    onChange={(e) => setReceivedBy(e.target.value)}
                    className={`w-full border-2 rounded-lg p-2.5 text-sm font-bold text-slate-900 ${receivedTrimmed.length >= 2 ? 'border-slate-300' : 'border-amber-400 bg-amber-50'}`}
                    placeholder={es ? 'Nombre de quien recibe' : 'Receiver name'}
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-black uppercase text-slate-600 mb-1">
                  {es ? 'Monto a retirar (escribe el valor contado)' : 'Amount to withdraw (enter counted value)'}
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={countedInput}
                  onChange={(e) => {
                    setCountedInput(e.target.value);
                    setAmountConfirmed(false);
                  }}
                  placeholder="0.00"
                  className="w-full border-2 border-emerald-400 rounded-xl p-3 font-black text-lg text-emerald-950"
                />
                {difference != null && (
                  <p className={`mt-2 text-xs font-black uppercase ${difference === 0 ? 'text-emerald-700' : 'text-orange-700'}`}>
                    {difference === 0
                      ? (es ? '✓ Coincide con lo esperado' : '✓ Matches expected')
                      : (es ? `No coincide · diferencia $${difference.toFixed(2)}` : `Mismatch · difference $${difference.toFixed(2)}`)}
                  </p>
                )}
              </div>

              <label className={`flex items-start gap-3 rounded-xl border-2 p-3 cursor-pointer ${amountConfirmed ? 'border-emerald-500 bg-emerald-50' : 'border-amber-300 bg-amber-50'}`}>
                <input
                  type="checkbox"
                  checked={amountConfirmed}
                  disabled={!countedOk}
                  onChange={(e) => setAmountConfirmed(e.target.checked)}
                  className="mt-0.5 w-5 h-5 shrink-0"
                />
                <span className="text-xs font-black uppercase text-slate-800 leading-snug">
                  {countedOk
                    ? (es
                      ? `Confirmo que se retiran $${counted.toFixed(2)} ${currency}`
                      : `I confirm withdrawing $${counted.toFixed(2)} ${currency}`)
                    : (es
                      ? 'Primero escribe el monto a retirar'
                      : 'Enter the withdrawal amount first')}
                </span>
              </label>

              <div>
                <label className="block text-[10px] font-black uppercase text-slate-600 mb-1">
                  {mismatch
                    ? (es ? 'Nota (obligatoria: explica la diferencia)' : 'Note (required: explain the difference)')
                    : (es ? 'Notas (opcional)' : 'Notes (optional)')}
                </label>
                <input
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className={`w-full border-2 rounded-lg p-2 text-sm font-bold ${mismatch && !notesOk ? 'border-orange-400 bg-orange-50' : 'border-slate-300'}`}
                  placeholder={mismatch
                    ? (es ? 'Ej. faltante por cambio, sobrante, error de ticket…' : 'E.g. short change, overage, ticket error…')
                    : ''}
                />
              </div>

              {error ? (
                <p className="text-xs font-bold text-red-700 bg-red-50 border border-red-200 rounded-lg p-2">{error}</p>
              ) : null}

              {doneCut ? (
                <div className="rounded-xl border border-emerald-400 bg-emerald-50 p-3 space-y-2">
                  <p className="text-sm font-black uppercase text-emerald-900">
                    {es
                      ? 'Corte guardado. Se imprimen 2 copias (entrega y recibe).'
                      : 'Cut saved. Printing 2 copies (deliverer and receiver).'}
                  </p>
                  <button
                    type="button"
                    onClick={reprint}
                    className="w-full bg-emerald-700 text-white font-black uppercase text-xs py-2.5 rounded-lg"
                  >
                    {es ? 'Reimprimir 2 copias' : 'Reprint 2 copies'}
                  </button>
                </div>
              ) : null}
            </>
          )}
        </div>

        <div className="p-4 border-t border-slate-200 flex gap-2 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 bg-slate-100 text-slate-700 font-black uppercase text-xs py-3 rounded-xl"
          >
            {es ? 'Cerrar' : 'Close'}
          </button>
          {!doneCut ? (
            <button
              type="button"
              disabled={!canConfirm}
              onClick={handleConfirm}
              className="flex-[1.4] bg-emerald-700 text-white font-black uppercase text-xs py-3 rounded-xl disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {saving
                ? (es ? 'Guardando…' : 'Saving…')
                : (es ? 'Confirmar corte e imprimir (2 copias)' : 'Confirm cut & print (2 copies)')}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
