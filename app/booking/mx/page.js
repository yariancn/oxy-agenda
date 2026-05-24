"use client";
import React, { useState, useEffect, useMemo } from 'react';
import { supabaseGdl } from '../../../lib/supabase';
import { PUBLIC_SESSION } from '../../../lib/sessionPresets';

export default function BookingMX() {
  const [step, setStep] = useState(1); 
  const activeClinic = 'Guadalajara';
  const [selectedService, setSelectedService] = useState(null);
  const [selectedDate, setSelectedDate] = useState('');
  const [selectedTime, setSelectedTime] = useState('');
  const [formData, setFormData] = useState({ name: '', phone: '', email: '', lada: '+52', notes: '' });
  const [dbServices, setDbServices] = useState([]);
  const [dbAppointments, setDbAppointments] = useState([]);
  const [dbBlockedSlots, setDbBlockedSlots] = useState([]);
  const [dbConfig, setDbConfig] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const fetchPublicData = async () => {
      setIsLoading(true);
      try {
        const [resSrv, resApp, resBlock, resConf] = await Promise.all([
          supabaseGdl.from('services').select('*').eq('is_active', true),
          supabaseGdl.from('appointments').select('equipment, full_date, time, duration, buffer, check_in_status').neq('check_in_status', 'Cancelado'),
          supabaseGdl.from('blocked_slots').select('*'),
          supabaseGdl.from('company_config').select('*').eq('clinic', activeClinic).maybeSingle()
        ]);
        if (resSrv.data) setDbServices(resSrv.data.sort((a,b) => a.name.length - b.name.length));
        if (resApp.data) setDbAppointments(resApp.data);
        if (resBlock.data) setDbBlockedSlots(resBlock.data);
        setDbConfig(resConf.data || { start_time: '08:00', end_time: '20:00', interval_mins: 30, booking_limit_hours: 2 });
      } catch (error) { console.error("Error:", error); } finally { setIsLoading(false); }
    };
    fetchPublicData();
  }, []);

  const getMinutes = (t) => {
    if (!t) return 0;
    const cleanT = String(t).trim();
    const isPM = cleanT.toUpperCase().includes('PM');
    const isAM = cleanT.toUpperCase().includes('AM');
    let [h, m] = cleanT.replace(/AM|PM/gi, '').trim().split(':').map(Number);
    if (isNaN(h)) h = 0; if (isNaN(m)) m = 0;
    if (isPM && h !== 12) h += 12;
    if (isAM && h === 12) h = 0;
    return h * 60 + m;
  };

  const checkAvailability = (timeStr, equipment, targetDate, dur, buf) => {
    const start1 = getMinutes(timeStr);
    const end1 = start1 + (Number(dur) || 60) + (Number(buf) || 0);
    const hasOverlap = dbAppointments.some(a => {
      if (a.equipment !== equipment || a.full_date !== targetDate) return false;
      const start2 = getMinutes(a.time);
      const end2 = start2 + (Number(a.duration)||60) + (Number(a.buffer)||0);
      return (start1 < end2 && end1 > start2);
    });
    if (hasOverlap) return false;
    const isBlocked = dbBlockedSlots.some(b => {
      if (b.date !== targetDate) return false;
      if (!b.is_global && b.equipment !== equipment) return false;
      const bStart = getMinutes(b.start_time);
      const bEnd = getMinutes(b.end_time);
      return (start1 >= bStart && start1 < bEnd) || (end1 > bStart && end1 <= bEnd) || (start1 <= bStart && end1 >= bEnd);
    });
    return !isBlocked;
  };

  const getAvailableSlots = () => {
    if (!dbConfig || !selectedDate || !selectedService) return [];
    const tz = 'America/Mexico_City';
    const localNow = new Date(new Date().toLocaleString("en-US", { timeZone: tz }));
    const todayStr = `${localNow.getFullYear()}-${String(localNow.getMonth() + 1).padStart(2, '0')}-${String(localNow.getDate()).padStart(2, '0')}`;
    const currentMins = localNow.getHours() * 60 + localNow.getMinutes();
    const startMins = getMinutes(dbConfig.start_time);
    const endMins = getMinutes(dbConfig.end_time);
    const interval = Number(dbConfig.interval_mins) || 30;
    const limitMins = (Number(dbConfig.booking_limit_hours) || 2) * 60;
    const slots = [];
    for (let m = startMins; m < endMins; m += interval) {
      if (selectedDate === todayStr && m <= (currentMins + limitMins)) continue; 
      const h = Math.floor(m / 60); 
      const mins = m % 60; 
      const ampm = h >= 12 ? 'PM' : 'AM'; 
      const dispH = h > 12 ? h - 12 : h === 0 ? 12 : h;
      const timeStr = `${dispH.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')} ${ampm}`;
      if (checkAvailability(timeStr, selectedService.name, selectedDate, PUBLIC_SESSION.duration, PUBLIC_SESSION.buffer)) {
        slots.push(timeStr);
      }
    }
    return slots;
  };

  const dateOptions = useMemo(() => {
    const dates = [];
    const start = new Date(new Date().toLocaleString("en-US", { timeZone: 'America/Mexico_City' }));
    for (let i = 0; i < 14; i++) {
      const d = new Date(start); d.setDate(start.getDate() + i);
      const fullDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      const label = d.toLocaleDateString('es-MX', { weekday: 'long', day: '2-digit', month: 'short' });
      dates.push({ fullDate, label });
    }
    return dates;
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const cleanPhone = formData.phone.replace(/\D/g, '');
    if (cleanPhone.length !== 10) {
      alert("⚠️ Error: El número celular debe tener exactamente 10 dígitos.");
      return;
    }
    setIsSubmitting(true);
    try {
      const targetDateObj = new Date(selectedDate + 'T12:00:00');
      const dayName = ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'][targetDateObj.getDay()];
      const payload = { 
        patient: formData.name.trim(), 
        phone: `${formData.lada} ${cleanPhone}`, 
        email: formData.email.trim(),
        protocol: 'Wellness', 
        equipment: selectedService.name, 
        duration: PUBLIC_SESSION.duration, 
        buffer: PUBLIC_SESSION.buffer, 
        full_date: selectedDate, 
        appointment_date: selectedDate, 
        day: dayName, 
        time: selectedTime, 
        appointment_time: selectedTime,
        check_in_status: 'Agendado',
        is_new_patient: true,
        notes: `Portal GDL. Prospecto Web. ${formData.notes}`
      };
      const { error } = await supabaseGdl.from('appointments').insert([payload]);
      if (error) throw error;
      setStep(4);
    } catch (error) { alert(error.message); } finally { setIsSubmitting(false); }
  };

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900 flex flex-col">
      <header className="bg-slate-900 text-white p-4 flex items-center justify-between shadow-lg">
        <div className="flex items-center gap-3">
          <img src="/1c3300f3-f5e7-4682-b627-257e868ed467.jpg" className="h-10 w-auto bg-white rounded p-1" />
          <div>
            <h1 className="text-sm font-black uppercase tracking-widest">OxyHyperbaric GDL</h1>
            <p className="text-[9px] text-emerald-400 font-bold uppercase">Reservaciones Guadalajara</p>
          </div>
        </div>
        {step > 1 && step < 4 && <button onClick={() => setStep(step - 1)} className="text-[10px] font-black uppercase border border-slate-700 px-3 py-1 rounded">Volver</button>}
      </header>
      <main className="flex-1 p-4 md:p-8 flex justify-center">
        <div className="max-w-2xl w-full bg-white rounded-3xl shadow-xl border overflow-hidden h-fit">
          <div className="p-6 md:p-10">
            {step === 1 && (
              <div className="space-y-4">
                <h2 className="text-2xl font-black text-slate-800 uppercase text-center mb-6">¿Qué servicio buscas?</h2>
                {dbServices.map(srv => (
                  <button key={srv.id} onClick={() => { setSelectedService(srv); setStep(2); }} className="w-full bg-white border-2 border-slate-200 hover:border-blue-500 rounded-2xl p-5 flex justify-between items-center transition">
                    <span className="font-black text-slate-800 uppercase">{srv.name}</span>
                    <span className="bg-slate-100 p-2 rounded-full">▶</span>
                  </button>
                ))}
              </div>
            )}
            {step === 2 && (
              <div className="space-y-6">
                <h2 className="text-xl font-black text-slate-800 uppercase border-b pb-4">Selecciona Fecha y Hora</h2>
                <div className="flex gap-3 overflow-x-auto pb-4">
                   {dateOptions.map(d => (
                     <button key={d.fullDate} onClick={() => { setSelectedDate(d.fullDate); setSelectedTime(''); }} className={`shrink-0 w-32 p-4 rounded-2xl border-2 transition ${selectedDate === d.fullDate ? 'border-blue-600 bg-blue-50' : 'border-slate-200'}`}>
                       <p className="text-xs font-black uppercase">{d.label.split(',')[0]}</p>
                       <p className="text-sm font-black uppercase">{d.label.split(',')[1]}</p>
                     </button>
                   ))}
                </div>
                {selectedDate && (
                  <div className="grid grid-cols-3 md:grid-cols-4 gap-3">
                    {getAvailableSlots().map(time => (
                      <button key={time} onClick={() => { setSelectedTime(time); setStep(3); }} className="p-3 rounded-xl border-2 font-black text-xs uppercase hover:border-emerald-500 transition">{time}</button>
                    ))}
                    {getAvailableSlots().length === 0 && <p className="col-span-full text-center text-slate-400 font-bold uppercase py-4">No hay espacios para este día.</p>}
                  </div>
                )}
              </div>
            )}
            {step === 3 && (
              <form onSubmit={handleSubmit} className="space-y-4">
                <h2 className="text-xl font-black text-slate-800 uppercase border-b pb-4">Tus Datos</h2>
                <input required placeholder="Nombre Completo" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} className="w-full p-4 border-2 rounded-xl font-bold uppercase outline-none focus:border-blue-500" />
                <div className="flex gap-2">
                  <input required placeholder="+52" value={formData.lada} onChange={e => setFormData({...formData, lada: e.target.value})} className="w-20 p-4 border-2 bg-slate-50 rounded-xl font-black text-center outline-none focus:border-blue-500" />
                  <input required type="tel" maxLength="10" placeholder="Número (10 dígitos)" value={formData.phone} onChange={e => setFormData({...formData, phone: e.target.value.replace(/\D/g, '')})} className="flex-1 p-4 border-2 rounded-xl font-bold outline-none focus:border-blue-500" />
                </div>
                <input required type="email" placeholder="Email" value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} className="w-full p-4 border-2 rounded-xl font-bold outline-none focus:border-blue-500" />
                <button type="submit" disabled={isSubmitting} className="w-full bg-blue-600 text-white font-black py-5 rounded-2xl uppercase shadow-xl">{isSubmitting ? 'Procesando...' : 'Confirmar Cita'}</button>
                <p className="text-[10px] text-center font-bold text-slate-400 uppercase">Se requiere un número de 10 dígitos para confirmar.</p>
              </form>
            )}
            {step === 4 && (
              <div className="text-center py-10">
                <div className="w-20 h-20 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center text-4xl mx-auto mb-6">✓</div>
                <h2 className="text-3xl font-black text-slate-800 uppercase">¡Cita Confirmada!</h2>
                <p className="text-sm font-bold text-slate-500 uppercase mt-4">Te esperamos en nuestra sucursal de Guadalajara.</p>
                <button onClick={() => window.location.reload()} className="mt-8 text-xs font-black text-blue-600 uppercase underline">Agendar otra</button>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
