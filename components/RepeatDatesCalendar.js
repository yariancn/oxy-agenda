"use client";
import React, { useEffect, useMemo, useState } from 'react';
import {
  getRecurrenceMaxOccurrences,
  sortOccurrenceDates,
  toggleOccurrenceDate,
} from '../lib/appointmentRecurrence';

const WEEKDAY_SHORT = {
  es: ['L', 'M', 'X', 'J', 'V', 'S', 'D'],
  en: ['M', 'T', 'W', 'T', 'F', 'S', 'S'],
};

function monthLabel(year, month, locale) {
  const d = new Date(year, month, 1);
  return d.toLocaleDateString(locale === 'en' ? 'en-US' : 'es-MX', {
    month: 'long',
    year: 'numeric',
  });
}

function buildMonthGrid(year, month) {
  const first = new Date(year, month, 1);
  const startOffset = (first.getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells = [];

  for (let i = 0; i < startOffset; i += 1) cells.push(null);
  for (let day = 1; day <= daysInMonth; day += 1) {
    const y = year;
    const m = String(month + 1).padStart(2, '0');
    const d = String(day).padStart(2, '0');
    cells.push(`${y}-${m}-${d}`);
  }
  return cells;
}

function reasonLabel(reason, labels) {
  if (reason === 'closed') return labels.dayClosed;
  if (reason === 'occupied') return labels.dayOccupied;
  if (reason === 'blocked') return labels.dayBlocked;
  if (reason === 'outside_hours') return labels.dayOutsideHours;
  return labels.dayUnavailable;
}

export default function RepeatDatesCalendar({
  selectedDates = [],
  onChange,
  anchorDate = '',
  locale = 'es',
  labels = {},
  primaryDate = '',
  getDateStatus,
}) {
  const anchor = anchorDate || selectedDates[0] || '';
  const anchorParts = anchor ? anchor.split('-').map(Number) : [];
  const initialYear = anchorParts[0] || new Date().getFullYear();
  const initialMonth = (anchorParts[1] || new Date().getMonth() + 1) - 1;

  const [viewYear, setViewYear] = useState(initialYear);
  const [viewMonth, setViewMonth] = useState(initialMonth);

  useEffect(() => {
    if (!anchor) return;
    const parts = anchor.split('-').map(Number);
    if (parts.length < 2) return;
    setViewYear(parts[0]);
    setViewMonth(parts[1] - 1);
  }, [anchor]);

  const selectedSet = useMemo(() => new Set(selectedDates), [selectedDates]);
  const grid = useMemo(() => buildMonthGrid(viewYear, viewMonth), [viewYear, viewMonth]);
  const weekdays = WEEKDAY_SHORT[locale === 'en' ? 'en' : 'es'];
  const maxDates = getRecurrenceMaxOccurrences();

  const shiftMonth = (delta) => {
    const d = new Date(viewYear, viewMonth + delta, 1);
    setViewYear(d.getFullYear());
    setViewMonth(d.getMonth());
  };

  const toggleDate = (isoDate) => {
    if (!isoDate || !onChange) return;
    const status = getDateStatus?.(isoDate);
    const isSelected = selectedSet.has(isoDate);
    if (!isSelected && status && !status.selectable) return;
    const next = toggleOccurrenceDate(selectedDates, isoDate, maxDates);
    onChange(sortOccurrenceDates(next));
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => shiftMonth(-1)}
          className="w-8 h-8 rounded-lg border border-emerald-200 bg-white text-emerald-800 font-black text-sm hover:bg-emerald-50"
          aria-label={labels.prevMonth || 'Previous month'}
        >
          ‹
        </button>
        <p className="text-[10px] font-black uppercase text-emerald-900 tracking-wide text-center flex-1">
          {monthLabel(viewYear, viewMonth, locale)}
        </p>
        <button
          type="button"
          onClick={() => shiftMonth(1)}
          className="w-8 h-8 rounded-lg border border-emerald-200 bg-white text-emerald-800 font-black text-sm hover:bg-emerald-50"
          aria-label={labels.nextMonth || 'Next month'}
        >
          ›
        </button>
      </div>

      <p className="text-[8px] font-bold text-emerald-700/90 uppercase text-center leading-snug">
        {labels.calendarHint}
      </p>

      <div className="grid grid-cols-7 gap-1">
        {weekdays.map((label, idx) => (
          <div key={`${label}-${idx}`} className="text-[8px] font-black text-emerald-700/70 text-center py-0.5">
            {label}
          </div>
        ))}
        {grid.map((isoDate, idx) => {
          if (!isoDate) {
            return <div key={`empty-${idx}`} className="aspect-square" />;
          }
          const dayNum = Number(isoDate.split('-')[2]);
          const isSelected = selectedSet.has(isoDate);
          const isPrimary = isoDate === primaryDate;
          const status = getDateStatus?.(isoDate) || { selectable: true, reason: null };
          const disabled = !status.selectable && !isSelected;
          const title = disabled
            ? `${isoDate} — ${reasonLabel(status.reason, labels)}`
            : isoDate;

          let tone = 'bg-white text-emerald-900 border-emerald-100 hover:bg-emerald-50';
          if (isSelected) {
            tone = 'bg-emerald-600 text-white border-emerald-700 shadow-sm';
          } else if (status.reason === 'closed') {
            tone = 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed';
          } else if (status.reason === 'occupied') {
            tone = 'bg-red-50 text-red-400 border-red-100 cursor-not-allowed line-through';
          } else if (status.reason === 'blocked' || status.reason === 'outside_hours') {
            tone = 'bg-amber-50 text-amber-500 border-amber-100 cursor-not-allowed';
          } else if (disabled) {
            tone = 'bg-slate-50 text-slate-400 border-slate-100 cursor-not-allowed';
          }

          return (
            <button
              key={isoDate}
              type="button"
              onClick={() => toggleDate(isoDate)}
              disabled={disabled}
              className={`aspect-square rounded-lg text-[10px] font-black transition border ${tone} ${isPrimary ? 'ring-2 ring-emerald-300 ring-offset-1' : ''}`}
              title={title}
            >
              {dayNum}
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap gap-x-3 gap-y-1 text-[7px] font-bold uppercase text-emerald-800/80">
        <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded bg-emerald-600" /> {labels.legendSelected}</span>
        <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded bg-slate-200 border border-slate-300" /> {labels.dayClosed}</span>
        <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded bg-red-100 border border-red-200" /> {labels.dayOccupied}</span>
        <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded bg-amber-100 border border-amber-200" /> {labels.dayBlocked}</span>
      </div>

      <div className="flex items-center justify-between gap-2 pt-1 border-t border-emerald-200">
        <p className="text-[9px] font-black uppercase text-emerald-800">
          {labels.selectedCount(selectedDates.length)}
        </p>
        {selectedDates.length > 0 ? (
          <button
            type="button"
            onClick={() => onChange?.([])}
            className="text-[8px] font-black uppercase text-emerald-700 underline hover:text-emerald-900"
          >
            {labels.clearSelection}
          </button>
        ) : null}
      </div>
    </div>
  );
}
