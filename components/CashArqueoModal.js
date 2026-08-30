'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useStaffLocale } from './StaffLocaleContext';
import { isShenandoah } from '../lib/clinicRegistry';
import { printThermalHtml } from '../lib/printReceipt';
import {
  buildArqueoTicketHtml,
  buildCashDrawerEventPayload,
  CASH_DRAWER_EVENT_ARQUEO,
} from '../lib/pettyCash';
import { loadCashDrawerPeriod } from '../lib/cashDrawerPeriod';
import { collectCashSalesSinceCut } from '../lib/cashCut';

function formatLocal(msOrIso, locale) {
  if (!msOrIso) return '';
  const t = typeof msOrIso === 'number' ? msOrIso : Date.parse(msOrIso);
  if (!Number.isFinite(t) || Number.isNaN(t)) return '';
  return new Date(t).toLocaleString(locale === 'en' ? 'en-US' : 'es-MX');
}

export default function CashArqueoModal({
  open,
  onClose,
  patients = [],
  sessionGroups = [],
  companyConfig = {},
  activeClinic = '',
  currentUserName = '',
  activeSupabase = null,
}) {
  const { locale } = useStaffLocale();
  const es = locale !== 'en';
  const currency = isShenandoah(activeClinic) ? 'USD' : 'MXN';

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [sinceMs, setSinceMs] = useState(0);
  const [expenses, setExpenses] = useState([]);
  const [countedInput, setCountedInput] = useState('');
  const [notes, setNotes] = useState('');
  const [amountConfirmed, setAmountConfirmed] = useState(false);
  const [error, setError] = useState('');
  const [doneEvent, setDoneEvent] = useState(null);
  const [tableMissing, setTableMissing] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());

  const summary = useMemo(
    () => collectCashSalesSinceCut({
      patients,
      sessionGroups,
      sinceMs,
      expenses,
      clinic: activeClinic,
    }),
    [patients, sessionGroups, sinceMs, expenses, activeClinic],
  );

  const counted = parseFloat(countedInput);
  const countedOk = Number.isFinite(counted) && String(countedInput).trim() !== '';
  const difference = countedOk
    ? Math.round((counted - summary.expectedInDrawer) * 100) / 100
    : null;
  const mismatch = countedOk && difference !== 0;
  const notesTrimmed = String(notes || '').trim();
  const notesOk = !mismatch || notesTrimmed.length >= 3;
  const canConfirm = !loading && !saving && countedOk && amountConfirmed && notesOk && !tableMissing;

  useEffect(() => {
    if (!open) return undefined;
    let cancelled = false;
    setError('');
    setDoneEvent(null);
    setCountedInput('');
    setNotes('');
    setAmountConfirmed(false);
    setNowMs(Date.now());
    setLoading(true);

    (async () => {
      try {
        if (!activeSupabase) {
          if (!cancelled) {
            setSinceMs(0);
            setExpenses([]);
          }
          return;
        }
        const loaded = await loadCashDrawerPeriod(activeSupabase, activeClinic);
        if (cancelled) return;
        setSinceMs(loaded.sinceMs);
        setExpenses(loaded.expenses);
        setTableMissing(loaded.tableMissing);
        if (loaded.tableMissing) {
          setError(es
            ? 'Faltan tablas de caja. Ejecuta scripts/supabase-petty-cash.sql en Supabase (GDL).'
            : 'Cash tables missing. Run scripts/supabase-petty-cash.sql in Supabase.');
        }
      } catch (err) {
        if (!cancelled) {
          setError(err?.message || (es ? 'No se pudo cargar el periodo.' : 'Could not load period.'));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [open, activeSupabase, activeClinic, es]);

  if (!open) return null;

  const handleConfirm = async () => {
    if (!canConfirm) return;
    const closedAtIso = new Date().toISOString();
    const payload = buildCashDrawerEventPayload({
      eventType: CASH_DRAWER_EVENT_ARQUEO,
      clinic: activeClinic,
      floatAmount: summary.floatAmount,
      cashSalesTotal: summary.cashSalesTotal,
      expensesTotal: summary.expensesTotal,
      expectedInDrawer: summary.expectedInDrawer,
      withdrawAmount: 0,
      countedAmount: counted,
      notes: notesTrimmed,
      ticketCount: summary.ticketCount,
      expenseCount: summary.expenseCount,
      periodFrom: sinceMs > 0 ? new Date(sinceMs).toISOString() : null,
      periodTo: closedAtIso,
      details: {
        sales: summary.sales.slice(0, 80).map((tx) => ({
          id: tx.id,
          amount: tx.price,
          ticket: tx.ticketNumber,
        })),
        expenses: summary.expenses.slice(0, 80).map((e) => ({
          id: e.id,
          amount: e.amount,
          reason: e.reason,
        })),
      },
      createdBy: currentUserName || '',
    });

    setSaving(true);
    setError('');
    try {
      const { data, error: insErr } = await activeSupabase
        .from('cash_drawer_events')
        .insert([payload])
        .select()
        .maybeSingle();
      if (insErr) throw insErr;
      const event = data || payload;
      setDoneEvent(event);
      const html = buildArqueoTicketHtml({
        event,
        companyConfig,
        clinicName: activeClinic,
        locale,
        currency,
      });
      await printThermalHtml(html, es ? 'Arqueo de caja' : 'Cash count');
    } catch (err) {
      setError(err?.message || (es ? 'No se pudo guardar el arqueo.' : 'Could not save cash count.'));
    } finally {
      setSaving(false);
    }
  };

  const reprint = async () => {
    if (!doneEvent) return;
    const html = buildArqueoTicketHtml({
      event: doneEvent,
      companyConfig,
      clinicName: activeClinic,
      locale,
      currency,
    });
    await printThermalHtml(html, es ? 'Arqueo de caja' : 'Cash count');
  };

  return (
    <div className="fixed inset-0 z-[160] bg-slate-900/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl w-full max-w-lg max-h-[92dvh] overflow-hidden flex flex-col">
        <div className="bg-sky-800 text-white p-4 sm:p-5 shrink-0">
          <h2 className="text-lg font-black uppercase tracking-widest">
            {es ? 'Arqueo diario' : 'Daily cash count'}
          </h2>
          <p className="text-sky-100 text-xs mt-1 font-medium">
            {es
              ? 'Solo conteo. No retira efectivo. Incluye fondo fijo y gastos de caja chica.'
              : 'Count only. Does not withdraw cash. Includes float and petty cash.'}
          </p>
        </div>

        <div className="p-4 sm:p-5 space-y-4 overflow-y-auto flex-1 min-h-0">
          {loading ? (
            <p className="text-sm font-bold text-slate-500 uppercase">{es ? 'Cargando…' : 'Loading…'}</p>
          ) : (
            <>
              <div className="rounded-xl border-2 border-slate-300 bg-slate-50 p-3 text-xs font-bold uppercase text-slate-800 space-y-1">
                <p>
                  <span className="text-slate-500">{es ? 'Desde último retiro' : 'Since last withdrawal'}:</span>
                  {' '}
                  {sinceMs > 0 ? formatLocal(sinceMs, locale) : (es ? 'Sin retiro previo' : 'No prior withdrawal')}
                </p>
                <p>
                  <span className="text-slate-500">{es ? 'Hasta' : 'Until'}:</span>
                  {' '}
                  {formatLocal(nowMs, locale)}
                </p>
              </div>

              <div className="rounded-xl border-2 border-sky-300 bg-sky-50 p-4 space-y-1">
                <p className="text-[10px] font-black uppercase text-sky-800 tracking-widest">
                  {es ? 'Esperado en caja' : 'Expected in drawer'}
                </p>
                <p className="text-3xl font-black text-sky-950">
                  ${summary.expectedInDrawer.toFixed(2)}
                  {' '}
                  <span className="text-sm">{currency}</span>
                </p>
                <p className="text-[11px] font-bold text-sky-900">
                  {es ? 'Fondo fijo' : 'Float'} ${summary.floatAmount.toFixed(2)}
                  {' + '}
                  {es ? 'ventas' : 'sales'} ${summary.cashSalesTotal.toFixed(2)}
                  {' − '}
                  {es ? 'gastos' : 'expenses'} ${summary.expensesTotal.toFixed(2)}
                </p>
              </div>

              {summary.expenses.length > 0 && (
                <div className="rounded-xl border border-slate-200 max-h-32 overflow-y-auto">
                  <p className="sticky top-0 bg-slate-100 px-3 py-2 text-[10px] font-black uppercase text-slate-500">
                    {es ? 'Gastos del periodo' : 'Period expenses'}
                  </p>
                  <ul className="divide-y divide-slate-100">
                    {summary.expenses.map((e) => (
                      <li key={String(e.id)} className="px-3 py-2 text-[11px] font-bold text-slate-800 flex justify-between gap-2">
                        <span className="truncate">{e.reason}</span>
                        <span className="shrink-0">−${(Number(e.amount) || 0).toFixed(2)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div>
                <label className="block text-[10px] font-black uppercase text-slate-600 mb-1">
                  {es ? 'Monto contado en caja' : 'Amount counted in drawer'}
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
                  className="w-full border-2 border-sky-400 rounded-xl p-3 font-black text-lg"
                />
                {difference != null && (
                  <p className={`mt-2 text-xs font-black uppercase ${difference === 0 ? 'text-emerald-700' : 'text-orange-700'}`}>
                    {difference === 0
                      ? (es ? '✓ Coincide' : '✓ Matches')
                      : (es ? `No coincide · $${difference.toFixed(2)}` : `Mismatch · $${difference.toFixed(2)}`)}
                  </p>
                )}
              </div>

              <label className={`flex items-start gap-3 rounded-xl border-2 p-3 cursor-pointer ${amountConfirmed ? 'border-sky-500 bg-sky-50' : 'border-amber-300 bg-amber-50'}`}>
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
                      ? `Confirmo que hay $${counted.toFixed(2)} ${currency} en caja`
                      : `I confirm $${counted.toFixed(2)} ${currency} is in the drawer`)
                    : (es ? 'Primero escribe el monto contado' : 'Enter the counted amount first')}
                </span>
              </label>

              <div>
                <label className="block text-[10px] font-black uppercase text-slate-600 mb-1">
                  {mismatch
                    ? (es ? 'Nota (obligatoria)' : 'Note (required)')
                    : (es ? 'Notas (opcional)' : 'Notes (optional)')}
                </label>
                <input
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className={`w-full border-2 rounded-lg p-2 text-sm font-bold ${mismatch && !notesOk ? 'border-orange-400 bg-orange-50' : 'border-slate-300'}`}
                />
              </div>

              {error ? (
                <p className="text-xs font-bold text-red-700 bg-red-50 border border-red-200 rounded-lg p-2">{error}</p>
              ) : null}

              {doneEvent ? (
                <div className="rounded-xl border border-emerald-400 bg-emerald-50 p-3 space-y-2">
                  <p className="text-sm font-black uppercase text-emerald-900">
                    {es ? 'Arqueo guardado.' : 'Cash count saved.'}
                  </p>
                  <button
                    type="button"
                    onClick={reprint}
                    className="w-full bg-sky-700 text-white font-black uppercase text-xs py-2.5 rounded-lg"
                  >
                    {es ? 'Reimprimir' : 'Reprint'}
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
          {!doneEvent ? (
            <button
              type="button"
              disabled={!canConfirm}
              onClick={handleConfirm}
              className="flex-[1.4] bg-sky-700 text-white font-black uppercase text-xs py-3 rounded-xl disabled:opacity-40"
            >
              {saving ? (es ? 'Guardando…' : 'Saving…') : (es ? 'Confirmar arqueo' : 'Confirm count')}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
