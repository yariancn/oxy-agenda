'use client';

import { useEffect, useState } from 'react';

/**
 * Tiny badge that only re-renders itself (not the whole agenda) when sync is fresh.
 */
export default function LiveSyncBadge({ liveSyncAt, freshMs = 20000, titleEs, titleEn, locale = 'es' }) {
  const [fresh, setFresh] = useState(false);

  useEffect(() => {
    if (!liveSyncAt) {
      setFresh(false);
      return undefined;
    }
    setFresh(true);
    const id = window.setTimeout(() => setFresh(false), freshMs);
    return () => window.clearTimeout(id);
  }, [liveSyncAt, freshMs]);

  return (
    <span
      className={`text-[8px] font-black uppercase shrink-0 px-1.5 py-0.5 rounded border ${
        fresh
          ? 'text-emerald-700 bg-emerald-50 border-emerald-200'
          : 'text-slate-400 bg-slate-50 border-slate-200'
      }`}
      title={locale === 'en' ? titleEn : titleEs}
    >
      {fresh ? '● Live' : '○ Sync'}
    </span>
  );
}
