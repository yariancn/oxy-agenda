'use client';

import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { preferUnblockedPatient } from '../lib/deletePatientChart';

function normalizeStr(str) {
  return String(str || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function digitsOnly(str) {
  return String(str || '').replace(/\D/g, '');
}

const MAX_DROPDOWN_RESULTS = 40;

/**
 * Directory search for booking. Prefer real patient charts; optionally enrich with
 * unique names seen on appointments so orphan agenda names still autocomplete.
 */
export default function PatientSearchInput({
  patients = [],
  appointmentHints = [],
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
  const deferredQuery = useDeferredValue(query);

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

  const searchPool = useMemo(() => {
    const chartByContact = new Map();
    const chartsWithoutContact = [];
    for (const p of patients || []) {
      if (!p) continue;
      const last10 = digitsOnly(p.phone).slice(-10);
      const nameNorm = normalizeStr(p.patient);
      if (last10.length === 10 && nameNorm) {
        const ck = `${nameNorm}|${last10}`;
        const prev = chartByContact.get(ck);
        chartByContact.set(ck, prev ? (preferUnblockedPatient([prev, p]) || p) : p);
      } else {
        chartsWithoutContact.push(p);
      }
    }
    const byKey = new Map();
    const nameKeys = new Set();
    for (const p of [...chartByContact.values(), ...chartsWithoutContact]) {
      const idKey = p.id != null ? `id:${p.id}` : null;
      const nameNorm = normalizeStr(p.patient);
      const nameKey = `name:${nameNorm}`;
      if (idKey) byKey.set(idKey, p);
      else if (nameKey !== 'name:') byKey.set(nameKey, p);
      if (nameNorm) nameKeys.add(nameNorm);
    }
    for (const hint of appointmentHints || []) {
      const name = String(hint?.patient || '').trim();
      if (!name) continue;
      const nameNorm = normalizeStr(name);
      if (!nameNorm || nameKeys.has(nameNorm)) continue;
      nameKeys.add(nameNorm);
      const nameKey = `name:${nameNorm}`;
      byKey.set(`hint:${nameKey}`, {
        id: hint.patientId || hint.patient_id || `hint:${nameKey}`,
        patient: name,
        phone: hint.phone || '',
        email: hint.email || '',
        is_blocked: false,
        _fromAppointment: true,
      });
    }
    return [...byKey.values()];
  }, [patients, appointmentHints]);

  const term = normalizeStr(deferredQuery);
  const termDigits = digitsOnly(deferredQuery);
  const nameMatches = searchPool.filter(
    (p) => normalizeStr(p.patient) === normalizeStr(query) && !String(p.id).startsWith('hint:'),
  );
  const exactMatch = (pickedId
    ? nameMatches.find((p) => String(p.id) === String(pickedId))
    : null)
    || nameMatches.find((p) => !p.is_blocked)
    || nameMatches[0]
    || null;
  const confirmed = exactMatch && String(exactMatch.id) === String(pickedId);

  const filtered = useMemo(() => {
    if (!term && !termDigits) return [];
    return searchPool
      .filter((p) => {
        const name = normalizeStr(p.patient);
        const phoneDigits = digitsOnly(p.phone);
        if (term && name.includes(term)) return true;
        if (termDigits && phoneDigits.includes(termDigits)) return true;
        return false;
      })
      .sort((a, b) => {
        const aHint = a._fromAppointment ? 1 : 0;
        const bHint = b._fromAppointment ? 1 : 0;
        if (aHint !== bHint) return aHint - bHint;
        const aBlocked = a.is_blocked ? 1 : 0;
        const bBlocked = b.is_blocked ? 1 : 0;
        if (aBlocked !== bBlocked) return aBlocked - bBlocked;
        const aStarts = normalizeStr(a.patient).startsWith(term) ? 0 : 1;
        const bStarts = normalizeStr(b.patient).startsWith(term) ? 0 : 1;
        if (aStarts !== bStarts) return aStarts - bStarts;
        return String(a.patient || '').localeCompare(String(b.patient || ''), undefined, { sensitivity: 'base' });
      })
      .slice(0, MAX_DROPDOWN_RESULTS);
  }, [searchPool, term, termDigits]);

  const handlePick = (p) => {
    setQuery(p.patient);
    setPickedId(p._fromAppointment ? null : p.id);
    setOpen(false);
    onSelectPatient?.(p._fromAppointment ? {
      ...p,
      id: null,
      patientId: null,
    } : p);
  };

  const inputClass = [
    className,
    confirmed && exactMatch?.is_blocked ? 'border-red-400 bg-red-50 ring-2 ring-red-200' : '',
    confirmed && !exactMatch?.is_blocked ? 'border-emerald-500 bg-emerald-50 ring-2 ring-emerald-200' : '',
    exactMatch && !confirmed ? 'border-amber-400 bg-amber-50' : '',
  ].filter(Boolean).join(' ');

  const showDropdown = open && (term || termDigits) && filtered.length > 0;

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
      {showDropdown && (
        <ul className="absolute z-[10000] w-full mt-1 max-h-72 overflow-y-auto bg-white border border-slate-300 rounded-xl shadow-xl">
          {filtered.map((p) => (
            <li key={String(p.id)}>
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
                  {p._fromAppointment ? ' · visto en agenda' : ''}
                  {p.is_blocked ? ` · ${blockedBadge}` : ''}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {open && (term || termDigits) && filtered.length === 0 && (
        <p className="mt-1.5 text-[10px] font-bold text-slate-500 uppercase">
          Sin coincidencias · prueba otro nombre o teléfono
        </p>
      )}
    </div>
  );
}
