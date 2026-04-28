"use client";
import React, { useState, useEffect } from 'react';

export default function NewAppointmentModal({ selectedSlot, onSave, onClose, existingPatients }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [filteredPatients, setFilteredPatients] = useState([]);

  const [formData, setFormData] = useState({
    patient: '',
    phone: '',
    protocol: 'Wellness', 
    isNewClient: true,    
    equipment: selectedSlot?.equipment || 'Cámara 1',
    day: selectedSlot?.day || 'Lunes',
    time: selectedSlot?.time || '09:00 AM',
    packageTotal: 0,
    packageUsed: 0
  });

  const allEquipments = ['Cámara 1', 'Cámara 2', 'Luz Roja'];
  const daysOfWeek = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
  
  const generateTimes = () => {
    const times = [];
    for (let h = 7; h < 19; h++) {
      const ampm = h >= 12 ? 'PM' : 'AM';
      const displayH = h > 12 ? h - 12 : h;
      times.push(`${displayH.toString().padStart(2, '0')}:00 ${ampm}`);
      times.push(`${displayH.toString().padStart(2, '0')}:30 ${ampm}`);
    }
    return times;
  };

  const isSlotAvailable = !existingPatients.some(app => 
    app.day === formData.day && 
    app.time === formData.time && 
    app.equipment === formData.equipment
  );

  useEffect(() => {
    if (searchTerm.trim() === '') {
      setFilteredPatients([]);
      return;
    }
    const filtered = existingPatients.filter(p => 
      p.patient.toLowerCase().includes(searchTerm.toLowerCase()) || 
      (p.phone && p.phone.includes(searchTerm))
    );
    const uniquePatients = Array.from(new Set(filtered.map(a => a.patient)))
      .map(name => filtered.find(a => a.patient === name));
      
    setFilteredPatients(uniquePatients);
  }, [searchTerm, existingPatients]);

  const handleSelectPatient = (p) => {
    setFormData({
      ...formData,
      patient: p.patient,
      phone: p.phone || '',
      protocol: p.protocol || 'Wellness',
      isNewClient: false,
      packageTotal: p.packageTotal || 0,
      packageUsed: p.packageUsed || 0
    });
    setSearchTerm(p.patient);
    setShowSuggestions(false);
  };

  const handleSaveClick = () => {
    if (!formData.patient.trim()) { alert("ERROR: EL NOMBRE ES OBLIGATORIO."); return; }
    if (!isSlotAvailable) { alert("ERROR: EL HORARIO Y EQUIPO YA ESTÁ OCUPADO."); return; }
    onSave({ ...formData, id: Date.now(), checkInStatus: 'Agendado' });
  };

  const remainingSessions = formData.packageTotal - formData.packageUsed;

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-[100]">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden border border-slate-200">
        
        <div className="bg-green-600 px-6 py-4 border-b border-green-700 flex justify-between items-center">
          <h3 className="text-lg font-black text-white uppercase tracking-widest">Registrar Cita</h3>
          <button onClick={onClose} className="text-green-200 hover:text-white text-2xl font-black">&times;</button>
        </div>

        <div className="p-6 space-y-5">
          <div className="relative">
            <label className="block text-[10px] font-black text-slate-400 uppercase mb-1 tracking-widest">Buscar o Escribir Paciente</label>
            <input 
              type="text" 
              value={searchTerm} 
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setFormData({...formData, patient: e.target.value, packageTotal: 0, packageUsed: 0, isNewClient: true});
                setShowSuggestions(true);
              }}
              placeholder="Nombre o Teléfono..."
              className="w-full bg-slate-50 border border-slate-300 rounded-lg p-3 font-black text-slate-800 uppercase focus:border-green-500 focus:outline-none shadow-sm"
            />
            
            {showSuggestions && filteredPatients.length > 0 && (
              <div className="absolute w-full mt-1 bg-white border border-slate-200 rounded-lg shadow-xl z-50 max-h-48 overflow-y-auto">
                {filteredPatients.map(p => (
                  <div 
                    key={p.id} onClick={() => handleSelectPatient(p)}
                    className="p-3 hover:bg-slate-50 cursor-pointer border-b border-slate-100 flex justify-between items-center"
                  >
                    <div className="flex flex-col">
                      <span className="font-black text-slate-800 text-xs uppercase">{p.patient}</span>
                      <span className="text-[10px] text-slate-500 font-bold">{p.phone || 'SIN TELÉFONO'}</span>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <span className="text-[9px] font-black text-blue-600 bg-blue-50 px-2 py-0.5 rounded uppercase">{p.protocol}</span>
                      {(p.packageTotal > 0) && (
                         <span className="text-[8px] font-black text-emerald-700 bg-emerald-100 px-1.5 rounded">Saldo: {p.packageTotal - p.packageUsed}</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* INDICADOR DE PAQUETE AL AGENDAR */}
          {!formData.isNewClient && formData.packageTotal > 0 && (
            <div className={`p-2 rounded-lg border text-center ${remainingSessions <= 0 ? 'bg-red-50 border-red-200' : 'bg-emerald-50 border-emerald-200'}`}>
              <p className={`text-[10px] font-black uppercase tracking-widest ${remainingSessions <= 0 ? 'text-red-700' : 'text-emerald-700'}`}>
                {remainingSessions <= 0 ? '⚠️ PAQUETE AGOTADO' : `✅ TIENE ${remainingSessions} SESIONES DISPONIBLES`}
              </p>
            </div>
          )}

          <div className="bg-slate-900 p-4 rounded-xl space-y-3">
             <div className="flex gap-3">
                <div className="flex-1">
                  <label className="block text-[9px] font-black text-slate-500 mb-1 uppercase tracking-widest">Equipo</label>
                  <select value={formData.equipment} onChange={(e) => setFormData({...formData, equipment: e.target.value})} className="w-full bg-slate-800 border border-slate-700 rounded p-2 text-xs font-black text-white uppercase outline-none">
                    {allEquipments.map(eq => <option key={eq} value={eq}>{eq}</option>)}
                  </select>
                </div>
                <div className="flex-1">
                  <label className="block text-[9px] font-black text-slate-500 mb-1 uppercase tracking-widest">Protocolo</label>
                  <select value={formData.protocol} onChange={(e) => setFormData({...formData, protocol: e.target.value})} className="w-full bg-slate-800 border border-slate-700 rounded p-2 text-xs font-black text-white uppercase outline-none">
                    <option value="Médico">Médico</option>
                    <option value="Wellness">Wellness</option>
                    <option value="InfraBaldan">InfraBaldan</option>
                  </select>
                </div>
             </div>

             <div className="flex gap-3">
                <div className="flex-1">
                  <label className="block text-[9px] font-black text-slate-500 mb-1 uppercase tracking-widest">Día</label>
                  <select value={formData.day} onChange={(e) => setFormData({...formData, day: e.target.value})} className="w-full bg-slate-800 border border-slate-700 rounded p-2 text-xs font-black text-white uppercase outline-none">
                    {daysOfWeek.map(d => <option key={d} value={d}>{d}</option>)}
                  </select>
                </div>
                <div className="flex-1">
                  <label className="block text-[9px] font-black text-slate-500 mb-1 uppercase tracking-widest">Hora</label>
                  <select value={formData.time} onChange={(e) => setFormData({...formData, time: e.target.value})} className="w-full bg-slate-800 border border-slate-700 rounded p-2 text-xs font-black text-white uppercase outline-none">
                    {generateTimes().map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
             </div>

             <div className={`mt-2 p-2 rounded text-[10px] font-black text-center uppercase tracking-widest transition-colors ${isSlotAvailable ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'}`}>
                {isSlotAvailable ? '✅ Equipo Disponible' : '❌ Choque de Horario'}
             </div>
          </div>

          <div className="flex space-x-3 mt-6 pt-4 border-t border-slate-200">
            <button onClick={onClose} className="flex-1 bg-slate-100 text-slate-700 font-black py-3 rounded-xl hover:bg-slate-200 transition uppercase text-xs">Cancelar</button>
            <button disabled={!isSlotAvailable} onClick={handleSaveClick} className={`flex-1 font-black py-3 rounded-xl shadow-lg transition uppercase text-xs ${isSlotAvailable ? 'bg-green-600 text-white hover:bg-green-700' : 'bg-slate-300 text-slate-500 cursor-not-allowed'}`}>
              Bloquear Espacio
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}