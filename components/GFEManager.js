"use client";
import React, { useState } from 'react';

export default function GFEManager({ patients, onUpdatePatient }) {
  const [filter, setFilter] = useState('');

  const filteredPatients = patients.filter(p => 
    p.patient.toLowerCase().includes(filter.toLowerCase())
  );

  return (
    <div className="flex flex-col h-full bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
      {/* Header del Módulo */}
      <div className="p-6 border-b border-slate-200 bg-slate-50 flex justify-between items-center">
        <div>
          <h2 className="text-xl font-black text-slate-800 uppercase tracking-tight">Control de GFE & Consentimientos</h2>
          <p className="text-sm text-slate-500 font-medium">Validación de aptitud clínica y legal para Protocolo Médico</p>
        </div>
        <div className="flex gap-4">
          <input 
            type="text" 
            placeholder="Buscar paciente..." 
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="bg-white border border-slate-300 rounded-lg px-4 py-2 text-sm focus:border-blue-500 outline-none w-64 shadow-sm"
          />
        </div>
      </div>

      {/* Tabla de Control (HTML Nativo para mayor control estético) */}
      <div className="flex-1 overflow-auto p-4">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-slate-200 text-[10px] font-black text-slate-400 uppercase tracking-widest">
              <th className="py-3 px-4">Paciente</th>
              <th className="py-3 px-4">Estado GFE</th>
              <th className="py-3 px-4">Vigencia GFE</th>
              <th className="py-3 px-4">Consentimiento (SignNow)</th>
              <th className="py-3 px-4 text-right">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filteredPatients.map(p => (
              <tr key={p.id} className="hover:bg-slate-50 transition-colors">
                <td className="py-4 px-4 font-bold text-slate-800">{p.patient}</td>
                <td className="py-4 px-4">
                  {p.gfeStatus === 'Activo' ? (
                    <span className="bg-emerald-100 text-emerald-700 text-[10px] font-black px-2 py-1 rounded-full border border-emerald-200">✅ AUTORIZADO</span>
                  ) : (
                    <span className="bg-red-100 text-red-700 text-[10px] font-black px-2 py-1 rounded-full border border-red-200">⚠️ PENDIENTE</span>
                  )}
                </td>
                <td className="py-4 px-4 text-sm font-medium text-slate-600">
                  {p.gfeExpiration || 'N/A'}
                </td>
                <td className="py-4 px-4">
                  {p.consentSigned ? (
                    <span className="text-emerald-600 font-bold text-xs flex items-center gap-1">✔️ Firmado</span>
                  ) : (
                    <button className="text-blue-600 hover:underline font-bold text-xs">Vincular SignNow</button>
                  )}
                </td>
                <td className="py-4 px-4 text-right space-x-2">
                  <button className="bg-slate-900 text-white text-[10px] font-black px-3 py-1.5 rounded hover:bg-slate-800 transition uppercase">Cargar PDF</button>
                  <button className="bg-blue-600 text-white text-[10px] font-black px-3 py-1.5 rounded hover:bg-blue-700 transition uppercase">Examen Digital</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}