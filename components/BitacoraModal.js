"use client";
import React, { useRef, useState, useEffect, useMemo } from 'react';
import { useStaffLocale } from './StaffLocaleContext';
import { buildSessionSummary, formatSessionSummaryLines } from '../lib/sessionSummary';

export default function BitacoraModal({ selectedSlot, sessionSummary, onClose, onSeal }) {
  const { L } = useStaffLocale();
  const t = L.modals.bitacora;

  const canvasRef = useRef(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasSignature, setHasSignature] = useState(false);
  const [isAgreed, setIsAgreed] = useState(true);
  const [vitals, setVitals] = useState({ pa: '', temp: '', hr: '' });

  const summaryLines = useMemo(() => {
    const built = sessionSummary || buildSessionSummary({
      historicoSesiones: selectedSlot?.historicoSesiones,
      adeudo: selectedSlot?.adeudo,
      wallets: selectedSlot?.wallets,
      packageHistory: selectedSlot?.packageHistory,
      equipment: selectedSlot?.equipment,
      servicePrice: selectedSlot?.servicePrice,
      sessionGroup: selectedSlot?.sessionGroup,
      groupMembers: selectedSlot?.groupMembers,
      patientName: selectedSlot?.patient,
    });
    return formatSessionSummaryLines(built, t);
  }, [sessionSummary, selectedSlot, t]);

  const statusToneClass = summaryLines.tone === 'debt'
    ? 'bg-orange-100 border-orange-400 text-orange-950'
    : summaryLines.tone === 'ok'
      ? 'bg-emerald-50 border-emerald-300 text-emerald-900'
      : 'bg-amber-50 border-amber-300 text-amber-900';

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas) {
      canvas.width = canvas.offsetWidth * 2;
      canvas.height = canvas.offsetHeight * 2;
      const ctx = canvas.getContext('2d');
      ctx.scale(2, 2);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.lineWidth = 3;
      ctx.strokeStyle = '#0f172a';
    }
  }, []);

  const getCoordinates = (e) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    if (e.touches?.length) {
      return { x: e.touches[0].clientX - rect.left, y: e.touches[0].clientY - rect.top };
    }
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const startDrawing = (e) => {
    if (e.cancelable) e.preventDefault();
    const { x, y } = getCoordinates(e);
    const ctx = canvasRef.current.getContext('2d');
    ctx.beginPath();
    ctx.moveTo(x, y);
    setIsDrawing(true);
  };

  const draw = (e) => {
    if (!isDrawing) return;
    if (e.cancelable) e.preventDefault();
    const { x, y } = getCoordinates(e);
    const ctx = canvasRef.current.getContext('2d');
    ctx.lineTo(x, y);
    ctx.stroke();
    setHasSignature(true);
  };

  const stopDrawing = () => {
    if (isDrawing) {
      canvasRef.current.getContext('2d').closePath();
      setIsDrawing(false);
    }
  };

  const clearSignature = () => {
    const canvas = canvasRef.current;
    canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
    setHasSignature(false);
  };

  const handleSeal = () => {
    if (!isAgreed) return alert(t.needAgreement);
    if (!hasSignature) return alert(t.needSignature);
    onSeal(canvasRef.current.toDataURL('image/png'), vitals, summaryLines);
  };

  if (!selectedSlot) return null;

  return (
    <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 z-[150] overflow-y-auto">
      <div className="bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl max-w-2xl w-full sm:my-8 flex flex-col max-h-[92dvh] sm:max-h-[95vh] overflow-hidden">
        <div className="bg-blue-900 p-4 sm:p-6 shrink-0 text-white">
          <h2 className="text-lg sm:text-2xl font-black uppercase tracking-widest">{t.title}</h2>
          <p className="text-blue-200 text-xs sm:text-sm mt-1 font-medium">{t.subtitle}</p>
        </div>

        <div className="p-4 sm:p-8 space-y-4 sm:space-y-6 overflow-y-auto flex-1 min-h-0">
          <div className="flex flex-col md:flex-row justify-between bg-slate-50 p-4 rounded-xl border border-slate-200 gap-4">
            <div>
              <p className="text-xs text-slate-500 font-bold uppercase">{t.patient}</p>
              <p className="text-xl font-black text-slate-800 uppercase">{selectedSlot.patient}</p>
              <p className="text-[10px] font-black mt-1 px-2 py-1 rounded inline-block uppercase bg-emerald-100 text-emerald-700">{selectedSlot.protocol}</p>
            </div>
            <div className="md:text-right">
              <p className="text-xs text-slate-500 font-bold uppercase">{t.dateEquipment}</p>
              <p className="text-lg font-black text-slate-800 uppercase">{selectedSlot.day} · {selectedSlot.time}</p>
              <p className="text-[10px] font-black text-blue-600 bg-blue-50 px-2 py-1 rounded inline-block mt-1">{selectedSlot.equipment}</p>
            </div>
          </div>

          <div className={`p-4 rounded-xl border-2 ${statusToneClass}`}>
            <p className="text-[10px] font-black uppercase tracking-widest opacity-80 mb-1">
              {selectedSlot.sessionGroup?.name ? `${t.sharedLabel} · ${t.sessionStatusTitle}` : t.sessionStatusTitle}
            </p>
            <p className="text-sm font-black uppercase leading-snug">{summaryLines.headline}</p>
            {summaryLines.detail ? (
              <p className="text-[10px] font-bold uppercase mt-2 leading-relaxed opacity-90">{summaryLines.detail}</p>
            ) : null}
          </div>

          {selectedSlot.protocol === 'Médico' && (
            <div className="border-l-4 border-red-500 pl-4 bg-red-50 p-4 rounded-r-xl">
              <h3 className="text-sm font-black text-red-800 uppercase mb-3">{t.vitalsTitle}</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-[10px] font-black uppercase text-red-700 mb-1">{t.bloodPressure}</label>
                  <input type="text" placeholder="120/80" value={vitals.pa} onChange={(e) => setVitals({ ...vitals, pa: e.target.value })} className="w-full bg-white border border-red-200 rounded-lg p-2 font-bold text-xs" />
                </div>
                <div>
                  <label className="block text-[10px] font-black uppercase text-red-700 mb-1">{t.temperature}</label>
                  <input type="text" placeholder="36.5" value={vitals.temp} onChange={(e) => setVitals({ ...vitals, temp: e.target.value })} className="w-full bg-white border border-red-200 rounded-lg p-2 font-bold text-xs" />
                </div>
                <div>
                  <label className="block text-[10px] font-black uppercase text-red-700 mb-1">{t.heartRate}</label>
                  <input type="number" placeholder="75" value={vitals.hr} onChange={(e) => setVitals({ ...vitals, hr: e.target.value })} className="w-full bg-white border border-red-200 rounded-lg p-2 font-bold text-xs" />
                </div>
              </div>
            </div>
          )}

          <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
            <label className="flex items-start space-x-3 cursor-pointer">
              <input type="checkbox" checked={isAgreed} onChange={(e) => setIsAgreed(e.target.checked)} className="mt-1 w-5 h-5 shrink-0" />
              <span className="text-xs text-slate-700 font-bold uppercase leading-relaxed">
                {t.declaration}
                {selectedSlot.protocol === 'Médico' && <span className="text-red-600">{t.glucoseClause}</span>}.
              </span>
            </label>
          </div>

          <div>
            <h3 className="text-sm font-black text-slate-800 uppercase mb-2">{t.signatureTitle}</h3>
            <div className="relative border-2 border-dashed border-slate-300 rounded-xl overflow-hidden touch-none">
              <canvas ref={canvasRef} onMouseDown={startDrawing} onMouseMove={draw} onMouseUp={stopDrawing} onMouseLeave={stopDrawing} onTouchStart={startDrawing} onTouchMove={draw} onTouchEnd={stopDrawing} className="w-full h-40 cursor-crosshair bg-white" />
              {!hasSignature && (
                <div className="absolute inset-0 pointer-events-none flex items-center justify-center text-slate-300 font-black uppercase text-2xl opacity-50">{t.signHere}</div>
              )}
            </div>
            <button type="button" onClick={clearSignature} className="text-[10px] font-black uppercase text-red-500 mt-2">{t.clearSignature}</button>
          </div>
        </div>

        <div className="bg-slate-50 border-t p-6 shrink-0 flex justify-between items-center">
          <div>
            <p className="text-[10px] text-slate-400 font-black uppercase">{t.operator}</p>
            <p className="text-sm font-black text-slate-800 uppercase">{selectedSlot.attendant}</p>
          </div>
          <div className="flex space-x-3">
            <button type="button" onClick={onClose} className="px-6 py-3 text-xs font-black uppercase border rounded-xl bg-white">{t.cancel}</button>
            <button type="button" onClick={handleSeal} className="px-6 py-3 text-xs font-black uppercase text-white bg-emerald-600 rounded-xl">{t.seal}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
