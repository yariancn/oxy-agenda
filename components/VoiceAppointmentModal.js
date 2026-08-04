'use client';

import React, { useEffect, useRef, useState } from 'react';
import { parseAppointmentFromOcrText } from '../lib/screenshotAppointmentParse';

function getSpeechRecognition() {
  if (typeof window === 'undefined') return null;
  return window.SpeechRecognition || window.webkitSpeechRecognition || null;
}

/**
 * Reserva por voz: panel compacto (no pantalla completa) para poder usar
 * Split View / otra app (WhatsApp, Facebook) mientras el micrófono escucha.
 */
export default function VoiceAppointmentModal({
  open,
  onClose,
  locale = 'es',
  labels,
  services = [],
  activeClinic = '',
  defaultEquipment = '',
  referenceDate = '',
  onSchedule,
}) {
  const recognitionRef = useRef(null);
  const [listening, setListening] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [interim, setInterim] = useState('');
  const [error, setError] = useState('');
  const [unsupported, setUnsupported] = useState(false);
  const [step, setStep] = useState('listen'); // listen | review
  const [form, setForm] = useState({
    patient: '',
    phone: '',
    email: '',
    fullDate: '',
    time: '',
    equipment: defaultEquipment,
    notes: '',
  });
  const [scheduling, setScheduling] = useState(false);

  const t = labels || {};
  const es = locale !== 'en';

  const stopListening = () => {
    try {
      recognitionRef.current?.stop?.();
    } catch {
      /* ignore */
    }
    recognitionRef.current = null;
    setListening(false);
    setInterim('');
  };

  const reset = () => {
    stopListening();
    setMinimized(false);
    setTranscript('');
    setInterim('');
    setError('');
    setUnsupported(false);
    setStep('listen');
    setForm({
      patient: '',
      phone: '',
      email: '',
      fullDate: '',
      time: '',
      equipment: defaultEquipment,
      notes: '',
    });
    setScheduling(false);
  };

  useEffect(() => {
    if (!open) reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, defaultEquipment]);

  useEffect(() => () => stopListening(), []);

  if (!open) return null;

  const startListening = () => {
    setError('');
    const Ctor = getSpeechRecognition();
    if (!Ctor) {
      setUnsupported(true);
      setError(t.unsupported || (es
        ? 'Este navegador no permite dictado. Usa Safari o Chrome actualizado.'
        : 'This browser cannot dictate. Use up-to-date Safari or Chrome.'));
      return;
    }
    try {
      const recognition = new Ctor();
      recognition.lang = es ? 'es-MX' : 'en-US';
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.maxAlternatives = 1;

      recognition.onstart = () => setListening(true);
      recognition.onerror = (ev) => {
        const code = ev?.error || '';
        if (code === 'aborted' || code === 'no-speech') return;
        setListening(false);
        setError(t.micError || (es
          ? `Micrófono: ${code}. Permite el acceso al micrófono y mantén OXY visible (Split View con WhatsApp).`
          : `Mic: ${code}. Allow microphone access and keep OXY visible (Split View with WhatsApp).`));
      };
      recognition.onend = () => {
        setListening(false);
        setInterim('');
      };
      recognition.onresult = (event) => {
        let finalChunk = '';
        let interimChunk = '';
        for (let i = event.resultIndex; i < event.results.length; i += 1) {
          const piece = event.results[i][0]?.transcript || '';
          if (event.results[i].isFinal) finalChunk += `${piece} `;
          else interimChunk += piece;
        }
        if (finalChunk.trim()) {
          setTranscript((prev) => `${prev} ${finalChunk}`.replace(/\s+/g, ' ').trim());
        }
        setInterim(interimChunk);
      };

      recognitionRef.current = recognition;
      recognition.start();
      setMinimized(true);
    } catch (err) {
      setError(String(err?.message || err));
      setListening(false);
    }
  };

  const applyTranscriptToForm = () => {
    const text = `${transcript} ${interim}`.trim();
    if (!text) {
      setError(t.emptyTranscript || (es ? 'Aún no hay texto dictado.' : 'Nothing dictated yet.'));
      return;
    }
    stopListening();
    const parsed = parseAppointmentFromOcrText(text, {
      referenceDate,
      locale,
      clinic: activeClinic,
      services,
    });
    setForm({
      patient: parsed.patient || '',
      phone: parsed.phone || '',
      email: parsed.email || '',
      fullDate: parsed.fullDate || '',
      time: parsed.time || '',
      equipment: parsed.equipment || defaultEquipment || '',
      notes: parsed.aiSummary || text,
    });
    setStep('review');
    setMinimized(false);
    setError('');
  };

  const updateField = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));

  const confirm = async () => {
    if (scheduling) return;
    setScheduling(true);
    setError('');
    try {
      await onSchedule?.(form);
    } catch (err) {
      setError(err?.message || t.scheduleError || (es ? 'No se pudo agendar.' : 'Could not book.'));
    } finally {
      setScheduling(false);
    }
  };

  // Barra mínima mientras escucha — deja ver el resto / Split View
  if (minimized && step === 'listen') {
    return (
      <div className="fixed inset-x-2 z-[120000] pointer-events-none" style={{ bottom: 'calc(4.25rem + env(safe-area-inset-bottom, 0px))' }}>
        <div className="pointer-events-auto mx-auto max-w-lg rounded-2xl border border-violet-300 bg-violet-950 text-white shadow-2xl px-3 py-2.5 flex items-center gap-2">
          <span className={`text-lg leading-none ${listening ? 'animate-pulse' : ''}`} aria-hidden>🎤</span>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-black uppercase truncate">
              {listening
                ? (t.listening || (es ? 'Escuchando… mira WhatsApp en Split View' : 'Listening… keep WhatsApp in Split View'))
                : (t.paused || (es ? 'Micrófono pausado' : 'Mic paused'))}
            </p>
            <p className="text-[9px] text-violet-200 truncate normal-case">
              {(interim || transcript || t.hintDictate || (es ? 'Di nombre, fecha, hora y cámara' : 'Say name, date, time, chamber')).slice(0, 80)}
            </p>
          </div>
          {listening ? (
            <button type="button" onClick={stopListening} className="shrink-0 text-[9px] font-black uppercase bg-white/15 px-2 py-1.5 rounded-lg">
              {t.pause || (es ? 'Pausa' : 'Pause')}
            </button>
          ) : (
            <button type="button" onClick={startListening} className="shrink-0 text-[9px] font-black uppercase bg-emerald-500 px-2 py-1.5 rounded-lg">
              {t.resume || (es ? 'Seguir' : 'Resume')}
            </button>
          )}
          <button type="button" onClick={applyTranscriptToForm} className="shrink-0 text-[9px] font-black uppercase bg-indigo-500 px-2 py-1.5 rounded-lg">
            {t.useText || (es ? 'Usar' : 'Use')}
          </button>
          <button type="button" onClick={() => setMinimized(false)} className="shrink-0 text-[9px] font-black uppercase px-2 py-1.5 rounded-lg bg-white/10">
            {t.expand || (es ? '▲' : '▲')}
          </button>
          <button type="button" onClick={onClose} className="shrink-0 text-[9px] font-black uppercase px-2 py-1.5 rounded-lg text-red-200">
            ✕
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[120000] flex items-end sm:items-center justify-center pointer-events-none">
      <button type="button" className="absolute inset-0 bg-slate-900/35 pointer-events-auto" aria-label="Close" onClick={onClose} />
      <div className="pointer-events-auto relative w-full sm:max-w-md max-h-[58dvh] sm:max-h-[80dvh] overflow-y-auto bg-white rounded-t-2xl sm:rounded-3xl shadow-2xl border border-slate-200 p-4 sm:p-6 text-slate-900 modal-sheet">
        <div className="flex items-start justify-between gap-2 mb-3">
          <div className="min-w-0">
            <h3 className="text-base sm:text-lg font-black uppercase tracking-tight">
              {t.title || (es ? 'Agendar por voz' : 'Book by voice')}
            </h3>
            <p className="text-[10px] font-bold text-slate-500 mt-1 leading-snug normal-case">
              {t.subtitle || (es
                ? 'Minimiza el panel y abre WhatsApp en Split View (iPad) o pantalla dividida. El micrófono sigue en OXY.'
                : 'Minimize this panel and open WhatsApp in Split View. The mic stays in OXY.')}
            </p>
          </div>
          <button type="button" onClick={onClose} className="text-2xl font-black text-slate-400 leading-none px-2">×</button>
        </div>

        {error && (
          <p className="text-[11px] font-bold text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2 mb-3">{error}</p>
        )}
        {unsupported && (
          <p className="text-[11px] font-bold text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 mb-3">
            {t.unsupportedHint || (es
              ? 'En iPhone/iPad usa Safari. En Android, Chrome.'
              : 'On iPhone/iPad use Safari. On Android, Chrome.')}
          </p>
        )}

        {step === 'listen' ? (
          <div className="space-y-3">
            <div className="rounded-xl border border-violet-200 bg-violet-50 p-3 min-h-[88px]">
              <p className="text-[9px] font-black uppercase text-violet-800 mb-1">
                {t.transcriptLabel || (es ? 'Dictado' : 'Dictation')}
              </p>
              <p className="text-sm font-bold text-slate-800 whitespace-pre-wrap break-words">
                {transcript || <span className="text-slate-400">{t.waiting || (es ? 'Pulsa micrófono y dicta…' : 'Tap mic and dictate…')}</span>}
                {interim ? <span className="text-violet-500"> {interim}</span> : null}
              </p>
            </div>
            <div className="flex flex-col sm:flex-row gap-2">
              {!listening ? (
                <button type="button" onClick={startListening} className="flex-1 bg-violet-600 text-white font-black uppercase text-xs py-3 rounded-xl shadow">
                  🎤 {t.start || (es ? 'Iniciar micrófono' : 'Start microphone')}
                </button>
              ) : (
                <button type="button" onClick={stopListening} className="flex-1 bg-slate-800 text-white font-black uppercase text-xs py-3 rounded-xl">
                  {t.pause || (es ? 'Pausar' : 'Pause')}
                </button>
              )}
              <button type="button" onClick={() => { setMinimized(true); if (!listening) startListening(); }} className="flex-1 bg-indigo-50 text-indigo-900 border border-indigo-200 font-black uppercase text-xs py-3 rounded-xl">
                {t.minimize || (es ? 'Minimizar (ver WhatsApp)' : 'Minimize (see WhatsApp)')}
              </button>
            </div>
            <button
              type="button"
              disabled={!transcript && !interim}
              onClick={applyTranscriptToForm}
              className="w-full bg-emerald-600 text-white font-black uppercase text-xs py-3 rounded-xl disabled:opacity-40"
            >
              {t.review || (es ? 'Revisar y agendar' : 'Review & book')}
            </button>
            <p className="text-[9px] font-bold text-slate-500 leading-snug">
              {t.example || (es
                ? 'Ejemplo: «María López mañana a las 11:30 cámara 1 teléfono 3312345678»'
                : 'Example: "Maria Lopez tomorrow at 11:30 chamber 1 phone 2815551212"')}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-[10px] font-bold text-slate-500">{t.confirmHint || (es ? 'Revisa y corrige antes de agendar.' : 'Review and edit before booking.')}</p>
            {[
              ['patient', t.patient || (es ? 'Paciente' : 'Patient')],
              ['phone', t.phone || (es ? 'Teléfono' : 'Phone')],
              ['fullDate', t.date || (es ? 'Fecha' : 'Date'), 'date'],
              ['time', t.time || (es ? 'Hora' : 'Time')],
              ['email', t.email || 'Email'],
            ].map(([key, label, type]) => (
              <label key={key} className="block">
                <span className="text-[9px] font-black uppercase text-slate-400">{label}</span>
                <input
                  type={type || 'text'}
                  value={form[key] || ''}
                  onChange={(e) => updateField(key, e.target.value)}
                  className="ios-text-input w-full mt-1 p-2.5 border border-slate-200 rounded-xl font-bold text-slate-900"
                />
              </label>
            ))}
            <label className="block">
              <span className="text-[9px] font-black uppercase text-slate-400">{t.equipment || (es ? 'Equipo' : 'Equipment')}</span>
              <select
                value={form.equipment || ''}
                onChange={(e) => updateField('equipment', e.target.value)}
                className="ios-text-input w-full mt-1 p-2.5 border border-slate-200 rounded-xl font-bold text-slate-900 bg-white"
              >
                <option value="">{es ? 'Elegir…' : 'Choose…'}</option>
                {(services || []).filter((s) => s.is_active).map((s) => (
                  <option key={s.id} value={s.name}>{s.name}</option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-[9px] font-black uppercase text-slate-400">{t.notes || (es ? 'Notas' : 'Notes')}</span>
              <textarea
                value={form.notes || ''}
                onChange={(e) => updateField('notes', e.target.value)}
                rows={2}
                className="ios-text-input w-full mt-1 p-2.5 border border-slate-200 rounded-xl font-bold text-slate-900"
              />
            </label>
            <div className="flex gap-2">
              <button type="button" onClick={() => { setStep('listen'); setMinimized(false); }} className="flex-1 bg-slate-100 font-black uppercase text-xs py-3 rounded-xl">
                {t.back || (es ? 'Volver' : 'Back')}
              </button>
              <button type="button" disabled={scheduling} onClick={confirm} className="flex-1 bg-emerald-600 text-white font-black uppercase text-xs py-3 rounded-xl disabled:opacity-50">
                {scheduling ? '…' : (t.confirmSchedule || (es ? 'Agendar' : 'Book'))}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
