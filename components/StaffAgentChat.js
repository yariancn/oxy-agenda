'use client';

import React, { useEffect, useRef, useState } from 'react';

export default function StaffAgentChat({
  open,
  onClose,
  activeClinic,
  locale = 'es',
  labels = {},
  isMaster = false,
}) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [adminBanner, setAdminBanner] = useState('');
  const bottomRef = useRef(null);

  const t = {
    title: labels.title || (locale === 'en' ? 'Staff assistant' : 'Asistente staff'),
    subtitle: labels.subtitle || (locale === 'en' ? 'Operations, schedule and reports (by access level)' : 'Operación, agenda y reportes (según tu nivel)'),
    placeholder: labels.placeholder || (locale === 'en' ? 'Ask something…' : 'Pregunta algo…'),
    send: labels.send || (locale === 'en' ? 'Send' : 'Enviar'),
    close: labels.close || (locale === 'en' ? 'Close' : 'Cerrar'),
    welcome: labels.welcome || (locale === 'en'
      ? 'Hi. Ask app how-tos or a quick HBOT screen: "HBOT contraindications", "UHMS indications", "today\'s schedule", "find patient Garcia".'
      : 'Hola. Pregunta cómo usar la agenda o cribado OHB: «contraindicaciones hiperbárica», «indicaciones UHMS», «agenda de hoy», «buscar paciente García».'),
    thinking: labels.thinking || (locale === 'en' ? 'Thinking…' : 'Pensando…'),
    error: labels.error || (locale === 'en' ? 'Could not reach assistant.' : 'No pude contactar al asistente.'),
  };

  useEffect(() => {
    if (!open) return;
    setMessages([{ role: 'assistant', text: t.welcome }]);
    setInput('');
    setAdminBanner('');
  }, [open, locale]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  const send = async () => {
    const text = input.trim();
    if (!text || loading) return;
    setInput('');
    setMessages((prev) => [...prev, { role: 'user', text }]);
    setLoading(true);
    try {
      const res = await fetch('/api/staff/agent', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, activeClinic, locale }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || t.error);
      if (isMaster && data.adminAlert?.shouldNotify) {
        setAdminBanner(data.adminAlert.title);
      }
      setMessages((prev) => [...prev, { role: 'assistant', text: data.reply || t.error, denied: data.denied }]);
    } catch (err) {
      setMessages((prev) => [...prev, { role: 'assistant', text: err?.message || t.error, error: true }]);
    } finally {
      setLoading(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 z-[10002]">
      <div className="bg-white rounded-t-2xl sm:rounded-3xl max-w-lg w-full h-[min(88dvh,640px)] flex flex-col shadow-2xl border overflow-hidden text-slate-900">
        <div className="bg-gradient-to-r from-violet-700 to-indigo-700 px-4 sm:px-6 py-4 text-white flex justify-between items-start gap-3 shrink-0">
          <div className="min-w-0">
            <h3 className="text-base sm:text-lg font-black uppercase">🤖 {t.title}</h3>
            <p className="text-[10px] font-bold text-violet-100 mt-1 leading-snug">{t.subtitle}</p>
          </div>
          <button type="button" onClick={onClose} className="text-violet-200 hover:text-white text-2xl font-black leading-none">&times;</button>
        </div>

        {adminBanner ? (
          <div className="shrink-0 bg-amber-50 border-b border-amber-200 px-4 py-2 text-[10px] font-bold text-amber-900">
            ⚠️ {adminBanner}
          </div>
        ) : null}

        <div className="flex-1 overflow-y-auto p-4 space-y-3 min-h-0 bg-slate-50">
          {messages.map((m, i) => (
            <div
              key={i}
              className={`max-w-[90%] rounded-2xl px-3 py-2 text-sm font-medium whitespace-pre-wrap ${
                m.role === 'user'
                  ? 'ml-auto bg-indigo-600 text-white'
                  : m.denied
                    ? 'bg-red-50 text-red-800 border border-red-200'
                    : m.error
                      ? 'bg-red-50 text-red-700 border border-red-200'
                      : 'bg-white text-slate-800 border border-slate-200 shadow-sm'
              }`}
            >
              {m.text}
            </div>
          ))}
          {loading ? (
            <p className="text-xs font-bold text-slate-500 animate-pulse">{t.thinking}</p>
          ) : null}
          <div ref={bottomRef} />
        </div>

        <div className="p-3 sm:p-4 border-t bg-white flex gap-2 shrink-0 safe-area-bottom">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && send()}
            placeholder={t.placeholder}
            className="flex-1 p-3 border border-slate-300 rounded-xl font-bold text-sm outline-none focus:border-indigo-500"
            disabled={loading}
          />
          <button
            type="button"
            onClick={send}
            disabled={loading || !input.trim()}
            className="bg-indigo-600 text-white font-black px-4 rounded-xl uppercase text-xs disabled:opacity-50"
          >
            {t.send}
          </button>
        </div>
      </div>
    </div>
  );
}
