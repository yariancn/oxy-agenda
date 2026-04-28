"use client";
import React, { useState } from 'react';
import BitacoraModal from '../components/BitacoraModal';
import PatientProfileModal from '../components/PatientProfileModal';
import NewAppointmentModal from '../components/NewAppointmentModal';
import GFEManager from '../components/GFEManager';

export default function AppLayout() {
  const [activeTab, setActiveTab] = useState('Agenda');
  const [viewMode, setViewMode] = useState('Día');
  const [equipmentFilter, setEquipmentFilter] = useState('Todos');
  const [selectedSlot, setSelectedSlot] = useState(null);
  const [zoomScale, setZoomScale] = useState(100);
  const [selectedPatientReport, setSelectedPatientReport] = useState(null);

  const [draggedApp, setDraggedApp] = useState(null);
  const [moveConfirmation, setMoveConfirmation] = useState(null);
  
  const [showBitacora, setShowBitacora] = useState(false);
  const [showPatientProfile, setShowPatientProfile] = useState(false);
  const [showNewAppointment, setShowNewAppointment] = useState(false);

  const allEquipments = ['Cámara 1', 'Cámara 2', 'Luz Roja'];
  const displayedEquipments = equipmentFilter === 'Todos' ? allEquipments : [equipmentFilter];

  const [appointments, setAppointments] = useState([
    { 
      id: 1, equipment: 'Cámara 1', day: 'Lunes', time: '09:00 AM', duration: 90, 
      patient: 'Juan Pérez', phone: '832-555-0123', protocol: 'Médico', 
      patientNotes: 'Claustrofobia leve.', sessionNotes: '', 
      isNewClient: false, checkInStatus: 'En Sesión',
      gfeStatus: 'Activo', gfeExpiration: '2026-12-31', consentSigned: true,
      saldoSesiones: 8, historicoSesiones: 42,
      packageHistory: [{ id: 101, date: '10 ene 2026', amount: 50, operator: 'Yarian Cuenca' }],
      signature: '/signature-sample.png' 
    },
    { 
      id: 2, equipment: 'Cámara 1', day: 'Lunes', time: '12:00 PM', duration: 90, 
      patient: 'María Estela Cuevas', phone: '281-555-0456', protocol: 'Wellness', 
      patientNotes: '', sessionNotes: '', 
      isNewClient: false, checkInStatus: 'Agendado',
      gfeStatus: 'Pendiente', gfeExpiration: '', consentSigned: false,
      saldoSesiones: 0, historicoSesiones: 10,
      packageHistory: [{ id: 103, date: '01 feb 2026', amount: 10, operator: 'Yarian Cuenca' }],
      signature: null
    },
  ]);

  const uniquePatients = Array.from(new Set(appointments.map(a => a.patient)))
    .map(name => appointments.find(a => a.patient === name));

  const hoursOfOperation = Array.from({ length: 13 }, (_, i) => i + 7);
  const daysOfWeek = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
  const PIXELS_PER_MINUTE = 1.5;
  const CALENDAR_HEIGHT = 12 * 60 * PIXELS_PER_MINUTE;
  const currentColWidth = (140 * zoomScale) / 100;
  const isCompact = currentColWidth < 80;

  const timeToPixels = (timeStr) => {
    const [time, modifier] = timeStr.split(' ');
    let [hours, minutes] = time.split(':').map(Number);
    if (hours === 12 && modifier === 'AM') hours = 0;
    if (hours !== 12 && modifier === 'PM') hours += 12;
    return (hours - 7) * 60 + minutes;
  };

  const getAppointments = (equipment, day) => {
    return appointments.filter(app => app.equipment === equipment && app.day === day);
  };

  const getEquipmentColors = (equipment) => {
    if (equipment === 'Cámara 1') return 'bg-blue-50 border-blue-500 text-blue-900';
    if (equipment === 'Cámara 2') return 'bg-indigo-50 border-indigo-500 text-indigo-900';
    if (equipment === 'Luz Roja') return 'bg-rose-50 border-rose-500 text-rose-900';
    return 'bg-slate-50 border-slate-500';
  };

  const getEquipmentHeaderColor = (equipment) => {
    if (equipment === 'Cámara 1') return 'bg-blue-600 text-white';
    if (equipment === 'Cámara 2') return 'bg-indigo-600 text-white';
    if (equipment === 'Luz Roja') return 'bg-rose-600 text-white';
    return 'bg-slate-800 text-white';
  };

  const checkInStatuses = ['Agendado', 'Llegó', 'En Sesión', 'Finalizado', 'No Asistió'];

  const getStatusStyle = (status) => {
    switch(status) {
      case 'Llegó': return 'bg-amber-100 text-amber-800 border-amber-300';
      case 'En Sesión': return 'bg-emerald-100 text-emerald-800 border-emerald-400';
      case 'Finalizado': return 'bg-slate-200 text-slate-600 border-slate-300';
      case 'No Asistió': return 'bg-red-100 text-red-800 border-red-300';
      default: return 'bg-white text-slate-500 border-slate-200'; 
    }
  };

  const getStatusBadge = (status) => {
    if (!status || status === 'Agendado') return null;
    let badgeClass = status === 'Llegó' ? 'bg-amber-200 text-amber-900' : 
                     status === 'En Sesión' ? 'bg-emerald-200 text-emerald-900' : 
                     status === 'Finalizado' ? 'bg-slate-300 text-slate-700' : 'bg-red-200 text-red-900';
    let icon = status === 'Llegó' ? '🚶' : status === 'En Sesión' ? '🟢' : status === 'Finalizado' ? '✔️' : '❌';
    return (
      <span className={`text-[8px] font-black px-1 rounded shadow-sm flex items-center gap-0.5 ${badgeClass}`}>
        {icon} {!isCompact && <span>{status}</span>}
      </span>
    );
  };

  const handleDragStart = (e, app) => { setDraggedApp(app); e.dataTransfer.effectAllowed = "move"; };
  const handleDragOver = (e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; };
  
  const handleDrop = (e, newTime, newEquipment, newDay) => {
    e.preventDefault();
    if (!draggedApp) return;

    const isOccupied = appointments.some(app => 
      app.day === newDay && 
      app.time === newTime && 
      app.equipment === newEquipment && 
      app.id !== draggedApp.id
    );

    if (isOccupied) {
      alert(`⚠️ ALERTA DE BLOQUEO\n\nNo se puede reprogramar a ${draggedApp.patient}.\nEl espacio de las ${newTime} en ${newEquipment} ya está ocupado por otro paciente.`);
      setDraggedApp(null);
      return;
    }

    setMoveConfirmation({ app: draggedApp, newTime, newEquipment, newDay });
    setDraggedApp(null);
  };

  const confirmMove = () => {
    setAppointments(prev => prev.map(app => app.id === moveConfirmation.app.id ? { ...app, time: moveConfirmation.newTime, equipment: moveConfirmation.newEquipment, day: moveConfirmation.newDay } : app));
    setMoveConfirmation(null);
  };

  const handleFieldChange = (field, value) => {
    setAppointments(prev => prev.map(app => app.id === selectedSlot.id ? { ...app, [field]: value } : app));
    setSelectedSlot(prev => ({ ...prev, [field]: value }));
  };

  const handleSavePatientProfile = (updatedPatientData) => {
    setAppointments(prev => prev.map(app => (app.patient === selectedSlot?.patient || app.patient === updatedPatientData.patient) ? { ...app, ...updatedPatientData } : app));
    setShowPatientProfile(false);
  };

  const handleSaveNewAppointment = (newAppointment) => {
    setAppointments(prev => [...prev, newAppointment]);
    setShowNewAppointment(false);
    setSelectedSlot(null);
  };

  const handleSealBitacora = (signatureData) => {
    setAppointments(prev => prev.map(app => {
      if (app.patient === selectedSlot.patient) {
        return { 
          ...app, 
          saldoSesiones: app.id === selectedSlot.id ? Math.max(0, (app.saldoSesiones || 0) - 1) : app.saldoSesiones,
          historicoSesiones: app.id === selectedSlot.id ? (app.historicoSesiones || 0) + 1 : app.historicoSesiones,      
          checkInStatus: app.id === selectedSlot.id ? 'Finalizado' : app.checkInStatus,
          signature: app.id === selectedSlot.id ? '/signature-sample.png' : app.signature 
        };
      }
      return app;
    }));
    setShowBitacora(false);
    setSelectedSlot(null);
  };

  const renderBackgroundSlots = (equipment, day) => {
    const slots = [];
    for (let h = 7; h < 19; h++) {
      const ampm = h >= 12 ? 'PM' : 'AM';
      const displayH = h > 12 ? h - 12 : h;
      slots.push(`${displayH.toString().padStart(2, '0')}:00 ${ampm}`);
      slots.push(`${displayH.toString().padStart(2, '0')}:30 ${ampm}`);
    }
    return slots.map((time, idx) => (
      <div 
        key={idx} onClick={() => setSelectedSlot({ time, equipment, day, status: 'available' })}
        onDragOver={handleDragOver} onDrop={(e) => handleDrop(e, time, equipment, day)}
        className="border-b border-slate-100 hover:bg-slate-200/50 cursor-pointer transition-colors"
        style={{ height: `${30 * PIXELS_PER_MINUTE}px` }}
      >
        <div className="opacity-0 hover:opacity-100 text-[10px] text-slate-400 font-bold p-1 pointer-events-none">+ {time}</div>
      </div>
    ));
  };

  const ReportesView = ({ patientFilter = null }) => {
    const data = patientFilter ? appointments.filter(a => a.patient === patientFilter) : appointments;

    return (
      <div className="flex-1 p-6 overflow-auto bg-white flex flex-col h-full">
        <div className="flex justify-between items-end mb-6 border-b border-slate-200 pb-4">
          <div>
            <h2 className="text-2xl font-black text-slate-800 uppercase tracking-tight">
              {patientFilter ? `Historial: ${patientFilter}` : 'Reporte Global de Asistencias'}
            </h2>
            <p className="text-sm text-slate-500 font-medium">Registro legal con trazabilidad de firmas</p>
          </div>
          {!patientFilter && (
            <div className="flex gap-2">
              <input type="date" className="bg-slate-50 border border-slate-300 rounded px-3 py-2 text-xs font-bold outline-none" />
              <button className="bg-slate-900 text-white px-4 py-2 rounded font-black text-xs uppercase">Filtrar</button>
            </div>
          )}
          {patientFilter && (
             <button onClick={() => setSelectedPatientReport(null)} className="bg-slate-200 text-slate-700 px-4 py-2 rounded font-black text-xs uppercase hover:bg-slate-300 transition">Volver al Listado</button>
          )}
        </div>

        <div className="flex-1 bg-slate-50 rounded-xl border border-slate-200 overflow-hidden">
          <table className="w-full text-left border-collapse bg-white">
            <thead>
              <tr className="bg-slate-100 border-b border-slate-200 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                <th className="p-4">Fecha / Equipo</th>
                <th className="p-4">Paciente</th>
                <th className="p-4">Protocolo</th>
                <th className="p-4 text-center">Firma del Paciente</th>
                <th className="p-4 text-right">Estatus</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.map(app => (
                <tr key={app.id} className="hover:bg-slate-50 transition-colors">
                  <td className="p-4">
                    <p className="text-xs font-black text-slate-800">{app.day}, {app.time}</p>
                    <p className="text-[9px] font-bold text-blue-600 uppercase">{app.equipment}</p>
                  </td>
                  <td className="p-4 font-black text-slate-700 uppercase text-xs">{app.patient}</td>
                  <td className="p-4 text-xs font-bold text-slate-500 uppercase">{app.protocol}</td>
                  <td className="p-4">
                    <div className="flex justify-center">
                      {app.signature ? (
                        <div className="bg-slate-50 border border-slate-200 rounded p-1">
                           <img src={app.signature} alt="Firma" className="h-8 w-auto grayscale contrast-125" />
                           <p className="text-[7px] text-center text-slate-400 font-bold mt-1">ID: {app.id}99X</p>
                        </div>
                      ) : (
                        <span className="text-[9px] font-black text-slate-300 uppercase italic">Sin Firma</span>
                      )}
                    </div>
                  </td>
                  <td className="p-4 text-right">{getStatusBadge(app.checkInStatus)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-4 flex justify-end gap-3">
           <button className="bg-blue-600 text-white px-6 py-3 rounded-xl font-black text-xs uppercase shadow-md hover:bg-blue-700 transition flex items-center gap-2">🖨️ Imprimir Reporte de {patientFilter || 'Hoy'}</button>
        </div>
      </div>
    );
  };

  return (
    <div className="flex h-screen bg-slate-50 font-sans text-slate-900 overflow-hidden">
      
      <aside className="w-64 bg-slate-900 text-slate-300 flex flex-col shadow-2xl z-30 shrink-0">
        <div className="p-6 border-b border-slate-800 bg-slate-950 flex flex-col items-center">
          <img src="/1c3300f3-f5e7-4682-b627-257e868ed467.jpg" alt="Logo" className="h-16 w-auto object-contain mb-3 bg-white rounded p-1" />
          <h1 className="text-lg font-black text-white uppercase tracking-widest">OxyHyperbaric</h1>
          <p className="text-[10px] text-slate-500 font-bold tracking-widest uppercase">Admin Terminal</p>
        </div>

        <div className="p-4">
          <button onClick={() => setShowNewAppointment(true)} className="w-full bg-green-600 hover:bg-green-500 text-white font-bold py-3 px-4 rounded-xl flex items-center justify-center gap-2 shadow-lg transition">
            <span className="text-xl leading-none">+</span> Nuevo Registro
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto py-2 px-3 space-y-1">
          <div className="text-[10px] font-black text-slate-600 uppercase tracking-widest mb-2 px-3 mt-2">Operación</div>
          <button onClick={() => {setActiveTab('Agenda'); setSelectedPatientReport(null);}} className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg font-bold transition ${activeTab === 'Agenda' ? 'bg-blue-600/20 text-blue-400' : 'hover:bg-slate-800'}`}>📅 Agenda</button>
          <button onClick={() => {setActiveTab('Pacientes'); setSelectedPatientReport(null);}} className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg font-bold transition ${activeTab === 'Pacientes' ? 'bg-blue-600/20 text-blue-400' : 'hover:bg-slate-800'}`}>👥 Clientes</button>
          <button onClick={() => {setActiveTab('GFE'); setSelectedPatientReport(null);}} className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg font-bold transition ${activeTab === 'GFE' ? 'bg-blue-600/20 text-blue-400' : 'hover:bg-slate-800'}`}>🩺 Consultas GFE</button>

          <div className="text-[10px] font-black text-slate-600 uppercase tracking-widest mb-2 px-3 mt-6">Administración</div>
          <button onClick={() => {setActiveTab('Reportes'); setSelectedPatientReport(null);}} className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg font-bold transition ${activeTab === 'Reportes' ? 'bg-blue-600/20 text-blue-400' : 'hover:bg-slate-800'}`}>📊 Reportes y Firmas</button>
        </nav>

        <div className="p-4 border-t border-slate-800 bg-slate-950">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-white font-bold">YC</div>
            <div>
              <p className="text-xs font-bold text-white uppercase">Yarian Cuenca</p>
              <p className="text-[10px] text-slate-500 font-bold">Técnico Certificado IBUM</p>
            </div>
          </div>
        </div>
      </aside>

      <main className="flex-1 flex flex-col h-screen overflow-hidden relative">
        {activeTab === 'Agenda' && (
          <>
            <header className="bg-white p-4 border-b border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-4 z-20 flex-shrink-0">
              <div>
                <h2 className="text-xl font-bold text-slate-800 uppercase tracking-tight">Control de Citas</h2>
                <p className="text-sm text-slate-500 font-medium italic">Gestión de Cámaras y Luz Roja</p>
              </div>
              <div className="flex flex-wrap items-center gap-4 bg-slate-50 p-1.5 rounded-xl border border-slate-200">
                <div className="flex items-center gap-2 px-2">
                  <span className="font-bold text-slate-600 text-xs uppercase">Equipo:</span>
                  <select value={equipmentFilter} onChange={(e) => setEquipmentFilter(e.target.value)} className="bg-white border border-slate-300 text-slate-700 font-bold text-sm rounded-md px-2 py-1 outline-none shadow-sm cursor-pointer">
                    <option value="Todos">Todos</option>
                    <option value="Cámara 1">Cámara 1</option>
                    <option value="Cámara 2">Cámara 2</option>
                    <option value="Luz Roja">Luz Roja</option>
                  </select>
                </div>
                <div className="flex items-center gap-2 px-2">
                  <span className="font-bold text-slate-600 text-xs uppercase">Zoom:</span>
                  <input type="range" min="40" max="200" value={zoomScale} onChange={(e) => setZoomScale(Number(e.target.value))} className="w-20 cursor-pointer accent-blue-600" />
                </div>
                <div className="flex items-center bg-slate-200/50 p-1 rounded-lg">
                  <button onClick={() => setViewMode('Día')} className={`px-4 py-1 rounded font-bold text-sm transition ${viewMode === 'Día' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200'}`}>DÍA</button>
                  <button onClick={() => setViewMode('Semana')} className={`px-4 py-1 rounded font-bold text-sm transition ${viewMode === 'Semana' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200'}`}>SEMANA</button>
                </div>
              </div>
            </header>

            <div className="flex-1 bg-white overflow-hidden flex relative m-4 rounded-xl shadow-sm border border-slate-200">
              {/* TIMELINE IZQUIERDA */}
              <div className="w-16 md:w-20 flex-shrink-0 border-r border-slate-200 bg-slate-50 relative z-20 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]" style={{ height: `${CALENDAR_HEIGHT + (viewMode === 'Semana' && equipmentFilter === 'Todos' ? 82 : 56)}px` }}>
                <div className="border-b border-slate-200" style={{ height: viewMode === 'Semana' && equipmentFilter === 'Todos' ? '82px' : '56px' }}></div>
                {hoursOfOperation.map((h, i) => (
                  <div key={h} className="absolute w-full text-right pr-2" style={{ top: `${(i * 60 * PIXELS_PER_MINUTE) + (viewMode === 'Semana' && equipmentFilter === 'Todos' ? 82 : 56) - 8}px` }}>
                    <span className="text-[10px] md:text-xs font-bold text-slate-400">{h > 12 ? h - 12 : h} {h >= 12 ? 'PM' : 'AM'}</span>
                  </div>
                ))}
              </div>
              
              {/* REJILLA PRINCIPAL RESTAURADA */}
              <div className="flex-1 overflow-x-auto overflow-y-auto">
                {viewMode === 'Día' ? (
                  <div className="flex min-w-full">
                    {displayedEquipments.map((equipment) => (
                      <div key={equipment} className="flex-1 border-r border-slate-200" style={{ minWidth: `${currentColWidth * 2}px` }}>
                        <div className={`h-14 flex items-center justify-center border-b border-slate-200 font-bold text-sm ${getEquipmentHeaderColor(equipment)}`}>{equipment}</div>
                        <div className="relative w-full" style={{ height: `${CALENDAR_HEIGHT}px` }}>
                          <div className="absolute inset-0 pointer-events-auto">{renderBackgroundSlots(equipment, 'Lunes')}</div>
                          {getAppointments(equipment, 'Lunes').map(app => (
                            <div 
                              key={app.id} draggable onDragStart={(e) => handleDragStart(e, app)} onClick={() => setSelectedSlot({ ...app, status: 'booked' })}
                              className={`absolute left-1 right-1 rounded-md p-2 border-l-4 shadow-sm cursor-grab active:cursor-grabbing overflow-hidden pointer-events-auto transition-shadow hover:shadow-md flex flex-col gap-1 ${getEquipmentColors(app.equipment)} ${app.checkInStatus === 'Finalizado' ? 'opacity-50' : ''}`}
                              style={{ top: `${timeToPixels(app.time)}px`, height: `${app.duration * PIXELS_PER_MINUTE}px`, zIndex: 10 }}
                            >
                              <div className="flex justify-between items-start gap-1">
                                <div className="text-xs font-bold leading-tight line-clamp-2 whitespace-normal pr-1">{app.time} - {app.patient}</div>
                                <div className="flex gap-1 flex-wrap justify-end">
                                  {getStatusBadge(app.checkInStatus)}
                                </div>
                              </div>
                              <div className="text-[10px] opacity-80 font-semibold truncate uppercase">{app.protocol}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex min-w-full">
                    {daysOfWeek.map((day) => (
                      <div key={day} className="flex-1 flex-shrink-0 border-r-2 border-slate-300" style={{ minWidth: `${displayedEquipments.length * currentColWidth}px` }}>
                        <div className="h-10 flex items-center justify-center border-b border-slate-200 font-bold text-sm text-slate-700 bg-slate-100">{day}</div>
                        <div className="flex w-full">
                          {displayedEquipments.map(equipment => (
                            <div key={`${day}-${equipment}`} className="flex-1 flex-shrink-0 border-r border-slate-100 last:border-r-0" style={{ minWidth: `${currentColWidth}px` }}>
                              {displayedEquipments.length > 1 && <div className={`h-6 flex items-center justify-center border-b border-slate-200 text-[10px] font-bold ${getEquipmentHeaderColor(equipment)} opacity-90 truncate px-1`}>{equipment}</div>}
                              <div className="relative w-full" style={{ height: `${CALENDAR_HEIGHT}px` }}>
                                <div className="absolute inset-0 pointer-events-auto">{renderBackgroundSlots(equipment, day)}</div>
                                {getAppointments(equipment, day).map(app => (
                                  <div 
                                    key={app.id} draggable onDragStart={(e) => handleDragStart(e, app)} onClick={() => setSelectedSlot({ ...app, status: 'booked' })}
                                    className={`absolute left-1 right-1 rounded-md p-1.5 border-l-4 shadow-sm cursor-grab active:cursor-grabbing overflow-hidden pointer-events-auto transition-shadow hover:shadow-md flex flex-col ${getEquipmentColors(app.equipment)} ${app.checkInStatus === 'Finalizado' ? 'opacity-50' : ''}`}
                                    style={{ top: `${timeToPixels(app.time)}px`, height: `${app.duration * PIXELS_PER_MINUTE}px`, zIndex: 10 }}
                                  >
                                    <div className="flex justify-between items-start gap-1">
                                      <div className="text-[10px] font-bold flex-shrink-0">{app.time}</div>
                                      <div className="flex gap-0.5 flex-wrap justify-end">
                                        {getStatusBadge(app.checkInStatus)}
                                      </div>
                                    </div>
                                    <div className={`${isCompact ? 'text-[9px]' : 'text-[10px]'} font-bold mt-0.5 leading-tight line-clamp-2 whitespace-normal break-words`}>{app.patient}</div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </>
        )}

        {activeTab === 'Pacientes' && !selectedPatientReport && (
          <div className="flex-1 p-6 bg-white overflow-auto flex flex-col">
            <h2 className="text-2xl font-black text-slate-800 uppercase tracking-tight border-b pb-4 mb-6">Directorio de Clientes</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
               {uniquePatients.map(p => (
                 <div key={p.id} className="bg-slate-50 border border-slate-200 p-4 rounded-2xl hover:shadow-lg transition group">
                    <p className="font-black text-slate-900 uppercase text-lg">{p.patient}</p>
                    <p className="text-xs font-bold text-slate-500 mb-4 tracking-tighter">📞 {p.phone}</p>
                    <div className="flex gap-2">
                       <button onClick={() => { setSelectedSlot(p); setShowPatientProfile(true); }} className="flex-1 bg-slate-900 text-white text-[10px] font-black uppercase py-2 rounded-lg hover:bg-slate-800 transition shadow-sm">Editar Perfil</button>
                       <button onClick={() => setSelectedPatientReport(p.patient)} className="flex-1 bg-blue-600 text-white text-[10px] font-black uppercase py-2 rounded-lg hover:bg-blue-700 transition shadow-sm">Ver Firmas</button>
                    </div>
                 </div>
               ))}
            </div>
          </div>
        )}

        {activeTab === 'GFE' && (
          <div className="flex-1 p-6 overflow-hidden">
            <GFEManager patients={appointments} onUpdatePatient={() => {}} />
          </div>
        )}

        {(activeTab === 'Reportes' || selectedPatientReport) && (
          <ReportesView patientFilter={selectedPatientReport} />
        )}
      </main>

      {/* CONFIRMACIÓN DE MOVER */}
      {moveConfirmation && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-[60]">
          <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full overflow-hidden p-6 text-slate-800">
            <h3 className="text-xl font-black mb-4 uppercase text-center text-slate-800 tracking-tight">Confirmar Reubicación</h3>
            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 mb-6 space-y-4">
              <div className="text-center pb-3 border-b border-slate-200">
                <p className="text-[10px] text-slate-500 font-black uppercase tracking-widest mb-1">Paciente</p>
                <p className="font-black text-lg text-slate-900 uppercase">{moveConfirmation.app.patient}</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-red-50 p-3 rounded-lg border border-red-100 text-center">
                  <p className="text-[9px] text-red-500 font-black uppercase tracking-widest mb-1">Actual</p>
                  <p className="text-xs font-bold text-red-900">{moveConfirmation.app.day}</p>
                  <p className="text-xs font-bold text-red-900">{moveConfirmation.app.time}</p>
                </div>
                <div className="bg-emerald-50 p-3 rounded-lg border border-emerald-100 text-center relative">
                  <p className="text-[9px] text-emerald-600 font-black uppercase tracking-widest mb-1">Nuevo</p>
                  <p className="text-xs font-bold text-emerald-900">{moveConfirmation.newDay}</p>
                  <p className="text-xs font-bold text-emerald-900">{moveConfirmation.newTime}</p>
                </div>
              </div>
            </div>
            <div className="flex space-x-3">
              <button onClick={() => setMoveConfirmation(null)} className="flex-1 bg-slate-100 text-slate-700 font-black py-3 rounded-xl hover:bg-slate-200 transition uppercase text-xs shadow-sm">Cancelar</button>
              <button onClick={confirmMove} className="flex-1 bg-blue-600 text-white font-black py-3 rounded-xl hover:bg-blue-700 shadow-md transition uppercase text-xs">Confirmar</button>
            </div>
          </div>
        </div>
      )}

      {/* DETALLE DE LA CITA */}
      {selectedSlot && !showBitacora && !showPatientProfile && !showNewAppointment && activeTab === 'Agenda' && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden border border-slate-200 shadow-2xl flex flex-col max-h-[90vh]">
            <div className="bg-slate-100 px-6 py-4 border-b border-slate-200 flex justify-between items-center shrink-0">
              <h3 className="text-lg font-black text-slate-800 uppercase tracking-tight">{selectedSlot.status === 'booked' ? 'Detalles de la Cita' : 'Horario Disponible'}</h3>
              <button onClick={() => setSelectedSlot(null)} className="text-slate-400 hover:text-slate-600 text-2xl font-black">&times;</button>
            </div>

            <div className="p-6 space-y-4 overflow-y-auto flex-1">
              {selectedSlot.status === 'booked' ? (
                <>
                  <div className="space-y-4">
                    <div>
                      <label className="block text-[10px] font-black text-slate-400 uppercase mb-1">Paciente</label>
                      <div className="flex items-center justify-between bg-white border border-slate-300 rounded-lg p-3 shadow-sm">
                        <div className="flex flex-col">
                          <span className="font-black text-slate-800 text-base">{selectedSlot.patient}</span>
                          <span className="text-xs text-slate-500 font-bold uppercase tracking-tight">📞 {selectedSlot.phone || 'Sin Teléfono'}</span>
                        </div>
                        <button onClick={() => setShowPatientProfile(true)} className="bg-slate-50 text-blue-600 hover:bg-blue-600 hover:text-white text-[10px] font-black flex items-center gap-1.5 px-3 py-1.5 rounded border border-blue-200 transition uppercase shadow-sm">✏️ Perfil</button>
                      </div>
                    </div>

                    <div className="bg-blue-50 border border-blue-200 p-4 rounded-xl shadow-sm space-y-2">
                      <div className="flex justify-between items-center bg-white p-2 rounded border border-blue-100">
                        <span className="text-[10px] font-black text-slate-500 uppercase">Total Tomadas</span>
                        <span className="text-xs font-black text-slate-800">{selectedSlot.historicoSesiones}</span>
                      </div>
                      <div className="flex justify-between items-center bg-white p-2 rounded border border-blue-100">
                        <span className="text-[10px] font-black text-slate-500 uppercase">Último Paquete</span>
                        <span className="text-xs font-black text-blue-700">
                          {selectedSlot.packageHistory && selectedSlot.packageHistory.length > 0 ? selectedSlot.packageHistory[0].amount : 0} sesiones
                        </span>
                      </div>
                      <div className={`p-2 rounded flex justify-between items-center text-white shadow-sm ${selectedSlot.saldoSesiones > 0 ? 'bg-emerald-600' : 'bg-red-600'}`}>
                        <span className="text-xs font-black uppercase">Pendientes (Disponibles)</span>
                        <span className="text-lg font-black">{selectedSlot.saldoSesiones}</span>
                      </div>
                    </div>

                    <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 shadow-sm">
                      <label className="block text-[10px] font-black text-slate-500 mb-2 uppercase">Flujo del Paciente (Check-in)</label>
                      <div className="flex flex-wrap gap-2">
                        {checkInStatuses.map(status => (
                          <button key={status} onClick={() => handleFieldChange('checkInStatus', status)} className={`px-3 py-1 text-[10px] font-black rounded-full border transition-all uppercase ${(selectedSlot.checkInStatus || 'Agendado') === status ? getStatusStyle(status) : 'bg-white text-slate-400 border-slate-200 hover:bg-slate-100 shadow-sm'}`}>
                            {status}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </>
              ) : (
                <div className="space-y-4">
                  <div className="bg-slate-50 p-4 rounded-lg border border-slate-200 flex justify-between items-center shadow-sm">
                    <div><p className="text-[10px] text-slate-500 font-black uppercase tracking-widest">Día / Hora</p><p className="text-base font-black text-slate-800 uppercase tracking-tight">{selectedSlot.day} • {selectedSlot.time}</p></div>
                    <div className="text-right"><p className="text-[10px] text-slate-500 font-black uppercase tracking-widest">Equipo</p><p className="text-base font-black text-blue-600 uppercase tracking-tight">{selectedSlot.equipment}</p></div>
                  </div>
                  <button onClick={() => setShowNewAppointment(true)} className="w-full bg-green-600 text-white font-black py-3 rounded-xl hover:bg-green-700 shadow-lg transition uppercase tracking-widest">Agendar Nuevo Paciente</button>
                </div>
              )}
            </div>

            <div className="p-6 pt-0 shrink-0">
              <div className="flex space-x-3 pt-4 border-t border-slate-200">
                <button onClick={() => setSelectedSlot(null)} className="flex-1 bg-slate-100 text-slate-700 font-black py-3 rounded-xl hover:bg-slate-200 transition uppercase shadow-sm">Cerrar</button>
                {selectedSlot.status === 'booked' && (
                  <button onClick={() => setShowBitacora(true)} className="flex-1 bg-blue-600 text-white py-3 rounded-xl font-black uppercase text-xs shadow-md hover:bg-blue-700 transition">
                    Abrir Bitácora
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {showNewAppointment && (
        <NewAppointmentModal selectedSlot={selectedSlot || { equipment: 'Cámara 1', day: 'Lunes', time: '09:00 AM' }} existingPatients={appointments} onSave={handleSaveNewAppointment} onClose={() => { setShowNewAppointment(false); setSelectedSlot(null); }} />
      )}

      {showPatientProfile && selectedSlot && (
        <PatientProfileModal initialData={selectedSlot} onSave={handleSavePatientProfile} onClose={() => setShowPatientProfile(false)} />
      )}

      {showBitacora && selectedSlot && (
        <BitacoraModal selectedSlot={selectedSlot} onClose={() => setShowBitacora(false)} onSeal={handleSealBitacora} />
      )}
    </div>
  );
}