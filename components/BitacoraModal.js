"use client";
import React, { useRef, useState, useEffect } from 'react';

export default function BitacoraModal({ selectedSlot, onClose, onSeal }) {
  const canvasRef = useRef(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasSignature, setHasSignature] = useState(false);
  const [isAgreed, setIsAgreed] = useState(false);
  
  // Signos vitales (Para la auditoría médica)
  const [vitals, setVitals] = useState({ pa: '', temp: '', hr: '' });

  // Configuración inicial del Pad de Firmas
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
      ctx.strokeStyle = '#0f172a'; // Color de tinta (Slate 900)
    }
  }, []);

  const getCoordinates = (e) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    if (e.touches && e.touches.length > 0) {
      return {
        x: e.touches[0].clientX - rect.left,
        y: e.touches[0].clientY - rect.top
      };
    }
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    };
  };

  const startDrawing = (e) => {
    // Previene que el iPad haga scroll al firmar
    if(e.cancelable) e.preventDefault(); 
    const { x, y } = getCoordinates(e);
    const ctx = canvasRef.current.getContext('2d');
    ctx.beginPath();
    ctx.moveTo(x, y);
    setIsDrawing(true);
  };

  const draw = (e) => {
    if (!isDrawing) return;
    if(e.cancelable) e.preventDefault();
    const { x, y } = getCoordinates(e);
    const ctx = canvasRef.current.getContext('2d');
    ctx.lineTo(x, y);
    ctx.stroke();
    setHasSignature(true);
  };

  const stopDrawing = () => {
    if (isDrawing) {
      const ctx = canvasRef.current.getContext('2d');
      ctx.closePath();
      setIsDrawing(false);
    }
  };

  const clearSignature = () => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasSignature(false);
  };

  const handleSeal = () => {
    if (!isAgreed) {
      return alert("🔒 El paciente debe marcar la casilla declarando que se siente en condiciones óptimas.");
    }
    if (!hasSignature) {
      return alert("🔒 Se requiere la firma trazada del paciente para poder sellar la bitácora.");
    }
    
    // Convertir el lienzo en una imagen de código
    const canvas = canvasRef.current;
    const signatureBase64 = canvas.toDataURL('image/png');
    
    // Mandar la firma y los signos al archivo maestro (page.js)
    onSeal(signatureBase64, vitals);
  };

  if (!selectedSlot) return null;

  return (
    <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm flex items-center justify-center p-4 z-[150] overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full my-8 flex flex-col max-h-[95vh] overflow-hidden">
        
        {/* Header Legal */}
        <div className="bg-blue-900 p-6 shrink-0 text-white flex justify-between items-center">
          <div>
            <h2 className="text-2xl font-black uppercase tracking-widest">Bitácora Médica</h2>
            <p className="text-blue-200 text-sm mt-1 font-medium">Registro de Sesión y Trazabilidad - OxyHyperbaric</p>
          </div>
        </div>

        <div className="p-8 space-y-6 overflow-y-auto flex-1">
          
          {/* Información General */}
          <div className="flex flex-col md:flex-row justify-between bg-slate-50 p-4 rounded-xl border border-slate-200 gap-4">
            <div>
              <p className="text-xs text-slate-500 font-bold uppercase">Paciente</p>
              <p className="text-xl font-black text-slate-800 uppercase">{selectedSlot.patient}</p>
              <p className={`text-[10px] font-black mt-1 px-2 py-1 rounded inline-block uppercase tracking-widest ${selectedSlot.protocol === 'Médico' ? 'bg-red-100 text-red-700 border border-red-200' : 'bg-emerald-100 text-emerald-700 border border-emerald-200'}`}>
                {selectedSlot.protocol}
              </p>
            </div>
            <div className="text-left md:text-right">
              <p className="text-xs text-slate-500 font-bold uppercase">Fecha y Equipo</p>
              <p className="text-lg font-black text-slate-800 uppercase">{selectedSlot.day} • {selectedSlot.time}</p>
              <p className="text-[10px] font-black tracking-widest uppercase text-blue-600 bg-blue-50 px-2 py-1 rounded inline-block mt-1">{selectedSlot.equipment}</p>
            </div>
          </div>

          {/* MÓDULO: Signos Vitales */}
          {selectedSlot.protocol === 'Médico' && (
            <div className="border-l-4 border-red-500 pl-4 bg-red-50 p-4 rounded-r-xl">
              <h3 className="text-sm font-black text-red-800 uppercase tracking-widest mb-3 flex items-center">
                🩺 Signos Vitales (Obligatorio)
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-[10px] font-black uppercase text-red-700 mb-1">Presión Arterial</label>
                  <input type="text" placeholder="120/80" value={vitals.pa} onChange={e => setVitals({...vitals, pa: e.target.value})} className="w-full bg-white border border-red-200 rounded-lg p-2 font-bold focus:border-red-500 focus:outline-none text-xs" />
                </div>
                <div>
                  <label className="block text-[10px] font-black uppercase text-red-700 mb-1">Temperatura</label>
                  <input type="text" placeholder="36.5" value={vitals.temp} onChange={e => setVitals({...vitals, temp: e.target.value})} className="w-full bg-white border border-red-200 rounded-lg p-2 font-bold focus:border-red-500 focus:outline-none text-xs" />
                </div>
                <div>
                  <label className="block text-[10px] font-black uppercase text-red-700 mb-1">Ritmo Cardíaco</label>
                  <input type="number" placeholder="75" value={vitals.hr} onChange={e => setVitals({...vitals, hr: e.target.value})} className="w-full bg-white border border-red-200 rounded-lg p-2 font-bold focus:border-red-500 focus:outline-none text-xs" />
                </div>
              </div>
            </div>
          )}

          {/* Declaración del Paciente */}
          <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
            <label className="flex items-start space-x-3 cursor-pointer">
              <input type="checkbox" checked={isAgreed} onChange={e => setIsAgreed(e.target.checked)} className="mt-1 w-5 h-5 text-blue-600 border-slate-300 rounded cursor-pointer shrink-0" />
              <span className="text-xs text-slate-700 font-bold uppercase leading-relaxed">
                Declaro que me siento en condiciones óptimas para recibir la sesión de oxigenación hiperbárica en cámara presurizada
                {selectedSlot.protocol === 'Médico' && (
                  <span className="text-red-600"> Y CONFIRMO QUE MIS NIVELES DE GLUCOSA SON LOS ADECUADOS EN ESTE MOMENTO</span>
                )}.
              </span>
            </label>
          </div>

          {/* Firma Digital Integrada */}
          <div>
            <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest mb-2">Firma de Conformidad del Paciente</h3>
            <div className="relative border-2 border-dashed border-slate-300 rounded-xl bg-slate-50 overflow-hidden touch-none">
              <canvas
                ref={canvasRef}
                onMouseDown={startDrawing}
                onMouseMove={draw}
                onMouseUp={stopDrawing}
                onMouseLeave={stopDrawing}
                onTouchStart={startDrawing}
                onTouchMove={draw}
                onTouchEnd={stopDrawing}
                className="w-full h-40 cursor-crosshair bg-white"
              />
              {!hasSignature && (
                <div className="absolute inset-0 pointer-events-none flex items-center justify-center text-slate-300 font-black uppercase text-2xl opacity-50 tracking-widest">
                  Firme Aquí
                </div>
              )}
            </div>
            <div className="flex justify-end mt-2">
              <button onClick={clearSignature} className="text-[10px] font-black uppercase text-red-500 hover:text-red-700 transition flex items-center gap-1">
                🗑️ Borrar Firma y Repetir
              </button>
            </div>
          </div>

        </div>

        {/* Footer de Acciones */}
        <div className="bg-slate-50 border-t border-slate-200 p-6 shrink-0 flex justify-between items-center">
            <div>
              <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest">Operador a Cargo</p>
              <p className="text-sm font-black text-slate-800 uppercase">{selectedSlot.attendant}</p>
            </div>
            <div className="flex space-x-3">
              <button onClick={onClose} className="px-6 py-3 text-xs font-black uppercase text-slate-600 bg-white border border-slate-300 rounded-xl hover:bg-slate-100 transition shadow-sm">Cancelar</button>
              
              <button onClick={handleSeal} className="px-6 py-3 text-xs font-black uppercase text-white bg-emerald-600 rounded-xl hover:bg-emerald-700 shadow-lg transition flex items-center gap-2">
                🔒 Sellar Bitácora
              </button>
            </div>
        </div>

      </div>
    </div>
  );
}