'use client';

import { CAPACITACION_BAND_HEIGHT_PX, attendeeConfirmStats } from '../lib/capacitaciones';

/**
 * Franja del día para capacitaciones — solo si hay al menos una programada.
 * No ocupa columna de equipo ni bloquea slots.
 */
export default function CalendarCapacitacionBand({
  items = [],
  locale = 'es',
  onSelect,
}) {
  if (!items.length) return null;

  return (
    <div
      className="border-t border-teal-300 bg-teal-50/95 flex items-stretch gap-1 px-1 overflow-x-auto shrink-0"
      style={{ height: `${CAPACITACION_BAND_HEIGHT_PX}px`, minHeight: `${CAPACITACION_BAND_HEIGHT_PX}px` }}
      role="list"
      aria-label={locale === 'en' ? 'Trainings' : 'Capacitaciones'}
    >
      <span className="text-[8px] font-black uppercase text-teal-900 self-center shrink-0 px-1 leading-none">
        {locale === 'en' ? 'Training' : 'Capacitación'}
      </span>
      {items.map((item) => {
        const stats = attendeeConfirmStats(item.attendees);
        const title = String(item.title || '').trim() || (locale === 'en' ? 'Training' : 'Capacitación');
        return (
          <button
            key={item.id}
            type="button"
            role="listitem"
            title={`${title} · ${item.start_time}–${item.end_time}${stats.total ? ` · ${stats.total} asist.` : ''}`}
            onClick={() => onSelect?.(item)}
            className="flex items-center gap-1 min-w-0 max-w-[220px] shrink-0 rounded border border-dashed border-teal-300 bg-white/80 hover:bg-teal-100/80 px-1.5 py-0.5 text-left transition shadow-sm"
          >
            <span className="text-[8px] font-black text-teal-950 uppercase truncate leading-tight">
              {title}
            </span>
            <span className="hidden sm:inline text-[6px] font-bold text-teal-700 uppercase shrink-0">
              {item.start_time}–{item.end_time}
            </span>
            {stats.total > 0 ? (
              <span className="text-[6px] font-black text-teal-800 bg-teal-100 rounded px-1 shrink-0">
                {stats.total}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
