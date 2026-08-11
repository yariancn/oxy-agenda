'use client';

import { useEffect, useState } from 'react';

const POLL_MS = 15 * 60 * 1000; // 15 min — deploy checks must not burn cellular
const CLIENT_BUILD = String(process.env.NEXT_PUBLIC_BUILD_SHA || 'dev').trim();

function normalizeSha(value) {
  const raw = String(value || '').trim();
  if (!raw || raw === 'dev') return raw;
  return raw.slice(0, 7);
}

/**
 * Compare the JS bundle build SHA vs /api/health/build.
 * If the open tab is stale (common with tablets / PWA), show a banner to reload.
 * Checks on mount, when the tab becomes visible, and every 15 minutes while visible.
 */
export default function DeployRefreshWatcher() {
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [serverSha, setServerSha] = useState('');

  useEffect(() => {
    let cancelled = false;
    let intervalId = null;

    const check = async () => {
      if (document.visibilityState === 'hidden') return;
      try {
        const res = await fetch(`/api/health/build?t=${Date.now()}`, {
          cache: 'no-store',
          credentials: 'same-origin',
        });
        if (!res.ok || cancelled) return;
        const data = await res.json().catch(() => ({}));
        const remote = normalizeSha(data?.buildSha || data?.version || '');
        const local = normalizeSha(CLIENT_BUILD);
        if (!remote || remote === 'dev' || !local || local === 'dev') return;
        if (remote !== local) {
          setServerSha(remote);
          setUpdateAvailable(true);
        }
      } catch {
        /* ignore transient network errors */
      }
    };

    const startInterval = () => {
      if (intervalId) clearInterval(intervalId);
      intervalId = setInterval(check, POLL_MS);
    };

    check();
    startInterval();

    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        check();
        startInterval();
      } else if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
      }
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      cancelled = true;
      if (intervalId) clearInterval(intervalId);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  if (!updateAvailable) return null;

  return (
    <div className="fixed top-0 inset-x-0 z-[30000] p-2 sm:p-3 pointer-events-none">
      <div className="max-w-xl mx-auto pointer-events-auto rounded-2xl bg-amber-500 text-slate-950 shadow-2xl border border-amber-300 px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-xs sm:text-sm font-black uppercase tracking-wide">
            Hay una versión nueva de la agenda
          </p>
          <p className="text-[11px] sm:text-xs font-bold opacity-90 mt-0.5">
            Esta pantalla está desactualizada{serverSha ? ` (servidor ${serverSha}` : ''}
            {CLIENT_BUILD && CLIENT_BUILD !== 'dev' ? ` · local ${CLIENT_BUILD}` : ''}
            {serverSha ? ')' : ''}. Actualiza para ver los últimos cambios.
          </p>
        </div>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="shrink-0 bg-slate-900 text-white font-black uppercase text-[11px] px-4 py-2.5 rounded-xl hover:bg-slate-800"
        >
          Actualizar ahora
        </button>
      </div>
    </div>
  );
}
