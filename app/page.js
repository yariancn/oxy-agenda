import React from 'react';

export default function CalendarView() {
  // Configuración de horarios basada en las reglas operativas
  const chamberSlots = [
    '07:30 AM', '09:00 AM', '10:30 AM', '12:00 PM', 
    '01:30 PM', '03:00 PM', '04:30 PM', '06:00 PM'
  ];

  const redLightSlots = [
    '07:30 AM', '08:30 AM', '09:30 AM', '10:30 AM', 
    '11:30 AM', '12:30 PM', '01:30 PM', '02:30 PM', 
    '03:30 PM', '04:30 PM', '05:30 PM', '06:30 PM'
  ];

  return (
    <div className="min-h-screen bg-slate-50 p-8 font-sans">
      {/* Header del Calendario */}
      <div className="mb-8 flex items-center justify-between bg-white p-6 rounded-lg shadow-sm border border-slate-100">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Agenda Clínica</h1>
          <p className="text-slate-500">Vista Diaria de Equipos</p>
        </div>
        <div className="flex space-x-4 items-center">
          <button className="px-4 py-2 text-sm font-medium text-slate-600 bg-slate-100 rounded hover:bg-slate-200 transition">
            Anterior
          </button>
          <span className="text-lg font-semibold text-blue-900">
            Hoy, 24 de Abril
          </span>
          <button className="px-4 py-2 text-sm font-medium text-slate-600 bg-slate-100 rounded hover:bg-slate-200 transition">
            Siguiente
          </button>
        </div>
      </div>

      {/* Grid de Equipos */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        
        {/* Columna: Cámara 1 (Sentado) */}
        <div className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden">
          <div className="bg-blue-900 px-4 py-3 border-b border-blue-800">
            <h2 className="text-white font-semibold text-lg">Cámara 1 (Sentado)</h2>
            <p className="text-blue-200 text-sm">Bloques de 90 min</p>
          </div>
          <div className="p-4 space-y-3">
            {chamberSlots.map((time, index) => (
              <div key={`c1-${index}`} className="flex items-center justify-between p-3 rounded border border-slate-100 hover:border-blue-300 hover:bg-blue-50 transition cursor-pointer">
                <span className="text-slate-700 font-medium">{time}</span>
                <span className="text-xs font-semibold px-2 py-1 bg-green-100 text-green-700 rounded-full">Disponible</span>
              </div>
            ))}
          </div>
        </div>

        {/* Columna: Cámara 2 (Acostado) */}
        <div className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden">
          <div className="bg-blue-900 px-4 py-3 border-b border-blue-800">
            <h2 className="text-white font-semibold text-lg">Cámara 2 (Acostado)</h2>
            <p className="text-blue-200 text-sm">Bloques de 90 min</p>
          </div>
          <div className="p-4 space-y-3">
            {chamberSlots.map((time, index) => (
              <div key={`c2-${index}`} className="flex items-center justify-between p-3 rounded border border-slate-100 hover:border-blue-300 hover:bg-blue-50 transition cursor-pointer">
                <span className="text-slate-700 font-medium">{time}</span>
                <span className="text-xs font-semibold px-2 py-1 bg-green-100 text-green-700 rounded-full">Disponible</span>
              </div>
            ))}
          </div>
        </div>

        {/* Columna: Luz Roja */}
        <div className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden">
          <div className="bg-slate-800 px-4 py-3 border-b border-slate-700">
            <h2 className="text-white font-semibold text-lg">Luz Roja</h2>
            <p className="text-slate-300 text-sm">Bloques de 60 min</p>
          </div>
          <div className="p-4 space-y-3">
            {redLightSlots.map((time, index) => (
              <div key={`rl-${index}`} className="flex items-center justify-between p-3 rounded border border-slate-100 hover:border-slate-300 hover:bg-slate-50 transition cursor-pointer">
                <span className="text-slate-700 font-medium">{time}</span>
                <span className="text-xs font-semibold px-2 py-1 bg-green-100 text-green-700 rounded-full">Disponible</span>
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
}