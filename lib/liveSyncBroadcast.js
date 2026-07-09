const CHANNEL_PREFIX = 'oxy-agenda-live';

export function liveSyncChannelName(clinic) {
  return `${CHANNEL_PREFIX}:${clinic || 'default'}`;
}

export function broadcastLiveDataUpdated(clinic) {
  if (typeof BroadcastChannel === 'undefined') return;
  try {
    const channel = new BroadcastChannel(liveSyncChannelName(clinic));
    channel.postMessage({ type: 'data-updated', at: Date.now() });
    channel.close();
  } catch {
    /* ignore */
  }
}

export function subscribeLiveDataUpdates(clinic, onUpdate) {
  if (typeof BroadcastChannel === 'undefined') return () => {};
  const channel = new BroadcastChannel(liveSyncChannelName(clinic));
  const handler = (event) => {
    if (event?.data?.type === 'data-updated') onUpdate(event.data);
  };
  channel.addEventListener('message', handler);
  return () => {
    channel.removeEventListener('message', handler);
    channel.close();
  };
}
