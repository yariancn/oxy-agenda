'use client';

import { useEffect } from 'react';

const POLL_MS = 5 * 60 * 1000;

/**
 * When a new deploy is live, reload open staff tabs so they pick up the new build.
 */
export default function DeployRefreshWatcher() {
  useEffect(() => {
    let cancelled = false;
    let knownVersion = null;

    const check = async () => {
      try {
        const res = await fetch('/api/health/build', { cache: 'no-store', credentials: 'same-origin' });
        if (!res.ok || cancelled) return;
        const data = await res.json().catch(() => ({}));
        const version = String(data?.version || data?.buildSha || '').trim();
        if (!version || cancelled) return;
        if (knownVersion == null) {
          knownVersion = version;
          return;
        }
        if (version !== knownVersion) {
          window.location.reload();
        }
      } catch {
        /* ignore transient network errors */
      }
    };

    check();
    const intervalId = setInterval(check, POLL_MS);

    const onVisible = () => {
      if (document.visibilityState === 'visible') check();
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', check);

    return () => {
      cancelled = true;
      clearInterval(intervalId);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', check);
    };
  }, []);

  return null;
}
