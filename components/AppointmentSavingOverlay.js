"use client";
import React from 'react';

export default function AppointmentSavingOverlay({
  open,
  phase = 'creating',
  title,
  detail = '',
  closeLabel,
  onClose,
}) {
  if (!open) return null;

  const isCreating = phase === 'creating';

  return (
    <div className="fixed inset-0 z-[20000] bg-slate-900/75 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6 sm:p-8 text-center border border-slate-200">
        {isCreating ? (
          <div className="w-14 h-14 border-4 border-emerald-200 border-t-emerald-600 rounded-full animate-spin mx-auto mb-5" />
        ) : (
          <div className={`w-16 h-16 rounded-full flex items-center justify-center text-3xl mx-auto mb-5 ${phase === 'error' ? 'bg-red-100 text-red-600' : 'bg-emerald-100 text-emerald-600'}`}>
            {phase === 'error' ? '!' : '✓'}
          </div>
        )}
        <h3 className="text-base sm:text-lg font-black text-slate-800 uppercase tracking-tight">
          {title}
        </h3>
        {detail ? (
          <p className="text-xs sm:text-sm font-bold text-slate-500 mt-3 whitespace-pre-line leading-relaxed">
            {detail}
          </p>
        ) : null}
        {!isCreating && onClose ? (
          <button
            type="button"
            onClick={onClose}
            className="mt-6 w-full bg-slate-900 text-white font-black py-3 rounded-xl uppercase text-xs hover:bg-slate-800 transition"
          >
            {closeLabel}
          </button>
        ) : null}
      </div>
    </div>
  );
}
