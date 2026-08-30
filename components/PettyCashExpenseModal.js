'use client';

import React, { useEffect, useState } from 'react';
import { useStaffLocale } from './StaffLocaleContext';
import { isShenandoah } from '../lib/clinicRegistry';
import { buildPettyCashExpenseRow } from '../lib/pettyCash';

export default function PettyCashExpenseModal({
  open,
  onClose,
  activeClinic = '',
  currentUserName = '',
  activeSupabase = null,
  onSaved,
}) {
  const { locale } = useStaffLocale();
  const es = locale !== 'en';
  const currency = isShenandoah(activeClinic) ? 'USD' : 'MXN';

  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!open) return;
    setAmount('');
    setReason('');
    setError('');
    setDone(false);
  }, [open]);

  if (!open) return null;

  const handleSave = async () => {
    const built = buildPettyCashExpenseRow({
      clinic: activeClinic,
      amount,
      reason,
      createdBy: currentUserName || '',
    });
    if (!built.ok) {
      setError(
        built.error === 'reason_required'
          ? (es ? 'El motivo es obligatorio.' : 'Reason is required.')
          : (es ? 'Indica un monto válido mayor a 0.' : 'Enter a valid amount greater than 0.'),
      );
      return;
    }
    if (!activeSupabase) {
      setError(es ? 'Sin conexión a la base de datos.' : 'No database connection.');
      return;
    }

    setSaving(true);
    setError('');
    try {
      const { error: insErr } = await activeSupabase
        .from('petty_cash_expenses')
        .insert([built.row]);
      if (insErr) throw insErr;
      setDone(true);
      onSaved?.(built.row);
    } catch (err) {
      const msg = err?.message || '';
      if (/petty_cash_expenses|schema cache|does not exist/i.test(msg)) {
        setError(es
          ? 'Falta la tabla de caja chica. Ejecuta scripts/supabase-petty-cash.sql en Supabase.'
          : 'Petty cash table missing. Run scripts/supabase-petty-cash.sql in Supabase.');
      } else {
        setError(msg || (es ? 'No se pudo guardar el gasto.' : 'Could not save expense.'));
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[160] bg-slate-900/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl w-full max-w-md max-h-[92dvh] overflow-hidden flex flex-col">
        <div className="bg-amber-700 text-white p-4 sm:p-5 shrink-0">
          <h2 className="text-lg font-black uppercase tracking-widest">
            {es ? 'Gasto caja chica' : 'Petty cash expense'}
          </h2>
          <p className="text-amber-100 text-xs mt-1 font-medium">
            {es
              ? 'Solo efectivo. Independiente de pacientes. Motivo obligatorio.'
              : 'Cash only. Independent of patients. Reason required.'}
          </p>
        </div>

        <div className="p-4 sm:p-5 space-y-4 overflow-y-auto flex-1 min-h-0">
          {done ? (
            <div className="rounded-xl border border-emerald-400 bg-emerald-50 p-4">
              <p className="text-sm font-black uppercase text-emerald-900">
                {es ? 'Gasto registrado.' : 'Expense saved.'}
              </p>
              <p className="text-xs font-bold text-emerald-800 mt-1 normal-case">
                ${Number(amount).toFixed(2)} {currency} — {reason.trim()}
              </p>
            </div>
          ) : (
            <>
              <div>
                <label className="block text-[10px] font-black uppercase text-slate-600 mb-1">
                  {es ? 'Monto' : 'Amount'} ({currency})
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0.00"
                  className="w-full border-2 border-amber-400 rounded-xl p-3 font-black text-lg text-slate-900"
                />
              </div>
              <div>
                <label className="block text-[10px] font-black uppercase text-slate-600 mb-1">
                  {es ? 'Motivo (obligatorio)' : 'Reason (required)'}
                </label>
                <textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  rows={3}
                  placeholder={es ? 'Ej. Papel higiénico, agua, Uber…' : 'E.g. Supplies, water, rideshare…'}
                  className="w-full border-2 border-slate-300 rounded-xl p-3 text-sm font-bold text-slate-900"
                />
              </div>
              {error ? (
                <p className="text-xs font-bold text-red-700 bg-red-50 border border-red-200 rounded-lg p-2">{error}</p>
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
            {done ? (es ? 'Cerrar' : 'Close') : (es ? 'Cancelar' : 'Cancel')}
          </button>
          {!done ? (
            <button
              type="button"
              disabled={saving}
              onClick={handleSave}
              className="flex-[1.4] bg-amber-700 text-white font-black uppercase text-xs py-3 rounded-xl disabled:opacity-40"
            >
              {saving ? (es ? 'Guardando…' : 'Saving…') : (es ? 'Registrar gasto' : 'Save expense')}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
