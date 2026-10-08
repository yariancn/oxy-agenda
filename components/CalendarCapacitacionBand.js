'use client';

import { CAPACITACION_BAND_HEIGHT_PX, attendeeConfirmStats } from '../lib/capacitaciones';

/**
 * Franja del día para capacitaciones — no ocupa columna de equipo ni bloquea slots.
 */
export default function CalendarCapacitacionBand({
  items = [],
  locale = 'es',
  onSelect,
  onAdd,
  reserveWhenEmpty = false,
}) {
  if (!items.length && !reserveWhenEmpty && !onAdd) return null;

  return (
    <div
      className="border-t border-teal-300 bg-teal-50/95 flex items-stretch gap-1 px-1 overflow-x-auto shrink-0"
      style={{ height: `${CAPACITACION_BAND_HEIGHT_PX}px`, minHeight: `${CAPACITACION_BAND_HEIGHT_PX}px` }}
      role="list"
      aria-label={locale === 'en' ? 'Trainings' : 'Capacitaciones'}
    >
      <span className="text-[7px] font-black uppercase text-teal-800 self-center shrink-0 px-0.5 leading-none">
        {locale === 'en' ? 'TR' : 'CAP'}
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
      {onAdd ? (
        <button
          type="button"
          onClick={onAdd}
          className="shrink-0 self-center text-[8px] font-black uppercase text-teal-800 hover:text-teal-950 px-1.5 py-0.5 rounded border border-teal-200 bg-white/70"
          title={locale === 'en' ? 'Add training' : 'Agregar capacitación'}
        >
          +
        </button>
      ) : null}
      {!items.length && reserveWhenEmpty && !onAdd ? (
        <span className="text-[7px] font-bold text-teal-300/80 uppercase self-center px-1 leading-none">—</span>
      ) : null}
    </div>
  );
}
