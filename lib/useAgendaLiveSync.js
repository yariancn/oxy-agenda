'use client';

import { useEffect, useRef } from 'react';
import { normalizeClinicId } from './clinicRegistry.js';
import { subscribeLiveDataUpdates } from './liveSyncBroadcast.js';
import { createClinicBrowserClient } from './supabaseBrowser.js';

/**
 * Change-driven agenda sync (low bandwidth):
 * 1) BroadcastChannel — instant across tabs on the same device
 * 2) Supabase Realtime on agenda_live_ping — push across devices
 * 3) HTTP safety ping (token only, tiny JSON):
 *    - every ~1 min ONLY when Realtime is down
 *    - every ~10 min when Realtime is healthy (catch rare missed events)
 *    - once when the tab becomes visible again (not also on focus — same event)
 */
export function useAgendaLiveSync({
  enabled = true,
  clinic,
  endpoint,
  onChange,
  /** When Realtime is disconnected */
  fallbackIntervalMs = 60 * 1000,
  /** When Realtime is healthy — keep this long to save cellular */
  healthyFallbackIntervalMs = 10 * 60 * 1000,
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
    let lastHttpAt = 0;

    const clearFallback = () => {
      if (timerId) {
        clearTimeout(timerId);
        timerId = null;
      }
    };

    const scheduleFallback = () => {
      clearFallback();
      // Never poll while the tab is in the background.
      if (document.visibilityState === 'hidden') return;
      const delay = realtimeOkRef.current ? healthyFallbackIntervalMs : fallbackIntervalMs;
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
      // Dedupe focus+visibility or rapid reschedules within 2s.
      const now = Date.now();
      if (now - lastHttpAt < 2000) {
        if (reschedule) scheduleFallback();
        return;
      }
      lastHttpAt = now;
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

    // visibilitychange covers returning to the tab; avoid also listening to focus
    // (both fire together on mobile and doubled cellular pings).
    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        tickHttp({ reschedule: true });
      } else {
        // Stop background pings while the tablet/tab is hidden — saves cellular.
        clearFallback();
      }
    };

    document.addEventListener('visibilitychange', onVisibility);
    // Initial seed token (tiny JSON). Does not download the full agenda.
    tickHttp({ reschedule: true });

    return () => {
      cancelled = true;
      clearFallback();
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
  }, [
    clinic,
    enabled,
    endpoint,
    fallbackIntervalMs,
    healthyFallbackIntervalMs,
  ]);
}
