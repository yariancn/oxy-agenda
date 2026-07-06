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

export default function RepeatDatesCalendar({
  selectedDates = [],
  onChange,
  anchorDate = '',
  locale = 'es',
  labels = {},
  primaryDate = '',
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

          return (
            <button
              key={isoDate}
              type="button"
              onClick={() => toggleDate(isoDate)}
              className={`aspect-square rounded-lg text-[10px] font-black transition border ${
                isSelected
                  ? 'bg-emerald-600 text-white border-emerald-700 shadow-sm'
                  : 'bg-white text-emerald-900 border-emerald-100 hover:bg-emerald-50'
              } ${isPrimary ? 'ring-2 ring-emerald-300 ring-offset-1' : ''}`}
              title={isoDate}
            >
              {dayNum}
            </button>
          );
        })}
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
