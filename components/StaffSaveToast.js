'use client';

export default function StaffSaveToast({ message }) {
  if (!message) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-[calc(4.5rem+env(safe-area-inset-bottom,0px))] lg:bottom-6 left-1/2 -translate-x-1/2 z-[25000] pointer-events-none"
    >
      <div className="bg-slate-900 text-white text-xs font-black uppercase tracking-wide px-5 py-3 rounded-2xl shadow-2xl border border-slate-700 flex items-center gap-2 max-w-[min(92vw,24rem)]">
        <span className="text-emerald-400 text-base leading-none" aria-hidden>✓</span>
        <span className="truncate">{message}</span>
      </div>
    </div>
  );
}
