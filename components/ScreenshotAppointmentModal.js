'use client';

import React, { useEffect, useRef, useState } from 'react';
import { parseAppointmentFromOcrText } from '../lib/screenshotAppointmentParse';

const MAX_FILE_BYTES = 4 * 1024 * 1024;

export default function ScreenshotAppointmentModal({
  open,
  onClose,
  locale,
  labels,
  services = [],
  defaultEquipment = '',
  referenceDate = '',
  onSchedule,
}) {
  const fileRef = useRef(null);
  const [step, setStep] = useState('upload');
  const [previewUrl, setPreviewUrl] = useState('');
  const [error, setError] = useState('');
  const [progress, setProgress] = useState('');
  const [form, setForm] = useState({
    patient: '',
    phone: '',
    email: '',
    fullDate: '',
    time: '',
    equipment: defaultEquipment,
    notes: '',
    confidence: 'medium',
    aiSummary: '',
  });
  const [scheduling, setScheduling] = useState(false);

  const reset = () => {
    setStep('upload');
    setPreviewUrl('');
    setError('');
    setProgress('');
    setForm({
      patient: '',
      phone: '',
      email: '',
      fullDate: '',
      time: '',
      equipment: defaultEquipment,
      notes: '',
      confidence: 'medium',
      aiSummary: '',
    });
    setScheduling(false);
    if (fileRef.current) fileRef.current.value = '';
  };

  useEffect(() => {
    if (!open) reset();
  }, [open, defaultEquipment]);

  if (!open) return null;

  const t = labels;

  const readFile = (file) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setError(t.invalidImage);
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      setError(t.imageTooLarge);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setPreviewUrl(String(reader.result || ''));
      setError('');
    };
    reader.onerror = () => setError(t.readError);
    reader.readAsDataURL(file);
  };

  const analyze = async () => {
    if (!previewUrl) {
      setError(t.pickImage);
      return;
    }
    setStep('processing');
    setError('');
    setProgress(t.analyzing);
    try {
      const { recognize } = await import('tesseract.js');
      const lang = locale === 'en' ? 'eng' : 'spa+eng';
      const { data: { text } } = await recognize(previewUrl, lang, {
        logger: (m) => {
          if (m.status === 'recognizing text' && m.progress) {
            setProgress(`${t.analyzing} ${Math.round(m.progress * 100)}%`);
          }
        },
      });

      const ex = parseAppointmentFromOcrText(text, { referenceDate, locale });
      if (!ex.patient && !ex.fullDate && !ex.time) {
        throw new Error(t.analyzeError);
      }

      const firstSrv = services.find((s) => s.is_active) || services[0];
      setForm({
        patient: ex.patient || '',
        phone: ex.phone || '',
        email: ex.email || '',
        fullDate: ex.fullDate || '',
        time: ex.time || '',
        equipment: defaultEquipment || firstSrv?.name || '',
        notes: ex.notes || '',
        confidence: ex.confidence || 'medium',
        aiSummary: ex.aiSummary || '',
      });
      setStep('review');
    } catch (err) {
      setError(err?.message || t.analyzeError);
      setStep('upload');
    } finally {
      setProgress('');
    }
  };

  const schedule = async () => {
    if (!form.patient?.trim() || !form.fullDate || !form.time || !form.equipment) {
      setError(t.missingFields);
      return;
    }
    setScheduling(true);
    setError('');
    try {
      await onSchedule?.({ ...form });
    } catch (err) {
      setError(err?.message || t.scheduleError);
      setScheduling(false);
    }
  };

  const confidenceLabel = {
    high: t.confidenceHigh,
    medium: t.confidenceMedium,
    low: t.confidenceLow,
  }[form.confidence] || form.confidence;

  return (
    <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 z-[10001]">
      <div className="bg-white rounded-t-2xl sm:rounded-3xl max-w-md w-full max-h-[92dvh] flex flex-col shadow-2xl border overflow-hidden text-slate-900">
        <div className="bg-slate-50 px-4 sm:px-6 py-4 border-b flex justify-between items-start gap-3 shrink-0">
          <div className="min-w-0">
            <h3 className="text-base sm:text-lg font-black uppercase text-indigo-700">{t.title}</h3>
            <p className="text-[10px] font-bold text-slate-500 mt-1 leading-snug">{t.subtitle}</p>
          </div>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-800 text-2xl font-black leading-none">&times;</button>
        </div>

        <div className="p-4 sm:p-6 overflow-y-auto flex-1 space-y-4 min-h-0">
          {step === 'upload' && (
            <>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => readFile(e.target.files?.[0])}
              />
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="w-full border-2 border-dashed border-indigo-300 rounded-2xl p-6 text-center hover:bg-indigo-50/50 transition"
              >
                <span className="text-3xl block mb-2" aria-hidden>📷</span>
                <span className="block text-xs font-black uppercase text-indigo-800">{t.pickImage}</span>
                <span className="block text-[10px] font-bold text-slate-500 mt-2">{t.pickImageHint}</span>
              </button>
              {previewUrl ? (
                <img src={previewUrl} alt="" className="w-full max-h-48 object-contain rounded-xl border border-slate-200 bg-slate-50" />
              ) : null}
            </>
          )}

          {step === 'processing' && (
            <div className="py-10 text-center">
              <div className="w-12 h-12 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin mx-auto mb-4" />
              <p className="text-sm font-black uppercase text-slate-700">{progress || t.analyzing}</p>
              <p className="text-[10px] font-bold text-slate-500 mt-2">{t.processingHint}</p>
            </div>
          )}

          {step === 'review' && (
            <>
              {previewUrl ? (
                <img src={previewUrl} alt="" className="w-full max-h-32 object-contain rounded-xl border border-slate-200 bg-slate-50" />
              ) : null}
              <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-3">
                <p className="text-[10px] font-black uppercase text-indigo-900">{t.recognizedTitle}</p>
                {form.aiSummary ? (
                  <p className="text-xs font-bold text-indigo-800 mt-1 normal-case">{form.aiSummary}</p>
                ) : null}
                <p className="text-[9px] font-bold text-indigo-700/80 mt-2 uppercase">
                  {t.confidenceLabel}: {confidenceLabel}
                </p>
              </div>
              <div>
                <label className="text-[10px] font-black uppercase text-slate-500">{t.patient}</label>
                <input type="text" value={form.patient} onChange={(e) => setForm((p) => ({ ...p, patient: e.target.value }))} className="w-full p-2.5 border rounded-xl font-bold text-sm mt-1" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] font-black uppercase text-slate-500">{t.date}</label>
                  <input type="date" value={form.fullDate} onChange={(e) => setForm((p) => ({ ...p, fullDate: e.target.value }))} className="w-full p-2.5 border rounded-xl font-bold text-sm mt-1" />
                </div>
                <div>
                  <label className="text-[10px] font-black uppercase text-slate-500">{t.time}</label>
                  <input type="text" value={form.time} onChange={(e) => setForm((p) => ({ ...p, time: e.target.value }))} placeholder="09:00 AM" className="w-full p-2.5 border rounded-xl font-bold text-sm mt-1" />
                </div>
              </div>
              <div>
                <label className="text-[10px] font-black uppercase text-slate-500">{t.phone}</label>
                <input type="tel" value={form.phone} onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))} className="w-full p-2.5 border rounded-xl font-bold text-sm mt-1" />
              </div>
              <div>
                <label className="text-[10px] font-black uppercase text-slate-500">{t.equipment}</label>
                <select value={form.equipment} onChange={(e) => setForm((p) => ({ ...p, equipment: e.target.value }))} className="w-full p-2.5 border rounded-xl font-bold text-sm mt-1 uppercase">
                  {services.filter((s) => s.is_active).map((s) => (
                    <option key={s.id} value={s.name}>{s.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-[10px] font-black uppercase text-slate-500">{t.notes}</label>
                <textarea value={form.notes} onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))} rows={2} className="w-full p-2.5 border rounded-xl font-bold text-xs mt-1" />
              </div>
              <p className="text-[10px] font-bold text-slate-500 leading-snug">{t.confirmHint}</p>
            </>
          )}

          {error ? (
            <p className="text-xs font-bold text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2">{error}</p>
          ) : null}
        </div>

        <div className="p-4 sm:px-6 border-t bg-slate-50 flex gap-2 shrink-0">
          {step === 'upload' && (
            <>
              <button type="button" onClick={onClose} className="flex-1 bg-white border border-slate-300 font-black py-3 rounded-xl uppercase text-xs">{t.cancel}</button>
              <button type="button" disabled={!previewUrl} onClick={analyze} className="flex-1 bg-indigo-600 text-white font-black py-3 rounded-xl uppercase text-xs disabled:opacity-50">{t.analyze}</button>
            </>
          )}
          {step === 'review' && (
            <>
              <button type="button" disabled={scheduling} onClick={() => setStep('upload')} className="flex-1 bg-white border border-slate-300 font-black py-3 rounded-xl uppercase text-xs">{t.back}</button>
              <button type="button" disabled={scheduling} onClick={schedule} className="flex-1 bg-emerald-600 text-white font-black py-3 rounded-xl uppercase text-xs disabled:opacity-60">
                {scheduling ? '...' : t.confirmSchedule}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
