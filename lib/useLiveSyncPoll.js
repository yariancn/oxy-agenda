'use client';

import { useEffect, useRef } from 'react';
import { subscribeLiveDataUpdates } from './liveSyncBroadcast.js';

export function useLiveSyncPoll({
  enabled = true,
  clinic,
  endpoint,
  visibleIntervalMs = 5000,
  hiddenIntervalMs = 15000,
  onChange,
}) {
  const tokenRef = useRef('');
  const busyRef = useRef(false);
  const onChangeRef = useRef(onChange);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    tokenRef.current = '';
  }, [clinic]);

  useEffect(() => {
    if (!enabled || !clinic || !endpoint) return undefined;

    let cancelled = false;
    let timerId = null;

    const schedule = () => {
      if (timerId) clearTimeout(timerId);
      const delay = document.visibilityState === 'hidden' ? hiddenIntervalMs : visibleIntervalMs;
      timerId = setTimeout(tick, delay);
    };

    const tick = async () => {
      if (cancelled || busyRef.current) {
        schedule();
        return;
      }
      busyRef.current = true;
      try {
        const res = await fetch(`${endpoint}?clinic=${encodeURIComponent(clinic)}`, {
          credentials: endpoint.includes('/staff/') ? 'include' : 'same-origin',
          cache: 'no-store',
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || cancelled) return;
        const nextToken = String(data.token || '');
        if (!nextToken) return;
        if (!tokenRef.current || tokenRef.current !== nextToken) {
          await onChangeRef.current?.({ token: nextToken, source: 'poll' });
        }
        tokenRef.current = nextToken;
      } catch {
        /* ignore transient network errors */
      } finally {
        busyRef.current = false;
        if (!cancelled) schedule();
      }
    };

    const onVisibility = () => {
      if (document.visibilityState === 'visible') tick();
      else schedule();
    };

    const unsubscribeBroadcast = subscribeLiveDataUpdates(clinic, () => {
      onChangeRef.current?.({ source: 'broadcast' });
    });

    window.addEventListener('focus', tick);
    document.addEventListener('visibilitychange', onVisibility);
    tick();

    return () => {
      cancelled = true;
      if (timerId) clearTimeout(timerId);
      window.removeEventListener('focus', tick);
      document.removeEventListener('visibilitychange', onVisibility);
      unsubscribeBroadcast();
    };
  }, [clinic, enabled, endpoint, hiddenIntervalMs, visibleIntervalMs]);
}
