'use client';

import { useMemo, useState } from 'react';
import {
  attendeeConfirmStats,
  buildCapacitacionMonthGrid,
  capacitacionDateSet,
  capacitacionesForDay,
  formatCapacitacionDateLabel,
  sortedCapacitaciones,
} from '../lib/capacitaciones';

const WEEKDAYS_ES = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
const WEEKDAYS_EN = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

export default function CapacitacionOverviewModal({
  open,
  items = [],
  locale = 'es',
  todayYmd = '',
  onClose,
  onSelectItem,
  onGoToDate,
  onAdd,
}) {
  const en = locale === 'en';
  const today = String(todayYmd || '').slice(0, 10);
  const initial = today && /^\d{4}-\d{2}-\d{2}$/.test(today)
    ? { y: Number(today.slice(0, 4)), m: Number(today.slice(5, 7)) - 1 }
    : { y: new Date().getFullYear(), m: new Date().getMonth() };
  const [cursor, setCursor] = useState(initial);
  const [selectedYmd, setSelectedYmd] = useState(today || '');

  const dateSet = useMemo(() => capacitacionDateSet(items), [items]);
  const allSorted = useMemo(() => sortedCapacitaciones(items), [items]);
  const upcoming = useMemo(
    () => allSorted.filter((c) => !today || c.full_date >= today),
    [allSorted, today],
  );
  const past = useMemo(
    () => allSorted.filter((c) => today && c.full_date < today).reverse(),
    [allSorted, today],
  );
  const monthGrid = useMemo(
    () => buildCapacitacionMonthGrid(cursor.y, cursor.m, locale),
    [cursor.y, cursor.m, locale],
  );
  const selectedItems = useMemo(
    () => (selectedYmd ? capacitacionesForDay(items, selectedYmd) : []),
    [items, selectedYmd],
  );

  if (!open) return null;

  const weekdays = en ? WEEKDAYS_EN : WEEKDAYS_ES;
  const shiftMonth = (delta) => {
    setCursor((prev) => {
      const d = new Date(prev.y, prev.m + delta, 1);
      return { y: d.getFullYear(), m: d.getMonth() };
    });
  };

  return (
    <div className="fixed inset-0 z-[12000] bg-slate-950/50 backdrop-blur-[1px] flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-white w-full sm:max-w-2xl sm:rounded-2xl rounded-t-2xl shadow-2xl border border-teal-200 max-h-[92vh] flex flex-col">
        <div className="px-4 py-3 border-b border-teal-100 flex items-start justify-between gap-3 shrink-0">
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-teal-700">
              {en ? 'Trainings calendar' : 'Calendario de capacitaciones'}
            </p>
            <h3 className="text-base font-black text-slate-900">
              {en ? 'When are the courses?' : '¿Cuándo hay cursos?'}
            </h3>
            <p className="text-[11px] text-slate-500 mt-0.5 leading-snug">
              {en
                ? 'Teal days have a training. Tap a date or a row to open it.'
                : 'Los días en teal tienen capacitación. Toca una fecha o una fila para abrirla.'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-700 text-xl leading-none px-1"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <div className="p-4 overflow-y-auto flex-1 min-h-0 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="rounded-2xl border border-teal-200 bg-teal-50/40 p-3">
            <div className="flex items-center justify-between gap-2 mb-2">
              <button
                type="button"
                onClick={() => shiftMonth(-1)}
                className="px-2 py-1 rounded-lg border border-teal-200 bg-white text-teal-800 text-xs font-black"
              >
                ◀
              </button>
              <p className="text-xs font-black uppercase text-teal-950 capitalize text-center">
                {monthGrid.label}
              </p>
              <button
                type="button"
                onClick={() => shiftMonth(1)}
                className="px-2 py-1 rounded-lg border border-teal-200 bg-white text-teal-800 text-xs font-black"
              >
                ▶
              </button>
            </div>
            <div className="grid grid-cols-7 gap-1 mb-1">
              {weekdays.map((w) => (
                <span key={w} className="text-[9px] font-black text-teal-700/70 text-center uppercase">
                  {w}
                </span>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {monthGrid.cells.map((cell) => {
                if (!cell.inMonth) {
                  return <span key={cell.key} className="h-8" />;
                }
                const has = dateSet.has(cell.ymd);
                const isToday = cell.ymd === today;
                const isSelected = cell.ymd === selectedYmd;
                return (
                  <button
                    key={cell.key}
                    type="button"
                    onClick={() => setSelectedYmd(cell.ymd)}
                    onDoubleClick={() => onGoToDate?.(cell.ymd)}
                    title={has
                      ? (en ? 'Has training — double-click to jump' : 'Hay capacitación — doble clic para ir')
                      : (en ? 'No training' : 'Sin capacitación')}
                    className={[
                      'h-8 rounded-lg text-[11px] font-black transition relative',
                      has ? 'bg-teal-600 text-white hover:bg-teal-700' : 'bg-white text-slate-700 border border-slate-200 hover:border-teal-300',
                      isSelected ? 'ring-2 ring-offset-1 ring-teal-800' : '',
                      isToday && !has ? 'border-teal-500 text-teal-800' : '',
                    ].join(' ')}
                  >
                    {cell.dayNum}
                    {has ? (
                      <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-white/90" />
                    ) : null}
                  </button>
                );
              })}
            </div>
            <p className="text-[9px] font-bold text-teal-800/80 mt-2 leading-snug">
              {en
                ? `${dateSet.size} day(s) with training · ${allSorted.length} course(s) loaded`
                : `${dateSet.size} día(s) con capacitación · ${allSorted.length} curso(s) cargados`}
            </p>
            {selectedYmd ? (
              <div className="mt-2 space-y-1">
                <p className="text-[10px] font-black uppercase text-teal-900">
                  {formatCapacitacionDateLabel(selectedYmd, locale)}
                </p>
                {selectedItems.length === 0 ? (
                  <p className="text-[11px] text-slate-500 font-medium">
                    {en ? 'No training this day.' : 'No hay capacitación este día.'}
                  </p>
                ) : (
                  selectedItems.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => onSelectItem?.(item)}
                      className="w-full text-left px-2 py-1.5 rounded-lg bg-white border border-teal-200 hover:bg-teal-50"
                    >
                      <span className="text-xs font-black text-slate-900 block truncate">{item.title}</span>
                      <span className="text-[10px] font-bold text-teal-800">
                        {item.start_time}–{item.end_time}
                        {item.attendees?.length ? ` · ${item.attendees.length}` : ''}
                      </span>
                    </button>
                  ))
                )}
                <button
                  type="button"
                  onClick={() => onGoToDate?.(selectedYmd)}
                  className="w-full mt-1 py-2 rounded-xl bg-teal-700 text-white text-[10px] font-black uppercase hover:bg-teal-800"
                >
                  {en ? 'Go to this day in agenda' : 'Ir a este día en la agenda'}
                </button>
              </div>
            ) : null}
          </div>

          <div className="space-y-3 min-h-0">
            <section>
              <p className="text-[10px] font-black uppercase text-slate-600 mb-1.5">
                {en ? 'Upcoming' : 'Próximas'}
              </p>
              <ul className="space-y-1.5 max-h-52 overflow-y-auto">
                {upcoming.length === 0 ? (
                  <li className="text-[11px] text-slate-500 font-medium px-1">
                    {en ? 'No upcoming trainings in the loaded range.' : 'No hay capacitaciones próximas en el rango cargado.'}
                  </li>
                ) : (
                  upcoming.map((item) => {
                    const stats = attendeeConfirmStats(item.attendees);
                    return (
                      <li key={item.id}>
                        <button
                          type="button"
                          onClick={() => onSelectItem?.(item)}
                          className="w-full text-left px-3 py-2 rounded-xl border border-teal-200 bg-white hover:bg-teal-50"
                        >
                          <span className="text-[10px] font-black uppercase text-teal-700 block">
                            {formatCapacitacionDateLabel(item.full_date, locale)}
                          </span>
                          <span className="text-xs font-black text-slate-900 block truncate">{item.title}</span>
                          <span className="text-[10px] font-bold text-slate-500">
                            {item.start_time}–{item.end_time}
                            {stats.total ? ` · ${stats.total} ${en ? 'attendees' : 'asist.'}` : ''}
                          </span>
                        </button>
                      </li>
                    );
                  })
                )}
              </ul>
            </section>
            {past.length > 0 ? (
              <section>
                <p className="text-[10px] font-black uppercase text-slate-500 mb-1.5">
                  {en ? 'Past' : 'Pasadas'}
                </p>
                <ul className="space-y-1.5 max-h-36 overflow-y-auto opacity-80">
                  {past.map((item) => (
                    <li key={item.id}>
                      <button
                        type="button"
                        onClick={() => onSelectItem?.(item)}
                        className="w-full text-left px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100"
                      >
                        <span className="text-[10px] font-black uppercase text-slate-500 block">
                          {formatCapacitacionDateLabel(item.full_date, locale)}
                        </span>
                        <span className="text-xs font-black text-slate-800 block truncate">{item.title}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
          </div>
        </div>

        <div className="p-4 border-t border-slate-100 flex gap-2 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-xl border border-slate-200 text-slate-700 py-2.5 text-[10px] font-black uppercase"
          >
            {en ? 'Close' : 'Cerrar'}
          </button>
          <button
            type="button"
            onClick={() => onAdd?.(selectedYmd || today)}
            className="flex-1 rounded-xl bg-teal-700 hover:bg-teal-800 text-white py-2.5 text-[10px] font-black uppercase"
          >
            {en ? '+ New training' : '+ Nueva capacitación'}
          </button>
        </div>
      </div>
    </div>
  );
}
