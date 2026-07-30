'use client';

import { useEffect, useRef } from 'react';
import { normalizeClinicId } from './clinicRegistry.js';
import { subscribeLiveDataUpdates } from './liveSyncBroadcast.js';
import { createClinicBrowserClient } from './supabaseBrowser.js';

/**
 * Change-driven agenda sync:
 * 1) BroadcastChannel — instant across tabs on the same device
 * 2) Supabase Realtime on agenda_live_ping — push across devices
 * 3) Light HTTP safety ping every ~1 min (token only) in case a Realtime event was missed
 */
export function useAgendaLiveSync({
  enabled = true,
  clinic,
  endpoint,
  onChange,
  /** Safety ping while the tab is visible (Realtime primary; this is backup only) */
  fallbackIntervalMs = 60 * 1000,
  hiddenFallbackIntervalMs = 5 * 60 * 1000,
}) {
  const tokenRef = useRef('');
  const busyRef = useRef(false);
  const onChangeRef = useRef(onChange);
  const realtimeOkRef = useRef(false);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    tokenRef.current = '';
    realtimeOkRef.current = false;
  }, [clinic]);

  useEffect(() => {
    if (!enabled || !clinic || !endpoint) return undefined;

    let cancelled = false;
    let timerId = null;
    let supabase = null;
    let channel = null;

    const clearFallback = () => {
      if (timerId) {
        clearTimeout(timerId);
        timerId = null;
      }
    };

    const scheduleFallback = () => {
      clearFallback();
      const delay = document.visibilityState === 'hidden'
        ? hiddenFallbackIntervalMs
        : fallbackIntervalMs;
      timerId = setTimeout(tickHttp, delay);
    };

    const notifyChange = async (source, nextToken) => {
      if (cancelled) return;
      if (nextToken) {
        const prev = tokenRef.current;
        if (prev && prev === nextToken) return;
        tokenRef.current = nextToken;
        if (!prev) return; // seed baseline without refetch
      }
      await onChangeRef.current?.({ token: nextToken || tokenRef.current, source });
    };

    const tickHttp = async ({ reschedule = true } = {}) => {
      if (cancelled || busyRef.current) {
        if (reschedule) scheduleFallback();
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
        const prev = tokenRef.current;
        if (!prev) {
          tokenRef.current = nextToken;
          return;
        }
        if (prev !== nextToken) {
          await notifyChange('poll', nextToken);
        }
      } catch {
        /* ignore transient network errors */
      } finally {
        busyRef.current = false;
        if (!cancelled && reschedule) scheduleFallback();
      }
    };

    const unsubscribeBroadcast = subscribeLiveDataUpdates(clinic, () => {
      onChangeRef.current?.({ source: 'broadcast' });
    });

    // Push path: listen for agenda_rev bumps (written by bumpAgendaLiveRev on saves).
    try {
      supabase = createClinicBrowserClient(clinic);
      if (supabase) {
        const clinicId = normalizeClinicId(clinic);
        channel = supabase
          .channel(`agenda-live:${clinicId}`)
          .on(
            'postgres_changes',
            {
              event: '*',
              schema: 'public',
              table: 'agenda_live_ping',
              filter: `clinic=eq.${clinicId}`,
            },
            (payload) => {
              const rev = payload?.new?.agenda_rev;
              if (rev == null) {
                onChangeRef.current?.({ source: 'realtime' });
                return;
              }
              notifyChange('realtime', `rev:${rev}`);
            },
          )
          .subscribe((status) => {
            if (status === 'SUBSCRIBED') {
              realtimeOkRef.current = true;
            } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
              realtimeOkRef.current = false;
            }
            scheduleFallback();
          });
      } else {
        scheduleFallback();
      }
    } catch {
      realtimeOkRef.current = false;
      scheduleFallback();
    }

    const onFocus = () => {
      tickHttp({ reschedule: true });
    };

    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        // One cheap check when coming back to the tab (catch anything missed offline).
        tickHttp({ reschedule: true });
      } else {
        scheduleFallback();
      }
    };

    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibility);
    // Initial seed token (tiny JSON). Does not download the full agenda.
    tickHttp({ reschedule: true });

    return () => {
      cancelled = true;
      clearFallback();
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibility);
      unsubscribeBroadcast();
      if (channel && supabase) {
        try {
          supabase.removeChannel(channel);
        } catch {
          /* ignore */
        }
      }
    };
  }, [clinic, enabled, endpoint, fallbackIntervalMs, hiddenFallbackIntervalMs]);
}
