'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { getClinicMeta } from '../lib/clinicRegistry';

const KIND_STYLES = {
  available: 'bg-emerald-50 border-emerald-200 text-emerald-800',
  occupied: 'bg-slate-200 border-slate-300 text-slate-600',
  blocked: 'bg-amber-50 border-amber-200 text-amber-900',
  too_soon: 'bg-slate-100 border-slate-200 text-slate-400',
  demo: 'bg-violet-100 border-violet-300 text-violet-900',
  demo_override: 'bg-sky-50 border-sky-300 text-sky-900',
};

export default function DemoOccupancyPanel({ clinicName, locale = 'es' }) {
  const t = locale === 'en' ? COPY.en : COPY.es;
  const [state, setState] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [previewDate, setPreviewDate] = useState('');
  const [forbidden, setForbidden] = useState(false);

  const bookingPath = useMemo(() => getClinicMeta(clinicName).bookingPath, [clinicName]);

  const load = useCallback(async (dateOverride = '') => {
    setLoading(true);
    try {
      const dateParam = dateOverride || previewDate;
      const qs = new URLSearchParams({ clinic: clinicName });
      if (dateParam) qs.set('date', dateParam);
      const res = await fetch(`/api/staff/demo-occupancy?${qs}`, { credentials: 'include' });
      if (res.status === 403) {
        setForbidden(true);
        setState(null);
        return;
      }
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Load failed');
      setForbidden(false);
      setState(data);
      if (data.previewDate) setPreviewDate(data.previewDate);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  }, [clinicName, previewDate]);

  useEffect(() => {
    load();
  }, [clinicName]);

  const runAction = async (action, extra = {}) => {
    setBusy(true);
    try {
      const res = await fetch('/api/staff/demo-occupancy', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clinic: clinicName,
          action,
          previewDate,
          ...extra,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Action failed');
      setState((prev) => ({
        ...prev,
        enabled: data.enabled,
        slotCount: data.slotCount,
        overrideCount: data.overrideCount,
        preview: data.preview,
      }));
    } catch (error) {
      alert(error.message);
    } finally {
      setBusy(false);
    }
  };

  if (forbidden) return null;
  if (loading && !state) {
    return (
      <div className="mb-6 p-4 rounded-2xl border border-violet-200 bg-violet-50 text-[10px] font-bold uppercase text-violet-700">
        {t.loading}
      </div>
    );
  }
  if (!state) return null;

  return (
    <div className="mb-6 p-5 rounded-2xl border-2 border-violet-300 bg-violet-50 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
        <div>
          <h4 className="text-xs font-black uppercase text-violet-900">{t.title}</h4>
          <p className="text-[10px] font-bold text-violet-800/90 mt-1 leading-relaxed max-w-xl">{t.hint}</p>
        </div>
        <span className={`text-[9px] font-black uppercase px-2 py-1 rounded-full ${state.enabled ? 'bg-violet-600 text-white' : 'bg-white text-violet-700 border border-violet-300'}`}>
          {state.enabled ? t.on : t.off}
        </span>
      </div>

      <div className="flex flex-wrap gap-2 mb-4">
        {!state.enabled ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => runAction('enable')}
            className="px-3 py-2 rounded-lg bg-violet-700 text-white text-[10px] font-black uppercase disabled:opacity-60"
          >
            {t.enable}
          </button>
        ) : (
          <>
            <button
              type="button"
              disabled={busy}
              onClick={() => runAction('regenerate')}
              className="px-3 py-2 rounded-lg bg-white border border-violet-300 text-violet-800 text-[10px] font-black uppercase disabled:opacity-60"
            >
              {t.regenerate}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => runAction('disable')}
              className="px-3 py-2 rounded-lg bg-slate-800 text-white text-[10px] font-black uppercase disabled:opacity-60"
            >
              {t.disable}
            </button>
          </>
        )}
        <a
          href={bookingPath}
          target="_blank"
          rel="noreferrer"
          className="px-3 py-2 rounded-lg bg-white border border-violet-300 text-violet-800 text-[10px] font-black uppercase"
        >
          {t.openPortal}
        </a>
      </div>

      <p className="text-[10px] font-bold text-violet-900 mb-3">
        {t.stats(state.slotCount || 0, state.overrideCount || 0, state.percent || 30)}
      </p>

      {state.enabled && (
        <>
          <div className="flex flex-wrap items-end gap-3 mb-3">
            <label className="text-[10px] font-black uppercase text-violet-800">
              {t.previewDate}
              <input
                type="date"
                value={previewDate}
                onChange={(e) => setPreviewDate(e.target.value)}
                className="block mt-1 p-2 border border-violet-200 rounded-lg text-xs font-bold bg-white"
              />
            </label>
            <button
              type="button"
              disabled={busy}
              onClick={() => load(previewDate)}
              className="px-3 py-2 rounded-lg bg-white border border-violet-300 text-violet-800 text-[10px] font-black uppercase disabled:opacity-60"
            >
              {t.refresh}
            </button>
          </div>

          <p className="text-[9px] font-bold text-violet-800 mb-2">{t.overrideHint}</p>
          <div className="max-h-56 overflow-y-auto grid grid-cols-1 sm:grid-cols-2 gap-2">
            {(state.preview || []).map((row) => {
              const clickable = row.kind === 'demo' || row.kind === 'demo_override';
              return (
                <button
                  key={row.key}
                  type="button"
                  disabled={!clickable || busy}
                  onClick={() => clickable && runAction('toggle_override', { slotKey: row.key })}
                  className={`text-left p-2 rounded-lg border text-[9px] font-bold uppercase ${KIND_STYLES[row.kind] || KIND_STYLES.available} ${clickable ? 'hover:ring-2 hover:ring-violet-400' : 'cursor-default'}`}
                >
                  <span className="block truncate">{row.equipment}</span>
                  <span className="block">{row.time}</span>
                  <span className="block opacity-80">{t.kind(row.kind)}</span>
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

const COPY = {
  es: {
    title: 'Ocupación demo (solo portal clientes)',
    hint: 'Los clientes ven ~30% de horarios ocupados de forma simulada. Tu agenda staff sigue mostrando la disponibilidad real. Toca un horario violeta para liberarlo en el portal.',
    loading: 'Cargando panel demo…',
    on: 'Activo',
    off: 'Inactivo',
    enable: 'Activar 30% demo',
    disable: 'Desactivar demo',
    regenerate: 'Recalcular 30%',
    openPortal: 'Ver portal cliente',
    previewDate: 'Vista del día',
    refresh: 'Actualizar vista',
    overrideHint: 'Horarios violeta = simulados. Clic para liberar o volver a ocupar en el portal.',
    stats: (slots, overrides, pct) => `${slots} huecos simulados · ${overrides} liberados manualmente · ${pct}% objetivo`,
    kind: (k) => ({
      available: 'Libre (real)',
      occupied: 'Ocupado (real)',
      blocked: 'Bloqueado',
      too_soon: 'Muy pronto',
      demo: 'Simulado — clic para liberar',
      demo_override: 'Liberado en demo — clic para volver',
    }[k] || k),
  },
  en: {
    title: 'Demo occupancy (client portal only)',
    hint: 'Clients see ~30% of slots as busy (simulated). Staff agenda still shows real availability. Tap purple slots to free them on the portal.',
    loading: 'Loading demo panel…',
    on: 'On',
    off: 'Off',
    enable: 'Enable 30% demo',
    disable: 'Disable demo',
    regenerate: 'Recalculate 30%',
    openPortal: 'Open client portal',
    previewDate: 'Preview day',
    refresh: 'Refresh view',
    overrideHint: 'Purple = simulated. Click to free or re-occupy on the portal.',
    stats: (slots, overrides, pct) => `${slots} simulated slots · ${overrides} manual overrides · ${pct}% target`,
    kind: (k) => ({
      available: 'Open (real)',
      occupied: 'Booked (real)',
      blocked: 'Blocked',
      too_soon: 'Too soon',
      demo: 'Simulated — click to free',
      demo_override: 'Freed in demo — click to restore',
    }[k] || k),
  },
};
