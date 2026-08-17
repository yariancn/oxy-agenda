'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useStaffLocale } from './StaffLocaleContext';
import { isShenandoah } from '../lib/clinicRegistry';
import { printThermalHtml } from '../lib/printReceipt';
import {
  CASH_CUT_AUDIT_ACTION,
  CASH_CUT_AUDIT_ACTION_EN,
  buildCashCutRecord,
  buildCashCutTicketHtml,
  cashCutRowTimestampMs,
  collectCashSalesSinceCut,
  formatMethodBreakdown,
  isCashCutAuditRow,
  parseCashCutAuditDetails,
} from '../lib/cashCut';

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
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');
  const [doneCut, setDoneCut] = useState(null);

  const sinceMs = lastCut ? cashCutRowTimestampMs(lastCut) : 0;

  const summary = useMemo(
    () => collectCashSalesSinceCut({ patients, sessionGroups, sinceMs }),
    [patients, sessionGroups, sinceMs],
  );

  const breakdown = useMemo(
    () => formatMethodBreakdown(summary.byMethod, locale),
    [summary.byMethod, locale],
  );

  const counted = parseFloat(countedInput);
  const countedOk = Number.isFinite(counted);
  const difference = countedOk
    ? Math.round((counted - summary.expectedCash) * 100) / 100
    : null;

  useEffect(() => {
    if (!open) return undefined;
    let cancelled = false;
    setError('');
    setDoneCut(null);
    setCountedInput('');
    setNotes('');
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
          .limit(80);
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
  }, [open, activeSupabase, es]);

  useEffect(() => {
    if (!open || loading) return;
    setCountedInput(String(summary.expectedCash.toFixed(2)));
  }, [open, loading, summary.expectedCash]);

  if (!open) return null;

  const lastDetails = parseCashCutAuditDetails(lastCut?.details);
  const lastWhen = lastCut
    ? new Date(cashCutRowTimestampMs(lastCut) || Date.now()).toLocaleString(es ? 'es-MX' : 'en-US')
    : null;

  const handleConfirm = async () => {
    if (!countedOk) {
      setError(es ? 'Escribe el monto contado / retirado.' : 'Enter the counted / withdrawn amount.');
      return;
    }
    if (difference !== 0) {
      const ok = window.confirm(
        es
          ? `El efectivo contado ($${counted.toFixed(2)}) NO coincide con lo esperado ($${summary.expectedCash.toFixed(2)}). Diferencia: $${difference.toFixed(2)}. ¿Registrar el corte de todos modos?`
          : `Counted cash ($${counted.toFixed(2)}) does NOT match expected ($${summary.expectedCash.toFixed(2)}). Difference: $${difference.toFixed(2)}. Record the cut anyway?`,
      );
      if (!ok) return;
    } else {
      const ok = window.confirm(
        es
          ? `Confirmar corte: retirar $${counted.toFixed(2)} en efectivo (${summary.ticketCount} ticket(s)). ¿Continuar?`
          : `Confirm cash cut: withdraw $${counted.toFixed(2)} (${summary.ticketCount} ticket(s)). Continue?`,
      );
      if (!ok) return;
    }

    const cut = buildCashCutRecord({
      expectedCash: summary.expectedCash,
      countedCash: counted,
      sales: summary.sales,
      closedBy: currentUserName || '',
      clinic: activeClinic,
      locale,
      notes,
      sinceMs,
      previousCutAt: lastDetails?.closedAt || null,
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

      const html = buildCashCutTicketHtml({
        cut,
        companyConfig,
        clinicName: activeClinic,
        locale,
        currency,
      });
      await printThermalHtml(html, es ? 'Corte efectivo' : 'Cash cut');
    } catch (err) {
      setError(err?.message || (es ? 'No se pudo guardar el corte.' : 'Could not save cash cut.'));
    } finally {
      setSaving(false);
    }
  };

  const reprint = async () => {
    if (!doneCut) return;
    const html = buildCashCutTicketHtml({
      cut: doneCut,
      companyConfig,
      clinicName: activeClinic,
      locale,
      currency,
    });
    await printThermalHtml(html, es ? 'Corte efectivo' : 'Cash cut');
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
              ? 'Solo efectivo. Confirma que lo retirado coincide con lo ingresado desde el último corte.'
              : 'Cash only. Confirm withdrawn cash matches what came in since the last cut.'}
          </p>
        </div>

        <div className="p-4 sm:p-5 space-y-4 overflow-y-auto flex-1 min-h-0">
          {loading ? (
            <p className="text-sm font-bold text-slate-500 uppercase">{es ? 'Cargando…' : 'Loading…'}</p>
          ) : (
            <>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs font-bold uppercase text-slate-700 space-y-1">
                <p>
                  {es ? 'Último corte' : 'Last cut'}
                  :
                  {' '}
                  {lastWhen || (es ? 'Ninguno (todo el historial en efectivo)' : 'None (all cash history)')}
                </p>
                {lastDetails?.closedBy ? (
                  <p>{es ? 'Por' : 'By'}: {lastDetails.closedBy}</p>
                ) : null}
              </div>

              <div className="rounded-xl border-2 border-emerald-300 bg-emerald-50 p-4">
                <p className="text-[10px] font-black uppercase text-emerald-800 tracking-widest mb-1">
                  {es ? 'Efectivo esperado' : 'Expected cash'}
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
                    {es ? 'Otros métodos (referencia, no entran al corte)' : 'Other methods (reference only)'}
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

              <div>
                <label className="block text-[10px] font-black uppercase text-slate-600 mb-1">
                  {es ? 'Efectivo contado / retirado' : 'Counted / withdrawn cash'}
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={countedInput}
                  onChange={(e) => setCountedInput(e.target.value)}
                  className="w-full border-2 border-emerald-400 rounded-xl p-3 font-black text-lg text-emerald-950"
                />
                {difference != null && (
                  <p className={`mt-2 text-xs font-black uppercase ${difference === 0 ? 'text-emerald-700' : 'text-orange-700'}`}>
                    {difference === 0
                      ? (es ? '✓ Coincide con lo esperado' : '✓ Matches expected')
                      : (es ? `Diferencia: $${difference.toFixed(2)}` : `Difference: $${difference.toFixed(2)}`)}
                  </p>
                )}
              </div>

              <div>
                <label className="block text-[10px] font-black uppercase text-slate-600 mb-1">
                  {es ? 'Notas (opcional)' : 'Notes (optional)'}
                </label>
                <input
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg p-2 text-sm font-bold"
                />
              </div>

              {error ? (
                <p className="text-xs font-bold text-red-700 bg-red-50 border border-red-200 rounded-lg p-2">{error}</p>
              ) : null}

              {doneCut ? (
                <div className="rounded-xl border border-emerald-400 bg-emerald-50 p-3 space-y-2">
                  <p className="text-sm font-black uppercase text-emerald-900">
                    {es ? 'Corte guardado. Ticket enviado a imprimir.' : 'Cut saved. Print dialog opened.'}
                  </p>
                  <button
                    type="button"
                    onClick={reprint}
                    className="w-full bg-emerald-700 text-white font-black uppercase text-xs py-2.5 rounded-lg"
                  >
                    {es ? 'Reimprimir ticket de retiro' : 'Reprint withdrawal ticket'}
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
              disabled={loading || saving}
              onClick={handleConfirm}
              className="flex-[1.4] bg-emerald-700 text-white font-black uppercase text-xs py-3 rounded-xl disabled:opacity-50"
            >
              {saving
                ? (es ? 'Guardando…' : 'Saving…')
                : (es ? 'Confirmar corte e imprimir' : 'Confirm cut & print')}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
