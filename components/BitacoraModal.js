"use client";
import React from 'react';
import SignaturePad from './SignaturePad';

export default function BitacoraModal({ selectedSlot, onClose, onSeal }) {
  if (!selectedSlot) return null;

  return (
    <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm flex items-center justify-center p-4 z-[70] overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full my-8">
        
        {/* Header Legal */}
        <div className="bg-blue-900 p-6 rounded-t-2xl text-white flex justify-between items-center">
          <div>
            <h2 className="text-2xl font-black uppercase tracking-widest">Bitácora</h2>
            <p className="text-blue-200 text-sm mt-1 font-medium">Registro de Sesión y Trazabilidad - OxyHyperbaric</p>
          </div>
          <img src="/1c3300f3-f5e7-4682-b627-257e868ed467.jpg" alt="Logo" className="h-12 w-auto object-contain bg-white rounded p-1" />
        </div>

        <div className="p-8 space-y-8">
          
          {/* Información General */}
          <div className="flex flex-col md:flex-row justify-between bg-slate-50 p-4 rounded-xl border border-slate-200 gap-4">
            <div>
              <p className="text-xs text-slate-500 font-bold uppercase">Paciente</p>
              <p className="text-xl font-bold text-slate-800">{selectedSlot.patient}</p>
              <p className={`text-sm font-bold mt-1 px-2 py-0.5 rounded inline-block ${selectedSlot.protocol === 'Médico' ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
                {selectedSlot.protocol}
              </p>
            </div>
            <div className="text-left md:text-right">
              <p className="text-xs text-slate-500 font-bold uppercase">Fecha y Equipo</p>
              <p className="text-lg font-bold text-slate-800">{selectedSlot.day} • {selectedSlot.time}</p>
              <p className="text-sm font-bold text-blue-600">{selectedSlot.equipment}</p>
            </div>
          </div>

          {/* MÓDULO: Signos Vitales */}
          {selectedSlot.protocol === 'Médico' && (
            <div className="border-l-4 border-red-500 pl-4">
              <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center">
                🩺 Signos Vitales
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1">Presión Arterial</label>
                  <input type="text" placeholder="120/80" className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 font-medium focus:border-blue-500 focus:outline-none" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1">Temperatura</label>
                  <input type="text" placeholder="36.5" className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 font-medium focus:border-blue-500 focus:outline-none" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1">Ritmo Cardíaco</label>
                  <input type="number" placeholder="75" className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 font-medium focus:border-blue-500 focus:outline-none" />
                </div>
              </div>
            </div>
          )}

          {/* Declaración del Paciente */}
          <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
            <label className="flex items-start space-x-3 cursor-pointer">
              <input type="checkbox" className="mt-1 w-5 h-5 text-blue-600 border-gray-300 rounded cursor-pointer" />
              <span className="text-sm text-slate-700 font-medium">
                Declaro que me siento en condiciones óptimas para recibir la sesión
                {selectedSlot.protocol === 'Médico' && (
                  <span> y confirmo que mis niveles de glucosa son los adecuados en este momento</span>
                )}.
              </span>
            </label>
          </div>

          {/* Firma Digital */}
          <div>
            <h3 className="text-lg font-bold text-slate-800 mb-2">Firma de Conformidad</h3>
            <SignaturePad />
          </div>

          <div className="flex justify-between items-center border-t border-slate-200 pt-6">
            <div>
              <p className="text-xs text-slate-400 font-bold uppercase">Operador Certificado</p>
              <p className="text-sm font-black text-slate-800 uppercase">Yarian Cuenca</p>
              <p className="text-xs font-bold text-blue-600">Técnico IBUM</p>
            </div>
            <div className="flex space-x-3">
              <button onClick={onClose} className="px-6 py-3 font-bold text-slate-600 bg-slate-100 rounded-xl hover:bg-slate-200 transition">Cancelar</button>
              
              {/* NUEVO: Al hacer clic, ejecuta la orden de sellar (onSeal) */}
              <button onClick={onSeal} className="px-6 py-3 font-bold text-white bg-green-600 rounded-xl hover:bg-green-700 shadow-md transition">
                🔒 Sellar y Activar Sesión
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}