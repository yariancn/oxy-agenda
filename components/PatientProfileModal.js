"use client";
import React, { useState } from 'react';

export default function PatientProfileModal({ initialData, onSave, onClose }) {
  const [formData, setFormData] = useState({
    patient: initialData.patient || '',
    phone: initialData.phone || '',
    email: initialData.email || '',
    dob: initialData.dob || '',
    saldoSesiones: initialData.saldoSesiones || 0,
    historicoSesiones: initialData.historicoSesiones || 0,
    packageHistory: initialData.packageHistory || [],
  });

  const [addSessions, setAddSessions] = useState(0);

  const handleChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleAddSessions = () => {
    if (addSessions > 0) {
      const newTransaction = {
        id: Date.now(),
        date: new Date().toLocaleDateString('es-MX', { year: 'numeric', month: 'short', day: 'numeric' }),
        amount: addSessions,
        operator: 'Yarian Cuenca'
      };

      setFormData(prev => ({
        ...prev,
        saldoSesiones: prev.saldoSesiones + addSessions,
        packageHistory: [newTransaction, ...(prev.packageHistory || [])]
      }));
      setAddSessions(0);
    }
  };

  const handleSaveClick = () => {
    onSave(formData);
  };

  const lastPackageAmount = formData.packageHistory && formData.packageHistory.length > 0 
    ? formData.packageHistory[0].amount 
    : 0;

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-[120]">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden border border-slate-200 flex flex-col max-h-[90vh]">
        
        <div className="bg-slate-900 px-6 py-4 border-b border-slate-800 flex justify-between items-center shrink-0">
          <h3 className="text-lg font-black text-white uppercase tracking-widest flex items-center gap-2">
            👤 Expediente Médico
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-white text-2xl font-black">&times;</button>
        </div>

        <div className="p-6 space-y-5 overflow-y-auto flex-1">
          <div className="space-y-4">
            <div>
              <label className="block text-[10px] font-black text-slate-400 uppercase mb-1">Nombre Completo</label>
              <input 
                type="text" 
                value={formData.patient} 
                onChange={(e) => handleChange('patient', e.target.value)}
                className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2.5 font-black text-slate-800 uppercase focus:border-blue-500 focus:outline-none shadow-sm"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase mb-1">Celular</label>
                <input 
                  type="tel" 
                  value={formData.phone} 
                  onChange={(e) => handleChange('phone', e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2.5 text-xs font-bold text-slate-800 focus:border-blue-500 focus:outline-none shadow-sm"
                />
              </div>
              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase mb-1">Fecha Nac.</label>
                <input 
                  type="date" 
                  value={formData.dob} 
                  onChange={(e) => handleChange('dob', e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2.5 text-xs font-bold text-slate-800 focus:border-blue-500 focus:outline-none shadow-sm"
                />
              </div>
            </div>
          </div>

          <div className="bg-blue-50 p-4 rounded-xl border border-blue-100 shadow-sm">
            <h4 className="text-[10px] font-black text-blue-800 uppercase tracking-widest mb-3 border-b border-blue-200 pb-2">Desglose de Paquetes</h4>
            
            <div className="space-y-2 mb-4">
              <div className="flex justify-between items-center bg-white p-2 rounded border border-blue-100">
                <span className="text-[10px] font-black text-slate-500 uppercase">Total Sesiones Tomadas</span>
                <span className="text-xs font-black text-slate-800">{formData.historicoSesiones}</span>
              </div>
              <div className="flex justify-between items-center bg-white p-2 rounded border border-blue-100">
                <span className="text-[10px] font-black text-slate-500 uppercase">Último Paquete Adquirido</span>
                <span className="text-xs font-black text-blue-700">{lastPackageAmount} sesiones</span>
              </div>
              <div className="flex justify-between items-center bg-blue-600 p-2 rounded border border-blue-700 text-white shadow-sm">
                <span className="text-xs font-black uppercase">Pendientes por Tomar</span>
                <span className="text-lg font-black">{formData.saldoSesiones}</span>
              </div>
            </div>

            <div className="flex gap-2 mb-4">
              <input 
                type="number" min="1" placeholder="Cant."
                value={addSessions || ''} 
                onChange={(e) => setAddSessions(parseInt(e.target.value) || 0)}
                className="w-20 bg-white border border-blue-300 rounded p-2 text-center font-black text-blue-900 focus:border-blue-600 focus:outline-none shadow-sm"
              />
              <button 
                onClick={handleAddSessions}
                className="flex-1 bg-blue-800 text-white text-[10px] font-black uppercase rounded hover:bg-blue-900 transition shadow-sm"
              >
                + Abonar Nuevo Paquete
              </button>
            </div>

            {formData.packageHistory && formData.packageHistory.length > 0 && (
              <div className="mt-4 pt-3 border-t border-blue-200">
                <h5 className="text-[9px] font-black text-blue-500 uppercase tracking-widest mb-2">Historial de Recargas</h5>
                <div className="space-y-2 max-h-24 overflow-y-auto pr-2">
                  {formData.packageHistory.map(record => (
                    <div key={record.id} className="flex justify-between items-center bg-white p-2 rounded border border-blue-100 text-[9px] font-bold uppercase">
                      <span className="text-slate-500">{record.date}</span>
                      <span className="text-emerald-600 font-black">+{record.amount} Sesiones</span>
                      <span className="text-slate-400 truncate w-20 text-right">{record.operator}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="p-6 pt-0 shrink-0">
          <div className="flex space-x-3 pt-4 border-t border-slate-200">
            <button onClick={onClose} className="flex-1 bg-slate-100 text-slate-700 font-black py-3 rounded-xl hover:bg-slate-200 transition uppercase text-xs shadow-sm">Cancelar</button>
            <button onClick={handleSaveClick} className="flex-1 bg-emerald-600 text-white font-black py-3 rounded-xl hover:bg-emerald-700 shadow-md transition uppercase text-xs">
              💾 Guardar
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}