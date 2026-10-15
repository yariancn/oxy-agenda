'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useStaffLocale } from './StaffLocaleContext';
import { isShenandoah } from '../lib/clinicRegistry';
import { loadCashDrawerPeriod } from '../lib/cashDrawerPeriod';
import { collectCashSalesSinceCut } from '../lib/cashCut';

function formatLocal(msOrIso, locale) {
  if (!msOrIso) return '';
  const t = typeof msOrIso === 'number' ? msOrIso : Date.parse(msOrIso);
  if (!Number.isFinite(t) || Number.isNaN(t)) return '';
  return new Date(t).toLocaleString(locale === 'en' ? 'en-US' : 'es-MX');
}

/**
 * Solo lectura: cuánto debe haber en caja.
 * No inserta arqueo ni retiro; no afecta el periodo del corte.
 */
export default function CashBalanceModal({
  open,
  onClose,
  patients = [],
  sessionGroups = [],
  activeClinic = '',
  activeSupabase = null,
}) {
  const { locale } = useStaffLocale();
  const es = locale !== 'en';
  const currency = isShenandoah(activeClinic) ? 'USD' : 'MXN';

  const [loading, setLoading] = useState(false);
  const [sinceMs, setSinceMs] = useState(0);
  const [expenses, setExpenses] = useState([]);
  const [error, setError] = useState('');
  const [tableMissing, setTableMissing] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [recentEvents, setRecentEvents] = useState([]);

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

  useEffect(() => {
    if (!open) return undefined;
    let cancelled = false;
    setError('');
    setNowMs(Date.now());
    setLoading(true);
    setRecentEvents([]);

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
            ? 'Faltan tablas de caja. Ejecuta scripts/supabase-petty-cash.sql en Supabase.'
            : 'Cash tables missing. Run scripts/supabase-petty-cash.sql in Supabase.');
        }

        const { data: events, error: evErr } = await activeSupabase
          .from('cash_drawer_events')
          .select('id, event_type, expected_amount, counted_amount, withdraw_amount, created_at, created_by')
          .eq('clinic', activeClinic)
          .order('created_at', { ascending: false })
          .limit(8);
        if (!cancelled && !evErr) {
          setRecentEvents(events || []);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err?.message || (es ? 'No se pudo cargar la caja.' : 'Could not load drawer.'));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [open, activeSupabase, activeClinic, es]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[160] bg-slate-900/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl w-full max-w-lg max-h-[92dvh] overflow-hidden flex flex-col">
        <div className="bg-violet-900 text-white p-4 sm:p-5 shrink-0">
          <h2 className="text-lg font-black uppercase tracking-widest">
            {es ? 'Saldo en caja' : 'Cash on hand'}
          </h2>
          <p className="text-violet-100 text-xs mt-1 font-medium">
            {es
              ? 'Solo consulta. No registra arqueo ni retiro; no afecta el corte.'
              : 'Read-only. Does not record a count or withdrawal; does not affect the cut.'}
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
                  <span className="text-slate-500">{es ? 'Consulta al' : 'As of'}:</span>
                  {' '}
                  {formatLocal(nowMs, locale)}
                </p>
              </div>

              <div className="rounded-xl border-2 border-violet-300 bg-violet-50 p-4 space-y-1">
                <p className="text-[10px] font-black uppercase text-violet-800 tracking-widest">
                  {es ? 'Debe haber en caja' : 'Should be in drawer'}
                </p>
                <p className="text-3xl font-black text-violet-950">
                  ${summary.expectedInDrawer.toFixed(2)}
                  {' '}
                  <span className="text-sm">{currency}</span>
                </p>
                <p className="text-[11px] font-bold text-violet-900">
                  {es ? 'Fondo fijo' : 'Float'} ${summary.floatAmount.toFixed(2)}
                  {' + '}
                  {es ? 'ventas efectivo' : 'cash sales'} ${summary.cashSalesTotal.toFixed(2)}
                  {' − '}
                  {es ? 'gastos' : 'expenses'} ${summary.expensesTotal.toFixed(2)}
                </p>
                <p className="text-[10px] font-bold text-violet-800/80 pt-1">
                  {es
                    ? `Excedente (si hicieras corte): $${summary.withdrawAmount.toFixed(2)} · quedarían $${summary.floatAmount.toFixed(2)} de fondo`
                    : `Excess if you cut: $${summary.withdrawAmount.toFixed(2)} · float left $${summary.floatAmount.toFixed(2)}`}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-xl border border-slate-200 bg-white p-3">
                  <p className="text-[9px] font-black uppercase text-slate-500">{es ? 'Ventas efectivo' : 'Cash sales'}</p>
                  <p className="text-lg font-black text-slate-800">${summary.cashSalesTotal.toFixed(2)}</p>
                  <p className="text-[10px] font-bold text-slate-500">{summary.sales?.length || 0} {es ? 'cobros' : 'payments'}</p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-white p-3">
                  <p className="text-[9px] font-black uppercase text-slate-500">{es ? 'Gastos caja chica' : 'Petty expenses'}</p>
                  <p className="text-lg font-black text-slate-800">${summary.expensesTotal.toFixed(2)}</p>
                  <p className="text-[10px] font-bold text-slate-500">{summary.expenses?.length || 0} {es ? 'movimientos' : 'items'}</p>
                </div>
              </div>

              {summary.expenses.length > 0 && (
                <div className="rounded-xl border border-slate-200 max-h-36 overflow-y-auto">
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

              {recentEvents.length > 0 && (
                <div className="rounded-xl border border-slate-200 max-h-40 overflow-y-auto">
                  <p className="sticky top-0 bg-slate-100 px-3 py-2 text-[10px] font-black uppercase text-slate-500">
                    {es ? 'Últimos arqueos / retiros' : 'Recent counts / withdrawals'}
                  </p>
                  <ul className="divide-y divide-slate-100">
                    {recentEvents.map((ev) => (
                      <li key={String(ev.id)} className="px-3 py-2 text-[11px] font-bold text-slate-800">
                        <div className="flex justify-between gap-2">
                          <span className="uppercase text-slate-600">
                            {ev.event_type === 'retiro'
                              ? (es ? 'Retiro' : 'Withdrawal')
                              : (es ? 'Arqueo' : 'Count')}
                          </span>
                          <span className="shrink-0 text-slate-500">{formatLocal(ev.created_at, locale)}</span>
                        </div>
                        <p className="text-slate-700 mt-0.5">
                          {es ? 'Esp.' : 'Exp.'} ${(Number(ev.expected_amount) || 0).toFixed(2)}
                          {ev.event_type === 'retiro'
                            ? ` · ${es ? 'Retirado' : 'Out'} $${(Number(ev.withdraw_amount) || 0).toFixed(2)}`
                            : (ev.counted_amount != null
                              ? ` · ${es ? 'Contado' : 'Counted'} $${(Number(ev.counted_amount) || 0).toFixed(2)}`
                              : '')}
                          {ev.created_by ? ` · ${ev.created_by}` : ''}
                        </p>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {tableMissing || error ? (
                <p className="text-xs font-bold text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
                  {error}
                </p>
              ) : null}

              <p className="text-[10px] font-bold text-slate-500 leading-relaxed">
                {es
                  ? 'Para solo mirar el saldo usa esta pantalla. El arqueo diario también es seguro (solo guarda un conteo). El corte/retiro sí entrega efectivo y reinicia el periodo.'
                  : 'Use this screen to only view the balance. Daily count is also safe (saves a count only). Cash withdrawal does hand over cash and resets the period.'}
              </p>
            </>
          )}
        </div>

        <div className="p-4 border-t border-slate-100 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="w-full bg-slate-800 text-white font-black uppercase text-xs py-3 rounded-xl hover:bg-slate-900"
          >
            {es ? 'Cerrar' : 'Close'}
          </button>
        </div>
      </div>
    </div>
  );
}
