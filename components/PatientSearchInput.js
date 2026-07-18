'use client';

import { useEffect, useRef, useState } from 'react';

function normalizeStr(str) {
  return String(str || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

export default function PatientSearchInput({
  patients = [],
  value = '',
  selectedPatientId = null,
  onQueryChange,
  onSelectPatient,
  placeholder = 'Escribe para buscar...',
  className = '',
  selectedLabel = 'Paciente seleccionado',
  pickHint = 'Clic en la lista para confirmar',
  blockedBadge = 'Paciente bloqueado',
}) {
  const [query, setQuery] = useState(value);
  const [open, setOpen] = useState(false);
  const [pickedId, setPickedId] = useState(selectedPatientId);
  const wrapRef = useRef(null);

  useEffect(() => {
    setQuery(value || '');
  }, [value]);

  useEffect(() => {
    setPickedId(selectedPatientId || null);
  }, [selectedPatientId]);

  useEffect(() => {
    const onDocClick = (e) => {
      if (!wrapRef.current?.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  const term = normalizeStr(query);
  const exactMatch = patients.find((p) => normalizeStr(p.patient) === normalizeStr(query));
  const confirmed = exactMatch && String(exactMatch.id) === String(pickedId);

  const filtered = patients
    .filter((p) => {
      if (!term || term.length < 2) return false;
      const name = normalizeStr(p.patient);
      const phone = normalizeStr(p.phone);
      return name.includes(term) || phone.includes(term);
    })
    .slice(0, 15);

  const handlePick = (p) => {
    setQuery(p.patient);
    setPickedId(p.id);
    setOpen(false);
    onSelectPatient?.(p);
  };

  const inputClass = [
    className,
    confirmed && exactMatch?.is_blocked ? 'border-red-400 bg-red-50 ring-2 ring-red-200' : '',
    confirmed && !exactMatch?.is_blocked ? 'border-emerald-500 bg-emerald-50 ring-2 ring-emerald-200' : '',
    exactMatch && !confirmed ? 'border-amber-400 bg-amber-50' : '',
  ].filter(Boolean).join(' ');

  return (
    <div ref={wrapRef} className="relative">
      <input
        type="text"
        value={query}
        placeholder={placeholder}
        autoComplete="off"
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          const next = e.target.value;
          setQuery(next);
          setPickedId(null);
          setOpen(true);
          onQueryChange?.(next);
        }}
        className={inputClass}
      />
      {confirmed && exactMatch ? (
        <p className={`mt-1.5 text-[10px] font-black uppercase flex items-center gap-1 ${exactMatch.is_blocked ? 'text-red-700' : 'text-emerald-700'}`}>
          <span className={`inline-flex h-4 w-4 items-center justify-center rounded-full text-white text-[9px] ${exactMatch.is_blocked ? 'bg-red-600' : 'bg-emerald-600'}`}>
            {exactMatch.is_blocked ? '!' : '✓'}
          </span>
          {exactMatch.is_blocked ? `🚫 ${blockedBadge}` : selectedLabel}: {exactMatch.patient}
          {exactMatch.phone ? ` · ${exactMatch.phone}` : ''}
        </p>
      ) : exactMatch && query.trim() ? (
        <p className="mt-1.5 text-[10px] font-black uppercase text-amber-700">{pickHint}</p>
      ) : null}
      {open && term.length >= 2 && filtered.length > 0 && (
        <ul className="absolute z-[10000] w-full mt-1 max-h-52 overflow-y-auto bg-white border border-slate-300 rounded-xl shadow-xl">
          {filtered.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => handlePick(p)}
                className={`w-full text-left px-3 py-2.5 hover:bg-emerald-50 border-b border-slate-100 last:border-0 transition ${String(p.id) === String(pickedId) ? 'bg-emerald-100' : ''} ${p.is_blocked ? 'bg-red-50 hover:bg-red-100' : ''}`}
              >
                <span className="block font-black uppercase text-sm text-slate-800 truncate">
                  {p.is_blocked ? '🚫 ' : ''}{p.patient}
                </span>
                <span className="block text-[10px] font-bold text-slate-500 mt-0.5">
                  {p.phone || '—'}
                  {p.is_blocked ? ` · ${blockedBadge}` : ''}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
