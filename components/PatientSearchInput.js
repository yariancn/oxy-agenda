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
  onQueryChange,
  onSelectPatient,
  placeholder = 'Escribe para buscar...',
  className = '',
}) {
  const [query, setQuery] = useState(value);
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);

  useEffect(() => {
    setQuery(value || '');
  }, [value]);

  useEffect(() => {
    const onDocClick = (e) => {
      if (!wrapRef.current?.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  const term = normalizeStr(query);
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
    setOpen(false);
    onSelectPatient?.(p);
  };

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
          setOpen(true);
          onQueryChange?.(next);
        }}
        className={className}
      />
      {open && term.length >= 2 && filtered.length > 0 && (
        <ul className="absolute z-[10000] w-full mt-1 max-h-52 overflow-y-auto bg-white border border-slate-300 rounded-xl shadow-xl">
          {filtered.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => handlePick(p)}
                className="w-full text-left px-3 py-2.5 hover:bg-emerald-50 border-b border-slate-100 last:border-0 transition"
              >
                <span className="block font-black uppercase text-sm text-slate-800 truncate">{p.patient}</span>
                {p.phone ? (
                  <span className="block text-[10px] font-bold text-slate-500 mt-0.5">{p.phone}</span>
                ) : null}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
