"use client";
import React, { useState, useEffect, useMemo } from 'react';
import { supabaseShenandoah, supabaseGdl } from '../lib/supabase';
import BitacoraModal from '../components/BitacoraModal';
import PatientProfileModal from '../components/PatientProfileModal';
import GFEManager from '../components/GFEManager';

export default function AppLayout() {
  // --- SEGURIDAD Y JERARQUÍA ---
  const [currentUser, setCurrentUser] = useState(null);
  const [loginPin, setLoginPin] = useState('');

  // --- ESTADOS PRINCIPALES ---
  const [activeClinic, setActiveClinic] = useState('Guadalajara'); 
  const [activeTab, setActiveTab] = useState('Agenda');
  const [viewMode, setViewMode] = useState('Día'); 
  const [equipmentFilter, setEquipmentFilter] = useState('Todos');
  const [zoomScale, setZoomScale] = useState(100);
  const [currentDate, setCurrentDate] = useState(new Date());
  
  // --- RELOJ MULTIHUSO HORARIO ---
  const [clinicNow, setClinicNow] = useState({ mins: 0, dateStr: '' });

  // Moneda Dinámica
  const currencyStr = activeClinic === 'Shenandoah' ? 'USD' : 'MXN';

  // --- MODALES Y SELECCIÓN ---
  const [showBitacora, setShowBitacora] = useState(false);
  const [showPatientProfile, setShowPatientProfile] = useState(false);
  const [showNewAppointment, setShowNewAppointment] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState(null);
  const [draggedApp, setDraggedApp] = useState(null);
  const [moveConfirmation, setMoveConfirmation] = useState(null);
  const [showAudit, setShowAudit] = useState(false);
  const [auditLogs, setAuditLogs] = useState([]);
  const [globalAuditLogs, setGlobalAuditLogs] = useState([]); 

  // --- BASE DE DATOS ---
  const [dbPatients, setDbPatients] = useState([]);
  const [dbServices, setDbServices] = useState([]);
  const [dbAppointments, setDbAppointments] = useState([]);
  const [dbUsers, setDbUsers] = useState([]);
  const [dbRoles, setDbRoles] = useState([]);
  const [dbBlockedSlots, setDbBlockedSlots] = useState([]);
  const [dbProtocols, setDbProtocols] = useState([]);
  const [dbCompanyConfig, setDbCompanyConfig] = useState({ 
    id: null, 
    name: 'OXYGENGDL', 
    address: '', 
    phone: '', 
    ticket_message: 'Gracias por su preferencia', 
    start_time: '07:00', 
    end_time: '20:00', 
    interval_mins: 30,
    booking_limit_hours: 2,
    cancel_limit_hours: 24,
    master_pin: '000000',
    financial_pin: '123456',
    notify_on_booking: true,
    reminder_hours: 24
  });
  
  const [dbStatus, setDbStatus] = useState('cargando'); 
  const [searchQuery, setSearchQuery] = useState('');
  const [dbErrorMessage, setDbErrorMessage] = useState('');

  // --- FORMULARIOS GLOBALES ---
  const [newSrv, setNewSrv] = useState({ id: null, name: '', duration: 60, buffer: 30, price: 100, color: 'blue', is_active: true, equipment: 'Cámara 1' });
  const [isEditingSrv, setIsEditingSrv] = useState(false);
  
  const [newProtocol, setNewProtocol] = useState({ id: null, name: '', is_active: true });
  const [isEditingProtocol, setIsEditingProtocol] = useState(false);

  const [newRole, setNewRole] = useState({ id: null, name: '', level: 3 });
  const [isEditingRole, setIsEditingRole] = useState(false);

  const [newUser, setNewUser] = useState({ id: null, name: '', role: 'Técnico Certificado IBUM', cert: '', is_active: true, pin: '' });
  const [isEditingUser, setIsEditingUser] = useState(false);

  const [showNewPatientModal, setShowNewPatientModal] = useState(false);
  const [newPatientData, setNewPatientData] = useState({ name: '', phone: '', email: '', protocol: 'Wellness', notes: '', prefers_email: true, prefers_sms: true });
  
  const [showOOOModal, setShowOOOModal] = useState(false);
  const [oooData, setOOOData] = useState({ date: '', start_time: '07:00', end_time: '19:00', is_global: true, equipment: 'Todos', reason: 'Festivo / Mantenimiento' });

  // --- REPORTES Y SEGURIDAD ---
  const [isReportsUnlocked, setIsReportsUnlocked] = useState(false);
  const [pinInput, setPinInput] = useState('');
  const [reportFilter, setReportFilter] = useState('Día');
  const [reportDate, setReportDate] = useState(new Date().toISOString().split('T')[0]);
  const [reportStartDate, setReportStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [reportEndDate, setReportEndDate] = useState(new Date().toISOString().split('T')[0]);
  const [selectedPatientReport, setSelectedPatientReport] = useState('');

  const activeSupabase = activeClinic === 'Shenandoah' ? supabaseShenandoah : supabaseGdl;

  // CÁLCULO DE JERARQUÍA
  const currentUserLevel = currentUser?.id === 'admin' ? 1 : (dbRoles.find(r => r.name === currentUser?.role)?.level || 3);

  // Actualizador de Reloj por Clínica
  useEffect(() => {
    const updateTime = () => {
      const tz = activeClinic === 'Shenandoah' ? 'America/Chicago' : 'America/Mexico_City';
      const now = new Date();
      const localStr = now.toLocaleString("en-US", { timeZone: tz });
      const d = new Date(localStr);
      setClinicNow({
        mins: d.getHours() * 60 + d.getMinutes(),
        dateStr: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      });
    };
    updateTime();
    const interval = setInterval(updateTime, 60000);
    return () => clearInterval(interval);
  }, [activeClinic]);

  // Bloqueo automático SOLO para la pestaña de Ventas
  useEffect(() => {
    if (activeTab !== 'Reportes' || reportFilter !== 'Ventas') {
      setIsReportsUnlocked(false);
      setPinInput('');
    }
  }, [activeTab, reportFilter]);

  // Fetch de Auditoría Global al entrar a esa pestaña
  useEffect(() => {
    if (activeTab === 'Reportes' && reportFilter === 'Caja Negra' && activeSupabase) {
      activeSupabase.from('audit_logs').select('*').order('timestamp', { ascending: false }).limit(200)
        .then(({data}) => setGlobalAuditLogs(data || []));
    }
  }, [activeTab, reportFilter, activeSupabase]);

  // Normalizador de texto para búsqueda inteligente
  const normalizeStr = (str) => String(str).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

  // Helper de Tiempo
  const getMinutes = (t) => {
    if (!t) return 0;
    const parts = String(t).split(' ');
    let [h, m] = parts[0].split(':').map(Number);
    if (isNaN(h)) h = 0; 
    if (isNaN(m)) m = 0;
    if (parts[1] === 'PM' && h !== 12) h += 12;
    if (parts[1] === 'AM' && h === 12) h = 0;
    return h * 60 + m;
  };

  const isPastTime = (dateStr, timeStr) => {
    if (dateStr < clinicNow.dateStr) return true;
    if (dateStr === clinicNow.dateStr && getMinutes(timeStr) < clinicNow.mins) return true;
    return false;
  };

  const checkOverlap = (equipment, targetDate, targetTimeStr, dur, buffer, ignoreId) => {
    const start1 = getMinutes(targetTimeStr);
    const end1 = start1 + Number(dur) + Number(buffer);
    return dbAppointments.some(a => {
      if (a.id === ignoreId || a.check_in_status === 'Cancelado') return false;
      if (a.equipment !== equipment || a.full_date !== targetDate) return false;
      const start2 = getMinutes(a.time);
      const end2 = start2 + (Number(a.duration)||60) + (Number(a.buffer)||0);
      return (start1 < end2 && end1 > start2);
    });
  };

  // --- AUDITORÍA CAJA NEGRA ---
  const logAudit = async (appId, patientName, action, details) => {
    if (!activeSupabase || !currentUser) return;
    try {
      await activeSupabase.from('audit_logs').insert([{
        appointment_id: appId,
        patient_name: patientName,
        action: action,
        changed_by: currentUser.name,
        details: details
      }]);
    } catch (e) {
      console.error("No se pudo guardar la auditoría", e);
    }
  };

  const loadAuditLogs = async (appId) => {
    if (!activeSupabase) return;
    try {
      const { data } = await activeSupabase.from('audit_logs').select('*').eq('appointment_id', appId).order('timestamp', { ascending: false });
      setAuditLogs(data || []);
      setShowAudit(true);
    } catch (e) {
      alert("Error leyendo auditoría");
    }
  };

  // --- MOTOR INTELIGENTE AUTO-ADAPTABLE (TX / GDL) ---
  const savePatientToDB = async (db, pData) => {
    const trimmedName = pData.name.trim();
    const trimmedPhone = pData.phone.trim();
    
    // Candado Anti-Clones
    const isClone = dbPatients.some(p => normalizeStr(p.patient) === normalizeStr(trimmedName) || (p.phone && p.phone === trimmedPhone && trimmedPhone.length > 0));
    if (isClone) return { error: { message: "CLON_DETECTADO" } };

    // Envío quirúrgico de 'notes' en minúsculas
    let res = await db.from('patients').insert([{
      Name: trimmedName,
      Phone: trimmedPhone,
      Email: pData.email.trim(),
      protocol: pData.protocol,
      notes: pData.notes,
      prefers_email: pData.prefers_email !== false,
      prefers_sms: pData.prefers_sms !== false
    }]).select();

    // 2. Si falla por choque de columnas, adapta a formato GDL (Minúsculas completas)
    if (res.error && res.error.message.toLowerCase().includes('column')) {
      res = await db.from('patients').insert([{
        name: trimmedName,
        phone: trimmedPhone,
        email: pData.email.trim(),
        protocol: pData.protocol,
        notes: pData.notes,
        prefers_email: pData.prefers_email !== false,
        prefers_sms: pData.prefers_sms !== false
      }]).select();
    }
    return res;
  };

  // --- SINCRONIZACIÓN CON PAGINACIÓN INTELIGENTE ---
  const fetchAllData = async () => {
    if (!activeSupabase) { 
      setDbStatus('sin_llaves'); 
      return; 
    }

    try {
      setDbStatus('cargando');
      // --- BLINDAJE INICIAL ---
      setDbPatients([]);
      setDbAppointments([]);
      setDbServices([]);
      // -------------------------

      // Motor de Paginación para evadir el límite de 1000 de Supabase
      const fetchPaginated = async (table) => {
        let allData = [];
        let from = 0;
        const step = 1000;
        while (true) {
          const { data, error } = await activeSupabase.from(table).select('*').range(from, from + step - 1);
          if (error) throw error;
          if (!data || data.length === 0) break;
          allData = [...allData, ...data];
          if (data.length < step) break;
          from += step;
        }
        return allData;
      };

      const [patientsData, appointmentsData, resS, resU, resB, resC, resProt, resRoles] = await Promise.all([
        fetchPaginated('patients'),
        fetchPaginated('appointments'),
        activeSupabase.from('services').select('*'),
        activeSupabase.from('users_staff').select('*'),
        activeSupabase.from('blocked_slots').select('*'),
        activeSupabase.from('company_config').select('*').eq('clinic', activeClinic).maybeSingle(),
        activeSupabase.from('protocols').select('*'),
        activeSupabase.from('user_roles').select('*')
      ]);

      const safePatients = (patientsData || []).map(p => ({
        id: p.id,
        patient: String(p.Name || p.name || p.Nombre || 'Sin Nombre'),
        phone: String(p.Phone || p.phone || ''),
        email: String(p.Email || p.email || ''),
        protocol: String(p.protocol || ''),
        notes: String(p.notes || p.Notes || ''),
        is_blocked: p.is_blocked || false,
        prefers_email: p.prefers_email !== false,
        prefers_sms: p.prefers_sms !== false,
        wallets: p.wallets || {},
        packageHistory: p.package_history || [],
        historicoSesiones: p.historico_sesiones || 0
      }));

      setDbPatients(safePatients.sort((a, b) => a.patient.localeCompare(b.patient)));
      
      const safeServices = resS.data || [];
      setDbServices(safeServices.sort((a, b) => (a.name || '').localeCompare(b.name || '')));
      setDbUsers(resU.data || []);
      setDbBlockedSlots(resB.data || []);
      setDbProtocols(resProt.data || []);
      setDbRoles(resRoles.data || []);
      
      if (resC.data) {
        setDbCompanyConfig({ ...dbCompanyConfig, ...resC.data });
      } else {
        const defaultCfg = { 
          clinic: activeClinic, 
          name: activeClinic === 'Shenandoah' ? 'REGENOXY LLC' : 'OXYGENGDL', 
          address: '', 
          phone: '', 
          ticket_message: 'Gracias por su preferencia', 
          start_time: '07:00', 
          end_time: '20:00', 
          interval_mins: 30,
          booking_limit_hours: 2,
          cancel_limit_hours: 24,
          master_pin: '000000',
          financial_pin: '123456',
          notify_on_booking: true,
          reminder_hours: 24
        };
        await activeSupabase.from('company_config').insert([defaultCfg]);
        setDbCompanyConfig(defaultCfg);
      }

      setDbAppointments(appointmentsData || []);
      setDbStatus('listo');
    } catch (err) {
      console.error(err);
      setDbErrorMessage(err.message);
      setDbStatus('error');
    }
  };

  useEffect(() => { 
    fetchAllData(); 
  }, [activeClinic]);

  // --- MOTORES DE ACCESO Y SEGURIDAD ---
  const handleLoginSubmit = () => {
    if (loginPin === '1234567890') {
      setCurrentUser({ id: 'admin', name: 'ADMINISTRADOR SUPREMO', role: 'Super Administrador Supremo' });
      setLoginPin('');
      return;
    }
    const masterLock = dbCompanyConfig.master_pin || '000000';
    if (String(loginPin) === String(masterLock)) {
       setCurrentUser({ id: 'admin', name: 'Administrador Maestro', role: 'Super Administrador Maestro' });
    } else {
       const u = dbUsers.find(x => String(x.pin) === String(loginPin) && x.is_active);
       if(u) setCurrentUser(u);
       else { alert("PIN Incorrecto o Usuario Inactivo"); setLoginPin(''); }
    }
  };

  const handleFinancialUnlock = () => {
    const lock = dbCompanyConfig.financial_pin || '123456';
    if (String(pinInput) === String(currentUser?.pin) || String(pinInput) === String(lock)) {
        setIsReportsUnlocked(true); 
    } else { 
        alert('NIP Financiero Incorrecto'); 
        setPinInput(''); 
    }
  };

  // --- LÓGICA DE TIEMPOS Y CALENDARIO ---
  const currentDateISO = new Date(currentDate).toISOString().split('T')[0];
  const currentFullDate = currentDateISO; 

  const weekDays = useMemo(() => {
    const start = new Date(currentDate);
    const day = start.getDay();
    const diff = start.getDate() - day + (day === 0 ? -6 : 1);
    start.setDate(diff);
    
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      return {
        name: ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'][i],
        date: d.toLocaleDateString('es-MX', { day: '2-digit', month: 'short' }),
        fullDate: d.toISOString().split('T')[0]
      };
    });
  }, [currentDate]);

  const currentDayInfo = weekDays.find(d => d.fullDate === currentDateISO) || weekDays[0];

  const navigateDate = (direction) => {
    const newDate = new Date(currentDate);
    if (viewMode === 'Día') { 
      newDate.setDate(currentDate.getDate() + direction); 
    } else { 
      newDate.setDate(currentDate.getDate() + (direction * 7)); 
    }
    setCurrentDate(newDate);
  };

  const calculateEndTime = (start, dur) => {
    const total = getMinutes(start) + (Number(dur) || 0);
    const h = Math.floor(total / 60);
    const m = total % 60;
    const mod = h >= 12 ? 'PM' : 'AM';
    const dispH = h > 12 ? h - 12 : h === 0 ? 12 : h;
    return `${dispH.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')} ${mod}`;
  };

  const PIXELS_PER_MINUTE = 1.5;
  const startMins = getMinutes(dbCompanyConfig.start_time || '07:00');
  const endMins = getMinutes(dbCompanyConfig.end_time || '20:00');
  const intervalMins = Number(dbCompanyConfig.interval_mins) || 30;
  
  const CALENDAR_HEIGHT = (endMins - startMins) * PIXELS_PER_MINUTE;
  const currentColWidth = (160 * zoomScale) / 100;
  const isCompact = currentColWidth < 100;

  const timeToPixels = (timeStr) => {
    return (getMinutes(timeStr) - startMins) * PIXELS_PER_MINUTE;
  };

  const activeServices = dbServices.filter(s => s.is_active);
  const dynamicColumns = activeServices.map(s => s.name);
  const displayedEquipments = equipmentFilter === 'Todos' ? dynamicColumns : [equipmentFilter];

  const timeOptions = useMemo(() => {
    const slots = [];
    for (let m = startMins; m < endMins; m += intervalMins) {
      const h = Math.floor(m / 60); 
      const mins = m % 60; 
      const ampm = h >= 12 ? 'PM' : 'AM'; 
      const displayH = h > 12 ? h - 12 : h === 0 ? 12 : h;
      slots.push(`${displayH.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')} ${ampm}`);
    }
    return slots;
  }, [startMins, endMins, intervalMins]);

  const getEquipmentColors = (color) => {
    const map = { 
      blue: 'bg-blue-50 border-blue-500 text-blue-900', rose: 'bg-rose-50 border-rose-500 text-rose-900', 
      emerald: 'bg-emerald-50 border-emerald-500 text-emerald-900', purple: 'bg-purple-50 border-purple-500 text-purple-900',
      amber: 'bg-amber-50 border-amber-500 text-amber-900', cyan: 'bg-cyan-50 border-cyan-500 text-cyan-900',
      indigo: 'bg-indigo-50 border-indigo-500 text-indigo-900', fuchsia: 'bg-fuchsia-50 border-fuchsia-500 text-fuchsia-900',
      pink: 'bg-pink-50 border-pink-500 text-pink-900', orange: 'bg-orange-50 border-orange-500 text-orange-900',
      teal: 'bg-teal-50 border-teal-500 text-teal-900', violet: 'bg-violet-50 border-violet-500 text-violet-900'
    };
    return map[color] || 'bg-slate-50 border-slate-500 text-slate-900';
  };

  const getEquipmentBgColor = (color) => {
    const map = { 
      blue: 'bg-blue-100/60', rose: 'bg-rose-100/60', emerald: 'bg-emerald-100/60', 
      purple: 'bg-purple-100/60', amber: 'bg-amber-100/60', cyan: 'bg-cyan-100/60', 
      indigo: 'bg-indigo-100/60', fuchsia: 'bg-fuchsia-100/60', pink: 'bg-pink-100/60', 
      orange: 'bg-orange-100/60', teal: 'bg-teal-100/60', violet: 'bg-violet-100/60'
    };
    return map[color] || 'bg-slate-100/60';
  };

  const getEquipmentHeaderColor = (color) => {
    const map = { 
      blue: 'bg-blue-600 text-white', rose: 'bg-rose-600 text-white', emerald: 'bg-emerald-600 text-white', 
      purple: 'bg-purple-600 text-white', amber: 'bg-amber-600 text-white', cyan: 'bg-cyan-600 text-white',
      indigo: 'bg-indigo-600 text-white', fuchsia: 'bg-fuchsia-600 text-white', pink: 'bg-pink-600 text-white',
      orange: 'bg-orange-600 text-white', teal: 'bg-teal-600 text-white', violet: 'bg-violet-600 text-white'
    };
    return map[color] || 'bg-slate-800 text-white';
  };

  const getDynamicColorClass = (color) => {
    const map = {
      blue: 'bg-blue-500', rose: 'bg-rose-500', emerald: 'bg-emerald-500', 
      purple: 'bg-purple-500', amber: 'bg-amber-500', cyan: 'bg-cyan-500', 
      indigo: 'bg-indigo-500', fuchsia: 'bg-fuchsia-500', pink: 'bg-pink-500', 
      orange: 'bg-orange-500', teal: 'bg-teal-500', violet: 'bg-violet-500'
    };
    return map[color] || 'bg-slate-500';
  };

  const getStatusBadge = (status) => {
    if (!status || status === 'Agendado') return null;
    let badgeClass = ''; let icon = '';
    if (status === 'Llegó') { badgeClass = 'bg-amber-200 text-amber-900'; icon = '🚶'; }
    if (status === 'En Sesión') { badgeClass = 'bg-emerald-200 text-emerald-900'; icon = '🟢'; }
    if (status === 'Finalizado') { badgeClass = 'bg-slate-300 text-slate-700'; icon = '✔️'; }
    if (status === 'No Asistió' || status === 'Cancelado') { badgeClass = 'bg-red-200 text-red-900'; icon = '❌'; }
    if (status === 'Devuelto') { badgeClass = 'bg-purple-200 text-purple-900'; icon = '↩️'; }
    return (
      <span title={status} className={`text-[8px] font-black px-1 rounded shadow-sm flex items-center gap-0.5 ${badgeClass}`}>
        {icon} {!isCompact && <span>{status}</span>}
      </span>
    );
  };

  const filteredPatients = dbPatients.filter(p => {
    const term = normalizeStr(searchQuery);
    const pName = normalizeStr(p.patient);
    const pPhone = normalizeStr(p.phone);
    return pName.includes(term) || pPhone.includes(term);
  });

  // --- CANCELACIÓN GLOBAL DE VENTAS DESDE REPORTES ---
  const handleCancelGlobalTransaction = async (tx, patientId, patientName) => {
    if (!window.confirm(`¿ESTÁS SEGURO? Estás a punto de CANCELAR el ticket de $${tx.price} y revertirle a ${patientName} sus ${tx.sessions} sesiones de ${tx.serviceName}. Esta acción es irreversible y quedará auditada.`)) {
      return;
    }

    try {
      const p = dbPatients.find(x => String(x.id) === String(patientId));
      if (!p) return alert("Paciente no encontrado.");

      const eqName = tx.equipment || tx.serviceName;
      const currentWallets = { ...p.wallets };
      const newBalance = Math.max(0, (currentWallets[eqName] || 0) - tx.sessions);
      currentWallets[eqName] = newBalance;

      const newHistory = (p.packageHistory || []).filter(t => String(t.id) !== String(tx.id));

      await activeSupabase.from('patients').update({
          wallets: currentWallets,
          package_history: newHistory
      }).eq('id', p.id);

      await logAudit(null, patientName, 'REVERSIÓN DE VENTA', `Se canceló ticket por $${tx.price} y se restaron ${tx.sessions} sesiones de ${eqName}.`);
      alert("Venta cancelada exitosamente.");
      fetchAllData();
    } catch (e) {
      alert("Error al cancelar la venta.");
    }
  };

  // --- EVENTOS Y LÓGICA DE CITAS ---
  const handleDragStart = (e, app) => { 
    setDraggedApp(app); 
    e.dataTransfer.effectAllowed = "move"; 
    e.dataTransfer.setData("text/plain", app.id); 
  };
  
  const handleDragOver = (e) => { 
    e.preventDefault(); 
    e.dataTransfer.dropEffect = "move"; 
  };
  
  const handleDrop = (e, newTime, newEquipment, newDay, newFullDate) => {
    e.preventDefault();
    if (!draggedApp) return;

    if (isPastTime(newFullDate, newTime)) {
      alert("🔒 No puedes reubicar citas al pasado.");
      setDraggedApp(null);
      return;
    }

    const pInfo = dbPatients.find(x => normalizeStr(x.patient) === normalizeStr(draggedApp.patient));
    if (pInfo && pInfo.is_blocked) {
      alert("🚫 Paciente Bloqueado por Administración. No se pueden reubicar ni alterar sus citas.");
      setDraggedApp(null);
      return;
    }

    if (checkOverlap(newEquipment, newFullDate, newTime, draggedApp.duration, draggedApp.buffer, draggedApp.id)) {
      alert("🔒 Empalme de horario: Ya hay una cita que choca con ese espacio en esa cámara.");
      setDraggedApp(null);
      return;
    }

    setMoveConfirmation({ app: draggedApp, newTime, newEquipment, newDay, newFullDate });
    setDraggedApp(null);
  };

  const confirmMove = async () => {
    try {
      const { error } = await activeSupabase.from('appointments').update({ 
        time: moveConfirmation.newTime, 
        appointment_time: moveConfirmation.newTime,
        equipment: moveConfirmation.newEquipment, 
        day: moveConfirmation.newDay,
        full_date: moveConfirmation.newFullDate,
        appointment_date: moveConfirmation.newFullDate 
      }).eq('id', moveConfirmation.app.id);
      
      if (error) alert("Error al mover la cita: " + error.message);
      else {
        await logAudit(moveConfirmation.app.id, moveConfirmation.app.patient, 'REUBICACIÓN', `De ${moveConfirmation.app.full_date} ${moveConfirmation.app.time} a ${moveConfirmation.newFullDate} ${moveConfirmation.newTime} en ${moveConfirmation.newEquipment}`);
      }
      
      setMoveConfirmation(null); 
      fetchAllData();
    } catch (e) {
      alert("Error de conexión: " + e.message);
    }
  };

  const updateAppStatus = async (id, status, patientName) => {
    try {
      await activeSupabase.from('appointments').update({ check_in_status: status }).eq('id', id);
      await logAudit(id, patientName, 'CAMBIO DE ESTATUS', `Estatus actualizado a: ${status}`);
      setSelectedSlot(null);
      fetchAllData();
    } catch(e) { alert("Error actualizando estatus."); }
  };

  const handleRefund = async (app) => {
    if (window.confirm('¿Seguro que deseas cancelar el cobro y devolver la sesión a la cartera del paciente?')) {
      const p = dbPatients.find(x => normalizeStr(x.patient) === normalizeStr(app.patient));
      if (p) {
        const currentWallets = p.wallets || {};
        currentWallets[app.equipment] = (currentWallets[app.equipment] || 0) + 1;
        await activeSupabase.from('patients').update({ wallets: currentWallets }).eq('id', p.id);
      }
      await activeSupabase.from('appointments').update({ check_in_status: 'Devuelto' }).eq('id', app.id);
      await logAudit(app.id, app.patient, 'DEVOLUCIÓN DE SESIÓN', `Sesión devuelta a cartera por cancelación de cobro.`);
      fetchAllData();
    }
  };

  // --- MOTOR DE IMPRESIÓN CON IFRAME (Anti-bloqueo) ---
  const printHTML = (htmlContent, title) => {
    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = 'none';
    document.body.appendChild(iframe);

    const doc = iframe.contentWindow.document;
    doc.open();
    doc.write(`<html><head><title>${title}</title></head><body style="margin:0;">${htmlContent}</body></html>`);
    doc.close();

    iframe.contentWindow.focus();
    setTimeout(() => {
      iframe.contentWindow.print();
      setTimeout(() => {
        document.body.removeChild(iframe);
      }, 1000);
    }, 500);
  };

  const printPatientBitacora = (patientName) => {
    const apps = dbAppointments.filter(a => String(a.patient) === String(patientName) && a.check_in_status === 'Finalizado').sort((a,b) => new Date(b.full_date) - new Date(a.full_date));
    if(apps.length === 0) return alert("Este paciente no tiene citas finalizadas.");

    const ROWS_PER_PAGE = 15;
    let pagesHTML = '';
    
    for (let i = 0; i < apps.length; i += ROWS_PER_PAGE) {
      const chunk = apps.slice(i, i + ROWS_PER_PAGE);
      const rowsHTML = chunk.map(a => `
        <tr>
          <td style="border: 1px solid #000; padding: 8px; font-size: 12px;">${new Date(a.full_date).toLocaleDateString()} - ${a.time}</td>
          <td style="border: 1px solid #000; padding: 8px; font-size: 12px;">${a.equipment}</td>
          <td style="border: 1px solid #000; padding: 8px; font-size: 12px;">${a.attendant || 'N/A'}</td>
          <td style="border: 1px solid #000; padding: 8px; text-align: center; height: 50px;">
            ${a.signature ? `<img src="${a.signature}" style="max-height: 40px;"/>` : '<span style="color:#ccc; font-style:italic;">Firma Física</span>'}
          </td>
        </tr>
      `).join('');

      pagesHTML += `
        <div style="padding: 40px; font-family: sans-serif; page-break-after: always;">
          <div style="text-align: center; margin-bottom: 30px;">
            <h1 style="margin: 0; font-size: 24px; text-transform: uppercase;">${dbCompanyConfig.name || 'OXYHYPERBARIC'}</h1>
            <p style="margin: 0; font-size: 12px;">${dbCompanyConfig.address || ''} | Tel: ${dbCompanyConfig.phone || ''}</p>
            <h2 style="margin-top: 20px; font-size: 18px; border-bottom: 2px solid #000; display: inline-block; padding-bottom: 5px;">BITÁCORA OFICIAL DE ASISTENCIA</h2>
          </div>
          <div style="margin-bottom: 20px;">
            <p style="margin: 0; font-weight: bold; font-size: 14px; text-transform: uppercase;">PACIENTE: ${patientName}</p>
            <p style="margin: 0; font-size: 12px; color: #555;">Fecha de Impresión: ${new Date().toLocaleDateString()}</p>
          </div>
          <table style="width: 100%; border-collapse: collapse;">
            <thead>
              <tr style="background-color: #f1f5f9;">
                <th style="border: 1px solid #000; padding: 10px; text-align: left; font-size: 12px;">FECHA Y HORA</th>
                <th style="border: 1px solid #000; padding: 10px; text-align: left; font-size: 12px;">SERVICIO MÉDICO</th>
                <th style="border: 1px solid #000; padding: 10px; text-align: left; font-size: 12px;">ATENDIÓ</th>
                <th style="border: 1px solid #000; padding: 10px; text-align: center; font-size: 12px;">FIRMA DEL PACIENTE</th>
              </tr>
            </thead>
            <tbody>${rowsHTML}</tbody>
          </table>
        </div>
      `;
    }

    printHTML(pagesHTML, `Expediente - ${patientName}`);
  };

  const renderBackgroundSlots = (equipment, day, fullDate) => {
    const slots = [];
    for (let m = startMins; m < endMins; m += intervalMins) {
      const h = Math.floor(m / 60); 
      const mins = m % 60; 
      const ampm = h >= 12 ? 'PM' : 'AM'; 
      const displayH = h > 12 ? h - 12 : h === 0 ? 12 : h;
      slots.push(`${displayH.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')} ${ampm}`);
    }
    
    const srv = dbServices.find(s => s.name === equipment) || { duration: 60, buffer: 30, id: null };

    return slots.map((time, idx) => (
      <div 
        key={idx} 
        onClick={() => {
          if (isPastTime(fullDate, time)) {
             alert("🔒 No puedes agendar citas en el pasado.");
             return;
          }
          setSelectedSlot({ 
            time, equipment, day, fullDate, status: 'available',
            duration: srv.duration, buffer: srv.buffer, serviceId: srv.id,
            is_new_patient: false, prefers_email: true, prefers_sms: true
          });
          setShowNewAppointment(true);
        }} 
        onDragOver={handleDragOver} 
        onDrop={(e) => handleDrop(e, time, equipment, day, fullDate)} 
        className="border-b border-slate-300 hover:shadow-[inset_0_2px_0_0_#3b82f6] cursor-pointer transition-colors box-border" 
        style={{ height: `${intervalMins * PIXELS_PER_MINUTE}px` }}
      />
    ));
  };

  const isNewPatientInline = selectedSlot?.patient && selectedSlot.patient.length > 0 && !dbPatients.find(x => normalizeStr(x.patient) === normalizeStr(selectedSlot.patient));

  return (
    <div className="flex h-screen bg-slate-50 font-sans text-slate-900 overflow-hidden relative">
      
      {/* CAPA DE BLOQUEO: INICIAR TURNO Y LLAVE MAESTRA */}
      {!currentUser && (
        <div className="fixed inset-0 bg-slate-900/95 backdrop-blur-md flex items-center justify-center z-[99999]">
           <div className="bg-white p-10 rounded-3xl shadow-2xl w-full max-w-sm text-center border">
             <img src="/1c3300f3-f5e7-4682-b627-257e868ed467.jpg" className="h-20 mx-auto mb-6 rounded-xl shadow-sm" alt="Logo"/>
             <h2 className="text-2xl font-black uppercase mb-2 text-slate-800">🔒 Acceso</h2>
             <p className="text-xs font-bold text-slate-500 mb-8 uppercase">Ingresa tu NIP de 6 dígitos</p>
             <input 
               type="password" 
               maxLength="10" 
               value={loginPin} 
               onChange={e => setLoginPin(e.target.value)} 
               onKeyDown={e => {
                 if (e.key === 'Enter') {
                   if (loginPin === '1234567890') {
                     setCurrentUser({ id: 'admin', name: 'ADMINISTRADOR SUPREMO', role: 'Super Administrador Supremo' });
                     setLoginPin('');
                     return;
                   }
                   const masterLock = dbCompanyConfig.master_pin || '000000';
                   if (String(loginPin) === String(masterLock)) {
                      setCurrentUser({ id: 'admin', name: 'Administrador Maestro', role: 'Super Administrador Maestro' });
                   } else {
                      const u = dbUsers.find(x => String(x.pin) === String(loginPin) && x.is_active);
                      if(u) setCurrentUser(u);
                      else { alert("PIN Incorrecto o Usuario Inactivo"); setLoginPin(''); }
                   }
                 }
               }}
               className="w-full text-center text-3xl tracking-[0.2em] font-black p-4 border-2 border-slate-200 rounded-xl outline-none focus:border-blue-500 mb-6 bg-slate-50 text-slate-900" 
             />
             <button onClick={() => {
               if (loginPin === '1234567890') {
                 setCurrentUser({ id: 'admin', name: 'ADMINISTRADOR SUPREMO', role: 'Super Administrador Supremo' });
                 setLoginPin('');
                 return;
               }
               const masterLock = dbCompanyConfig.master_pin || '000000';
               if (String(loginPin) === String(masterLock)) {
                  setCurrentUser({ id: 'admin', name: 'Administrador Maestro', role: 'Super Administrador Maestro' });
               } else {
                  const u = dbUsers.find(x => String(x.pin) === String(loginPin) && x.is_active);
                  if(u) setCurrentUser(u);
                  else { alert("PIN Incorrecto o Usuario Inactivo"); setLoginPin(''); }
               }
             }} className="w-full bg-blue-600 text-white font-black py-4 rounded-xl uppercase text-sm shadow-md hover:bg-blue-700 transition">
               Entrar
             </button>
           </div>
        </div>
      )}

      {/* SIDEBAR */}
      <aside className="w-64 bg-slate-900 text-slate-300 flex flex-col shadow-2xl z-30 shrink-0">
        <div className="p-6 border-b border-slate-800 bg-slate-950 flex flex-col items-center">
          <img src="/1c3300f3-f5e7-4682-b627-257e868ed467.jpg" alt="Logo" className="h-16 w-auto object-contain mb-3 bg-white rounded p-1" />
          <h1 className="text-lg font-black text-white uppercase tracking-widest text-center">OxyHyperbaric</h1>
        </div>
        
        {currentUser && (
           <div className="px-4 py-3 bg-slate-800 text-[10px] font-black uppercase text-slate-400 flex flex-col gap-1 border-b border-slate-700">
             <div className="flex justify-between items-center w-full">
               <span className="truncate mr-2 text-white">👤 {currentUser.name}</span>
               <button onClick={() => { setCurrentUser(null); setLoginPin(''); setActiveTab('Agenda'); }} className="text-red-400 hover:text-red-300 shrink-0">Salir</button>
             </div>
             <span className="text-[8px] text-emerald-400">NIVEL DE ACCESO: {currentUserLevel}</span>
           </div>
        )}

        <div className="p-4 bg-slate-900 border-b border-slate-800">
          <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-2 px-1">Ubicación Activa</p>
          <div className="bg-slate-950 p-1 rounded-xl flex border border-slate-800">
            <button onClick={() => setActiveClinic('Shenandoah')} className={`flex-1 py-2 text-[10px] font-black uppercase rounded-lg transition-all ${activeClinic === 'Shenandoah' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-500 hover:text-slate-300'}`}>🇺🇸 TX</button>
            <button onClick={() => setActiveClinic('Guadalajara')} className={`flex-1 py-2 text-[10px] font-black uppercase rounded-lg transition-all ${activeClinic === 'Guadalajara' ? 'bg-emerald-600 text-white shadow-md' : 'text-slate-500 hover:text-slate-300'}`}>🇲🇽 GDL</button>
          </div>
        </div>

        <div className="p-4">
          <button onClick={() => setShowNewAppointment(true)} className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-black py-4 rounded-xl flex items-center justify-center gap-2 shadow-lg transition uppercase text-xs">
            <span className="text-xl leading-none">+</span> Nueva Cita
          </button>
        </div>
        
        <nav className="flex-1 overflow-y-auto py-2 px-3 space-y-1">
          <div className="text-[10px] font-black text-slate-600 uppercase tracking-widest mb-2 px-3 mt-2">Operación</div>
          <button onClick={() => setActiveTab('Agenda')} className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg font-bold transition ${activeTab === 'Agenda' ? 'bg-blue-600/20 text-blue-400' : 'hover:bg-slate-800'}`}>📅 Agenda</button>
          <button onClick={() => setActiveTab('Pacientes')} className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg font-bold transition ${activeTab === 'Pacientes' ? 'bg-blue-600/20 text-blue-400' : 'hover:bg-slate-800'}`}>👥 Clientes</button>
          <button onClick={() => setActiveTab('GFE')} className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg font-bold transition ${activeTab === 'GFE' ? 'bg-blue-600/20 text-blue-400' : 'hover:bg-slate-800'}`}>🩺 Consultas GFE</button>
          
          {currentUserLevel <= 2 && (
            <>
              <div className="text-[10px] font-black text-slate-600 uppercase tracking-widest mb-2 px-3 mt-6">Administración</div>
              <button onClick={() => setActiveTab('Servicios')} className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg font-bold transition ${activeTab === 'Servicios' ? 'bg-blue-600/20 text-blue-400' : 'hover:bg-slate-800'}`}>⚙️ Catálogo Operativo</button>
              <button onClick={() => setActiveTab('Reportes')} className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg font-bold transition ${activeTab === 'Reportes' ? 'bg-blue-600/20 text-blue-400' : 'hover:bg-slate-800'}`}>📊 Reportes y Ventas</button>
              <button onClick={() => setActiveTab('Admin')} className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg font-bold transition ${activeTab === 'Admin' ? 'bg-blue-600/20 text-blue-400' : 'hover:bg-slate-800'}`}>🔒 Ajustes de Clínica</button>
            </>
          )}
        </nav>
      </aside>

      {/* CONTENIDO PRINCIPAL */}
      <main className="flex-1 flex flex-col h-screen overflow-hidden relative">
        
        {/* VISTA AGENDA */}
        {activeTab === 'Agenda' && (
          <div className="flex flex-col h-full relative z-10">
            <header className="bg-white p-4 border-b border-slate-200 flex flex-col xl:flex-row items-center justify-between gap-4 shrink-0 shadow-sm z-20">
              <div className="flex items-center gap-4">
                <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200">
                  <button onClick={() => navigateDate(-1)} className="p-2 hover:bg-white rounded-lg transition text-slate-600">◀️</button>
                  <div className="px-4 flex flex-col items-center justify-center">
                    <span className="text-[10px] font-black text-blue-600 uppercase leading-none">{viewMode === 'Día' ? 'Día Actual' : 'Semana Actual'}</span>
                    <span className="text-xs font-bold text-slate-800">{viewMode === 'Día' ? currentDayInfo.date : `${weekDays[0].date} - ${weekDays[6].date}`}</span>
                  </div>
                  <button onClick={() => navigateDate(1)} className="p-2 hover:bg-white rounded-lg transition text-slate-600">▶️</button>
                </div>
                <button onClick={() => setCurrentDate(new Date())} className="text-[10px] font-black uppercase text-slate-400 hover:text-blue-600 transition border px-2 py-1 rounded">Hoy</button>
              </div>

              <div className="flex items-center gap-4 bg-slate-50 p-1.5 rounded-xl border border-slate-200 flex-wrap">
                {currentUserLevel <= 2 && (
                  <button onClick={() => setShowOOOModal(true)} className="bg-red-50 text-red-600 border border-red-200 px-3 py-1.5 text-[10px] font-black rounded-lg hover:bg-red-100 transition uppercase shadow-sm">🚫 Bloquear Espacio</button>
                )}
                <div className="flex items-center gap-2 px-2 border-l border-slate-200">
                  <span className="text-[9px] font-black text-slate-400 uppercase">Zoom</span>
                  <input type="range" min="20" max="300" value={zoomScale} onChange={(e) => setZoomScale(Number(e.target.value))} className="w-24 h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer" />
                </div>
                <select value={equipmentFilter} onChange={e => setEquipmentFilter(e.target.value)} className="bg-white border border-slate-300 text-slate-700 font-bold text-xs rounded-md px-2 py-1 outline-none uppercase">
                  <option value="Todos">Todos los Servicios</option>
                  {dynamicColumns.map(e => <option key={e} value={e}>{e}</option>)}
                </select>
                <div className="flex items-center bg-slate-200/50 p-1 rounded-lg">
                  <button onClick={() => setViewMode('Día')} className={`px-3 py-1 rounded font-black text-[10px] uppercase transition ${viewMode === 'Día' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-500'}`}>Día</button>
                  <button onClick={() => setViewMode('Semana')} className={`px-3 py-1 rounded font-black text-[10px] uppercase transition ${viewMode === 'Semana' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-500'}`}>Semana</button>
                </div>
              </div>
            </header>

            {/* --- CONTENEDOR DEL CALENDARIO: SCROLL UNIFICADO (CIRUGÍA CSS) --- */}
            <div className="flex-1 bg-white overflow-auto relative m-4 rounded-xl shadow-inner border border-slate-200">
              <div className="flex min-w-max">
                
                <div className="w-16 md:w-20 shrink-0 border-r border-slate-200 bg-slate-50 sticky left-0 z-50">
                  <div className="h-12 border-b border-slate-200 bg-slate-100 flex items-center justify-center sticky top-0 z-[60]">
                    <span className="text-[9px] font-black text-slate-400 uppercase">Hora</span>
                  </div>
                  <div className="relative" style={{ height: `${CALENDAR_HEIGHT}px` }}>
                    {timeOptions.map((timeStr) => (
                      <div key={timeStr} className="absolute w-full text-right pr-2 border-b border-slate-300" style={{ top: `${timeToPixels(timeStr)}px`, height: `${intervalMins * PIXELS_PER_MINUTE}px` }}>
                        <span className="text-[9px] font-black text-slate-500 relative block top-[-7px] bg-slate-50">{timeStr}</span>
                      </div>
                    ))}
                  </div>
                </div>
                
                <div className="flex-1 flex">
                  {viewMode === 'Día' ? (
                    <div className="flex min-w-full">
                      {displayedEquipments.map((eqName) => {
                        const srvColor = dbServices.find(s => s.name === eqName)?.color || 'blue';
                        return (
                        <div key={eqName} className={`flex-1 border-r border-slate-300 ${getEquipmentBgColor(srvColor)}`} style={{ minWidth: `${currentColWidth * 2}px` }}>
                          <div className={`h-12 border-b border-slate-200 flex flex-col items-center justify-center sticky top-0 z-40 ${getEquipmentHeaderColor(srvColor)}`}>
                            <span className="text-[10px] font-black uppercase leading-none">{eqName}</span>
                            <span className="text-[11px] font-bold opacity-80">{currentDayInfo.date}</span>
                          </div>
                          <div className="relative w-full" style={{ height: `${CALENDAR_HEIGHT}px` }}>
                            
                            <div className="absolute inset-0 z-0">{renderBackgroundSlots(eqName, currentDayInfo.name, currentDayInfo.fullDate)}</div>
                            
                            {/* LÍNEA DE HORA ACTUAL (MULTIHUSO) */}
                            {currentDayInfo.fullDate === clinicNow.dateStr && clinicNow.mins >= startMins && clinicNow.mins <= endMins && (
                              <div className="absolute left-0 right-0 pointer-events-none flex items-center z-20" style={{ top: `${(clinicNow.mins - startMins) * PIXELS_PER_MINUTE}px`, marginTop: '-1px' }}>
                                <div className="w-2 h-2 rounded-full bg-red-500 shadow -ml-1"></div>
                                <div className="flex-1 border-t-2 border-red-500"></div>
                              </div>
                            )}

                            {/* BLOQUEOS OOO */}
                            {dbBlockedSlots.filter(b => b.date === currentDayInfo.fullDate && (b.is_global || b.equipment === eqName)).map(b => (
                              <div key={b.id} className="absolute left-1 right-1 bg-slate-200 border-l-4 border-slate-400 rounded-md opacity-80 overflow-hidden flex flex-col justify-center items-center z-0" style={{ backgroundImage: 'repeating-linear-gradient(45deg, transparent, transparent 10px, rgba(0,0,0,0.03) 10px, rgba(0,0,0,0.03) 20px)', top: `${timeToPixels(b.start_time)}px`, height: `${timeToPixels(b.end_time) - timeToPixels(b.start_time)}px` }}>
                                <span className="text-[10px] font-black text-slate-500 uppercase bg-white/80 px-2 py-1 rounded">{b.reason}</span>
                                {currentUserLevel <= 2 && <button onClick={async () => { await activeSupabase.from('blocked_slots').delete().eq('id', b.id); fetchAllData(); }} className="text-red-500 text-[8px] font-black mt-1 uppercase bg-white/80 px-2 rounded">Eliminar</button>}
                              </div>
                            ))}

                            {/* CITAS */}
                            {dbAppointments.filter(app => app.equipment === eqName && app.full_date === currentDayInfo.fullDate && app.check_in_status !== 'Cancelado').map(app => (
                              <div key={app.id} onClick={() => { 
                                   const matchingPatients = dbPatients.filter(x => normalizeStr(x.patient) === normalizeStr(app.patient));
                                   const patInfo = matchingPatients.find(x => x.notes && x.notes.trim() !== '') || matchingPatients[0];
                                   setSelectedSlot({...app, status: 'booked', patientNotes: patInfo ? patInfo.notes : ''}); 
                                 }} draggable={true} onDragStart={(e) => handleDragStart(e, app)}
                                   className={`absolute left-1 right-1 rounded-lg p-1 border-l-4 shadow-md cursor-pointer overflow-hidden flex flex-col group transition-all hover:brightness-105 hover:ring-1 hover:ring-black/20 hover:z-30 ${getEquipmentColors(srvColor)}`} 
                                   style={{ top: `${timeToPixels(app.time)}px`, height: `${((Number(app.duration)||60) + (Number(app.buffer) || 0)) * PIXELS_PER_MINUTE}px`, zIndex: 10 }}>
                                <div className="flex justify-between items-start gap-1 mb-0.5">
                                  <span className="text-[7px] font-black uppercase bg-black/10 px-1 rounded leading-none truncate">{app.time} {(Number(app.duration)||60) >= 40 ? `- ${calculateEndTime(app.time, app.duration)}` : ''}</span>
                                  {getStatusBadge(app.check_in_status)}
                                </div>
                                <div className={`font-black uppercase truncate leading-none ${(Number(app.duration)||60) + (Number(app.buffer)||0) <= 40 ? 'text-[8px]' : 'text-[10px]'}`}>{app.is_new_patient ? '⭐ ' : ''}{app.patient}</div>
                                {(Number(app.duration)||60) + (Number(app.buffer)||0) > 45 && <div className="text-[7px] font-bold opacity-70 uppercase truncate mt-0.5">{(app.duration||60)}m + {app.buffer || 0}m Lmpz.</div>}
                              </div>
                            ))}
                          </div>
                        </div>
                      )})}
                    </div>
                  ) : (
                    <div className="flex min-w-full">
                      {weekDays.map((dayInfo) => (
                        <div key={dayInfo.fullDate} className="flex-1 shrink-0 border-r-2 border-slate-300" style={{ minWidth: `${dynamicColumns.length * currentColWidth}px` }}>
                          <div className="h-12 border-b border-slate-200 bg-slate-50 flex flex-col items-center justify-center sticky top-0 z-40">
                            <span className="text-[10px] font-black text-slate-800 uppercase leading-none">{dayInfo.name}</span>
                            <span className="text-[11px] font-bold text-blue-600">{dayInfo.date}</span>
                          </div>
                          <div className="flex w-full relative" style={{ height: `${CALENDAR_HEIGHT}px` }}>
                            {displayedEquipments.map(eqName => {
                              const srvColor = dbServices.find(s => s.name === eqName)?.color || 'blue';
                              return (
                              <div key={`${dayInfo.fullDate}-${eqName}`} className={`flex-1 relative border-r border-slate-300 ${getEquipmentBgColor(srvColor)}`} style={{ minWidth: `${currentColWidth}px` }}>
                                
                                <div className="absolute inset-0 z-0">{renderBackgroundSlots(eqName, dayInfo.name, dayInfo.fullDate)}</div>
                                
                                {/* LÍNEA DE HORA ACTUAL (MULTIHUSO) */}
                                {dayInfo.fullDate === clinicNow.dateStr && clinicNow.mins >= startMins && clinicNow.mins <= endMins && (
                                  <div className="absolute left-0 right-0 pointer-events-none flex items-center z-20" style={{ top: `${(clinicNow.mins - startMins) * PIXELS_PER_MINUTE}px`, marginTop: '-1px' }}>
                                    <div className="w-2 h-2 rounded-full bg-red-500 shadow -ml-1"></div>
                                    <div className="flex-1 border-t-2 border-red-500"></div>
                                  </div>
                                )}

                                {dbBlockedSlots.filter(b => b.date === dayInfo.fullDate && (b.is_global || b.equipment === eqName)).map(b => (
                                  <div key={b.id} className="absolute left-0.5 right-0.5 bg-slate-200 border-l-2 border-slate-400 rounded-md opacity-80 overflow-hidden flex flex-col justify-center items-center z-0" style={{ backgroundImage: 'repeating-linear-gradient(45deg, transparent, transparent 10px, rgba(0,0,0,0.03) 10px, rgba(0,0,0,0.03) 20px)', top: `${timeToPixels(b.start_time)}px`, height: `${timeToPixels(b.end_time) - timeToPixels(b.start_time)}px` }}>
                                    <span className="text-[7px] font-black text-slate-500 uppercase bg-white/80 px-1 rounded truncate w-full text-center">{b.reason}</span>
                                  </div>
                                ))}

                                {dbAppointments.filter(app => app.equipment === eqName && app.full_date === dayInfo.fullDate && app.check_in_status !== 'Cancelado').map(app => (
                                  <div key={app.id} onClick={() => { 
                                       const matchingPatients = dbPatients.filter(x => normalizeStr(x.patient) === normalizeStr(app.patient));
                                       const patInfo = matchingPatients.find(x => x.notes && x.notes.trim() !== '') || matchingPatients[0];
                                       setSelectedSlot({...app, status: 'booked', patientNotes: patInfo ? patInfo.notes : ''}); 
                                     }} draggable={true} onDragStart={(e) => handleDragStart(e, app)}
                                       className={`absolute left-0.5 right-0.5 rounded-md p-1 border-l-4 shadow-md cursor-pointer overflow-hidden flex flex-col group transition-all hover:brightness-105 hover:ring-1 hover:ring-black/20 hover:z-30 ${getEquipmentColors(srvColor)}`} 
                                       style={{ top: `${timeToPixels(app.time)}px`, height: `${((Number(app.duration)||60) + (Number(app.buffer) || 0)) * PIXELS_PER_MINUTE}px`, zIndex: 10 }}>
                                    <div className="flex justify-between items-start gap-1 mb-0.5">
                                      <span className="text-[7px] font-black uppercase bg-black/10 px-1 rounded leading-none truncate">{app.time} {(Number(app.duration)||60) >= 40 ? `- ${calculateEndTime(app.time, app.duration)}` : ''}</span>
                                      {getStatusBadge(app.check_in_status)}
                                    </div>
                                    <div className={`font-black uppercase truncate leading-none ${(Number(app.duration)||60) + (Number(app.buffer)||0) <= 40 ? 'text-[7px]' : 'text-[9px]'}`}>{app.is_new_patient ? '⭐ ' : ''}{app.patient}</div>
                                    {(Number(app.duration)||60) + (Number(app.buffer)||0) > 45 && <div className="text-[7px] font-bold opacity-70 uppercase truncate mt-0.5">{(app.duration||60)}m + {app.buffer || 0}m L.</div>}
                                  </div>
                                ))}
                              </div>
                            )})}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* VISTA PACIENTES */}
        {activeTab === 'Pacientes' && (
          <div className="flex-1 p-6 bg-white overflow-auto flex flex-col relative z-10">
            <div className="flex flex-col md:flex-row md:items-end justify-between border-b pb-4 mb-6 gap-4">
              <div className="flex items-center gap-4">
                <h2 className="text-2xl font-black text-slate-800 uppercase tracking-tight">Directorio: {activeClinic}</h2>
                <button onClick={() => setShowNewPatientModal(true)} className="bg-emerald-100 text-emerald-800 border border-emerald-300 px-4 py-2 rounded-lg text-xs font-black uppercase shadow-sm hover:bg-emerald-200 transition">+ Nuevo Paciente</button>
              </div>
              <input type="text" placeholder="🔍 Buscar por nombre o teléfono..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="w-full md:max-w-md p-3 border border-slate-300 rounded-xl shadow-sm outline-none focus:border-blue-500 font-bold bg-white text-slate-900 text-sm" />
            </div>
            
            {dbStatus === 'listo' && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                 {filteredPatients.map(p => (
                   <div key={p.id} className={`bg-slate-50 border ${p.is_blocked ? 'border-red-300 bg-red-50 opacity-80' : 'border-slate-200'} p-4 rounded-2xl hover:shadow-lg transition flex flex-col relative`}>

                     <p className="font-black text-slate-900 uppercase text-base truncate pr-6">
                       {p.is_blocked && <span title="Paciente Bloqueado" className="mr-2">🚫</span>}
                       {p.patient}
                     </p>
                     <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest truncate">{p.phone || 'Sin teléfono'}</p>
                     <div className="flex justify-between items-center mt-2 mb-4">
                       <p className="text-[9px] font-black text-blue-600 uppercase tracking-widest bg-blue-50 px-2 py-1 rounded">{p.protocol}</p>
                       <p className="text-[9px] font-black text-slate-500 bg-slate-200 px-2 py-1 rounded">SESIONES: {p.historicoSesiones}</p>
                     </div>
                     <div className="mt-auto flex gap-2">
                        <button onClick={() => { 
                          setSelectedSlot(p); 
                          setShowPatientProfile(true); 
                        }} className="flex-1 bg-emerald-600 text-white text-[9px] font-black uppercase py-2 rounded hover:bg-emerald-700 transition shadow-sm">💳 Expediente</button>
                        <button onClick={() => { 
                          if (p.is_blocked) {
                             alert("🚫 Paciente Bloqueado por Administración. No se pueden agendar citas ni servicios. Requiere desbloqueo de Superusuario en su Expediente.");
                             return;
                          }
                          setSelectedSlot({ 
                             patient: p.patient, 
                             phone: p.phone, 
                             protocol: p.protocol, 
                             email: p.email,
                             status: 'available',
                             patientNotes: p.notes,
                             is_new_patient: false 
                          }); 
                          setShowNewAppointment(true); 
                        }} className="flex-1 bg-blue-600 text-white text-[9px] font-black uppercase py-2 rounded hover:bg-blue-700 transition shadow-sm">📅 Agendar</button>
                     </div>
                   </div>
                 ))}
                 {filteredPatients.length === 0 && <div className="col-span-full py-20 text-center"><p className="text-slate-400 font-black uppercase text-lg">No se encontraron clientes.</p></div>}
              </div>
            )}
          </div>
        )}

        {/* VISTA SERVICIOS Y PROTOCOLOS (CATÁLOGO) */}
        {activeTab === 'Servicios' && currentUserLevel <= 2 && (
          <div className="flex-1 p-6 bg-white overflow-auto flex flex-col h-full z-10">
            <h2 className="text-2xl font-black text-slate-800 uppercase tracking-tight mb-6 pb-4 border-b border-slate-200">Catálogo Operativo / Servicios a Vender</h2>
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 mb-8">
              
              <div className="col-span-1 bg-slate-50 p-6 rounded-2xl border border-slate-200 h-fit shadow-sm">
                <h3 className="font-black text-slate-800 uppercase text-sm mb-4 pb-2 border-b">{isEditingSrv ? '✏️ Editar Servicio' : '✨ Crear Servicio (Columna en Agenda)'}</h3>
                <div className="space-y-4">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Nombre (Aparecerá en el Calendario)</label>
                    <input type="text" placeholder="Ej. Cámara 90 Min" className="w-full p-2.5 rounded-lg border border-slate-300 font-bold text-sm outline-none uppercase focus:border-blue-500 text-slate-900 bg-white" value={newSrv.name} onChange={e => setNewSrv({...newSrv, name: e.target.value})} />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Duración (min)</label>
                      <input type="number" className="w-full p-2.5 rounded-lg border border-slate-300 font-bold text-sm outline-none text-slate-900 bg-white" value={newSrv.duration} onChange={e => setNewSrv({...newSrv, duration: Number(e.target.value)})} />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-blue-500 uppercase mb-1">Buffer Limpieza</label>
                      <input type="number" className="w-full p-2.5 rounded-lg border border-blue-300 bg-blue-50 font-bold text-sm outline-none text-slate-900 bg-white" value={newSrv.buffer} onChange={e => setNewSrv({...newSrv, buffer: Number(e.target.value)})} />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Precio ({currencyStr})</label>
                      <input type="number" className="w-full p-2.5 rounded-lg border border-slate-300 font-bold text-sm outline-none text-slate-900 bg-white" value={newSrv.price} onChange={e => setNewSrv({...newSrv, price: Number(e.target.value)})} />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Color de Agenda</label>
                      <div className="flex items-center gap-3">
                        <div className={`w-8 h-8 rounded-full border shadow-sm ${getDynamicColorClass(newSrv.color)} shrink-0`}></div>
                        <select className="flex-1 p-2.5 rounded-lg border border-slate-300 font-bold text-sm outline-none uppercase text-slate-900 bg-white" value={newSrv.color} onChange={e => setNewSrv({...newSrv, color: e.target.value})}>
                          <option value="blue">Azul</option>
                          <option value="rose">Rosa</option>
                          <option value="emerald">Verde</option>
                          <option value="purple">Morado</option>
                          <option value="amber">Ámbar</option>
                          <option value="cyan">Cian</option>
                          <option value="indigo">Índigo</option>
                          <option value="fuchsia">Fucsia</option>
                          <option value="pink">Rosa Claro</option>
                          <option value="orange">Naranja</option>
                          <option value="teal">Verde Azulado</option>
                          <option value="violet">Violeta</option>
                        </select>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 bg-white p-3 rounded-xl border">
                    <input type="checkbox" checked={newSrv.is_active} onChange={e => setNewSrv({...newSrv, is_active: e.target.checked})} className="w-4 h-4" />
                    <label className="text-xs font-black uppercase text-slate-700">Activo (Visible en Calendario)</label>
                  </div>
                  <div className="flex gap-2 pt-2">
                    {isEditingSrv && <button onClick={() => {setIsEditingSrv(false); setNewSrv({ id: null, name: '', duration: 60, buffer: 30, price: 100, color: 'blue', is_active: true });}} className="w-1/3 bg-slate-300 text-slate-700 font-black py-3 rounded-xl uppercase text-xs hover:bg-slate-400">Cancelar</button>}
                    <button onClick={async () => {
                      if(!newSrv.name) return alert("Falta el nombre");
                      const p = { name: newSrv.name, duration: newSrv.duration, buffer: newSrv.buffer, price: newSrv.price, color: newSrv.color, is_active: newSrv.is_active, equipment: newSrv.equipment || null };
                      if(isEditingSrv && newSrv.id) {
                        await activeSupabase.from('services').update(p).eq('id', newSrv.id);
                      } else {
                        await activeSupabase.from('services').insert([p]);
                      }
                      setIsEditingSrv(false); 
                      setNewSrv({ id: null, name: '', duration: 60, buffer: 30, price: 100, color: 'blue', is_active: true }); 
                      fetchAllData();
                    }} className="flex-1 bg-blue-600 text-white font-black py-3 rounded-xl uppercase text-xs shadow-lg hover:bg-blue-700 transition">{isEditingSrv ? 'Actualizar' : 'Guardar Servicio'}</button>
                  </div>
                </div>
              </div>
              
              <div className="col-span-2 bg-white rounded-2xl border border-slate-200 overflow-hidden h-fit shadow-sm">
                <table className="w-full text-left border-collapse">
                  <thead className="bg-slate-100 border-b border-slate-200 text-[10px] font-black text-slate-500 uppercase tracking-widest">
                    <tr><th className="p-4">Servicio a Vender</th><th className="p-4">Logística</th><th className="p-4">Precio</th><th className="p-4">Estatus</th><th className="p-4 text-right">Acciones</th></tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {(dbServices || []).map(s => (
                      <tr key={s.id} className={`hover:bg-slate-50 transition-colors ${!s.is_active ? 'opacity-50 grayscale' : ''}`}>
                        <td className="p-4 font-black text-slate-800 uppercase">
                          <span className={`inline-block w-2 h-2 rounded-full mr-2 bg-${s.color}-500`}></span>{s.name}
                        </td>
                        <td className="p-4">
                          <div className="flex flex-col">
                            <span className="text-xs font-bold text-slate-800">{s.duration} min (Sesión)</span>
                            <span className="text-[10px] font-bold text-blue-500">+{s.buffer || 0} min (Buffer)</span>
                          </div>
                        </td>
                        <td className="p-4 font-bold text-slate-500 uppercase text-[10px]">${s.price} {currencyStr}</td>
                        <td className="p-4 font-bold text-slate-500 uppercase text-[10px]">{s.is_active ? 'VISIBLE' : 'OCULTO'}</td>
                        <td className="p-4 text-right">
                          <button onClick={() => {setNewSrv(s); setIsEditingSrv(true);}} className="bg-blue-50 border border-blue-200 text-blue-600 px-3 py-1.5 rounded text-[10px] font-black uppercase hover:bg-blue-100 mr-2">Editar</button>
                          <button onClick={async () => { 
                            if(window.confirm('¿Borrar?')) { 
                              await activeSupabase.from('services').delete().eq('id', s.id); 
                              fetchAllData(); 
                            } 
                          }} className="bg-red-50 border border-red-200 text-red-600 px-3 py-1.5 rounded text-[10px] font-black uppercase hover:bg-red-100">Borrar</button>
                        </td>
                      </tr>
                    ))}
                    {(!dbServices || dbServices.length === 0) && <tr><td colSpan="5" className="p-8 text-center text-slate-400 font-bold uppercase">Sin servicios configurados.</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* VISTA REPORTES */}
        {activeTab === 'Reportes' && currentUserLevel <= 2 && (
          <div className="flex-1 p-6 overflow-auto bg-white flex flex-col h-full z-10 relative">
            <div className="flex justify-between items-end mb-6 border-b border-slate-200 pb-4">
              <h2 className="text-2xl font-black text-slate-800 uppercase tracking-tight">Centro de Reportes</h2>
              <div className="flex bg-slate-100 p-1 rounded-lg border border-slate-200">
                {['Día', 'Paciente', 'Ventas', 'Caja Negra'].map(t => (
                  <button key={t} onClick={() => setReportFilter(t)} className={`px-6 py-2 text-xs font-black uppercase rounded transition ${reportFilter === t ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500'}`}>{t}</button>
                ))}
              </div>
            </div>
            
            {reportFilter === 'Día' && (
              <div className="flex-1 flex flex-col">
                <div className="mb-4"><input type="date" value={reportDate} onChange={e => setReportDate(e.target.value)} className="p-2.5 border border-slate-300 rounded-lg font-bold text-sm outline-none text-slate-900 bg-white" /></div>
                <div className="flex-1 bg-slate-50 rounded-xl border border-slate-200 overflow-auto">
                  <table className="w-full text-left border-collapse bg-white">
                    <thead><tr className="bg-slate-100 border-b border-slate-200 text-[10px] font-black text-slate-400 uppercase tracking-widest"><th className="p-4">Hora / Equipo</th><th className="p-4">Paciente</th><th className="p-4">Atendido Por</th><th className="p-4 text-right">Estatus</th></tr></thead>
                    <tbody className="divide-y divide-slate-100">
                      {dbAppointments.filter(a => a.full_date === reportDate && a.check_in_status !== 'Cancelado').map(app => (
                        <tr key={app.id} className="hover:bg-slate-50 transition-colors">
                          <td className="p-4"><p className="text-xs font-black text-slate-800">{app.time}</p><p className="text-[9px] font-bold text-blue-600 uppercase">{app.equipment}</p></td>
                          <td className="p-4 font-black text-slate-700 uppercase text-sm">{app.patient}</td>
                          <td className="p-4 font-bold text-slate-600 text-xs">{app.attendant || 'N/A'}</td>
                          <td className="p-4 text-right">{getStatusBadge(app.check_in_status)}</td>
                        </tr>
                      ))}
                      {dbAppointments.filter(a => a.full_date === reportDate && a.check_in_status !== 'Cancelado').length === 0 && <tr><td colSpan="4" className="text-center p-8 text-slate-400 font-bold uppercase">Sin citas activas en esta fecha.</td></tr>}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
            
            {reportFilter === 'Paciente' && (
              <div className="flex-1 flex flex-col">
                <div className="flex flex-col md:flex-row gap-4 mb-4 items-end">
                  <input type="text" placeholder="Búsqueda Inteligente (Ignora acentos)..." value={selectedPatientReport} onChange={e => setSelectedPatientReport(e.target.value)} className="w-full max-w-md p-2.5 border border-slate-300 rounded-lg font-bold text-sm outline-none uppercase text-slate-900 bg-white" />
                </div>
                <div className="flex-1 bg-slate-50 rounded-xl border border-slate-200 overflow-auto">
                  <table className="w-full text-left border-collapse bg-white">
                    <thead><tr className="bg-slate-100 border-b border-slate-200 text-[10px] font-black text-slate-400 uppercase tracking-widest"><th className="p-4">Fecha</th><th className="p-4">Equipo</th><th className="p-4 text-right">Estatus / Acción</th></tr></thead>
                    <tbody className="divide-y divide-slate-100">
                      {String(selectedPatientReport).length > 2 && dbAppointments.filter(a => normalizeStr(a.patient).includes(normalizeStr(selectedPatientReport))).map(app => (
                        <tr key={app.id} className="hover:bg-slate-50 transition-colors">
                          <td className="p-4 font-black text-slate-800 text-xs">{app.full_date} - {app.time}</td>
                          <td className="p-4 font-bold text-blue-600 uppercase text-[10px]">{app.equipment}</td>
                          <td className="p-4 flex justify-end items-center gap-3">
                            {getStatusBadge(app.check_in_status)}
                            {app.check_in_status === 'Finalizado' && (
                              <button onClick={() => handleRefund(app)} className="bg-purple-100 text-purple-700 border border-purple-200 px-2 py-1 rounded text-[8px] font-black uppercase hover:bg-purple-200">Devolver Cobro</button>
                            )}
                          </td>
                        </tr>
                      ))}
                      {String(selectedPatientReport).length <= 2 && <tr><td colSpan="3" className="text-center p-8 text-slate-400 font-bold uppercase text-xs">Escribe al menos 3 letras para buscar el historial.</td></tr>}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* CAJA NEGRA GLOBAL */}
            {reportFilter === 'Caja Negra' && (
              <div className="flex-1 flex flex-col">
                <div className="flex items-center gap-2 mb-4 bg-slate-100 p-3 rounded-xl border border-slate-200">
                   <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Mostrando los últimos 200 movimientos de la clínica en tiempo real</span>
                   <button onClick={() => {
                      if(activeSupabase) {
                        activeSupabase.from('audit_logs').select('*').order('timestamp', { ascending: false }).limit(200)
                        .then(({data}) => setGlobalAuditLogs(data || []));
                      }
                   }} className="ml-auto bg-white border border-slate-300 text-xs font-black uppercase px-3 py-1.5 rounded hover:bg-slate-50 transition shadow-sm">Refrescar 🔄</button>
                </div>
                <div className="flex-1 bg-slate-50 rounded-xl border border-slate-200 overflow-auto">
                  <table className="w-full text-left border-collapse bg-white">
                    <thead>
                       <tr className="bg-slate-100 border-b border-slate-200 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                          <th className="p-4">Fecha/Hora Movimiento</th>
                          <th className="p-4">Paciente / Empleado</th>
                          <th className="p-4">Acción</th>
                          <th className="p-4">Detalle Oculto</th>
                       </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {globalAuditLogs.map(log => (
                        <tr key={log.id} className="hover:bg-slate-50 transition-colors">
                          <td className="p-4 font-black text-blue-600 text-[10px] uppercase">{new Date(log.timestamp).toLocaleString()}</td>
                          <td className="p-4 font-black text-slate-800 text-xs uppercase">{log.patient_name}</td>
                          <td className="p-4">
                             <div className="flex flex-col">
                                <span className="font-black text-[10px] uppercase text-slate-600">{log.action}</span>
                                <span className="text-[9px] font-bold text-slate-400">Por: {log.changed_by}</span>
                             </div>
                          </td>
                          <td className="p-4 font-mono text-[9px] text-slate-500">{log.details}</td>
                        </tr>
                      ))}
                      {globalAuditLogs.length === 0 && <tr><td colSpan="4" className="text-center p-8 text-slate-400 font-bold uppercase text-xs">No hay registros auditables.</td></tr>}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* SECCIÓN VENTAS CON CANDADO */}
            {reportFilter === 'Ventas' && (
              !isReportsUnlocked ? (
                <div className="flex-1 flex flex-col items-center justify-center">
                  <div className="bg-white p-10 rounded-3xl shadow-2xl border text-center max-w-sm w-full">
                    <h2 className="text-2xl font-black uppercase mb-2 text-slate-800">🔒 Acceso a Ventas</h2>
                    <p className="text-xs font-bold text-slate-500 mb-8 uppercase">Ingresa la Llave Financiera de 6 Dígitos</p>
                    <input type="password" placeholder="******" maxLength="6" value={pinInput} onKeyDown={e => e.key === 'Enter' && handleFinancialUnlock()} onChange={e => setPinInput(e.target.value)} className="w-full text-center text-3xl tracking-[0.2em] font-black p-4 border rounded-xl outline-none focus:border-blue-500 mb-6 bg-slate-50 text-slate-900" />
                    <button onClick={handleFinancialUnlock} className="w-full bg-slate-900 text-white font-black py-4 rounded-xl shadow-lg uppercase text-sm hover:bg-slate-800 transition">Desbloquear Ventas</button>
                  </div>
                </div>
              ) : (
                <div className="flex-1 flex flex-col">
                  <div className="flex gap-4 mb-6">
                    <div><label className="block text-[10px] font-black uppercase text-slate-400 mb-1">Fecha Inicio</label><input type="date" value={reportStartDate} onChange={e => setReportStartDate(e.target.value)} className="p-2 border border-slate-300 rounded-lg font-bold outline-none text-slate-900 bg-white" /></div>
                    <div><label className="block text-[10px] font-black uppercase text-slate-400 mb-1">Fecha Fin</label><input type="date" value={reportEndDate} onChange={e => setReportEndDate(e.target.value)} className="p-2 border border-slate-300 rounded-lg font-bold outline-none text-slate-900 bg-white" /></div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6 shrink-0">
                    <div className="bg-emerald-50 border border-emerald-200 p-6 rounded-2xl flex flex-col justify-center items-center shadow-sm">
                      <span className="text-xs font-black text-emerald-800 uppercase tracking-widest mb-2">Ingresos Totales ({currencyStr})</span>
                      <span className="text-4xl font-black text-emerald-600">
                        ${dbPatients.flatMap(p => p.packageHistory || []).filter(tx => tx.price > 0).reduce((acc, curr) => acc + (Number(curr.price) || 0), 0).toLocaleString()} {currencyStr}
                      </span>
                    </div>
                    <div className="bg-slate-50 border border-slate-200 p-6 rounded-2xl flex flex-col justify-center items-center shadow-sm">
                      <span className="text-xs font-black text-slate-500 uppercase tracking-widest mb-2">Sesiones Atendidas</span>
                      <span className="text-3xl font-black text-slate-800">{dbAppointments.filter(a => a.check_in_status === 'Finalizado' && a.full_date >= reportStartDate && a.full_date <= reportEndDate).length}</span>
                    </div>
                    <div className="bg-purple-50 border border-purple-200 p-6 rounded-2xl flex flex-col justify-center items-center shadow-sm">
                      <span className="text-xs font-black text-purple-800 uppercase tracking-widest mb-2">Sesiones Devueltas</span>
                      <span className="text-3xl font-black text-purple-600">{dbAppointments.filter(a => a.check_in_status === 'Devuelto' && a.full_date >= reportStartDate && a.full_date <= reportEndDate).length}</span>
                    </div>
                  </div>
                  
                  {/* LIBRO MAYOR DE VENTAS CON BOTÓN DE CANCELACIÓN */}
                  <div className="flex-1 bg-slate-50 rounded-xl border border-slate-200 overflow-auto shadow-inner">
                       <h3 className="bg-slate-100 p-3 text-[10px] font-black uppercase text-slate-500 border-b border-slate-200 tracking-widest sticky top-0">Libro Mayor de Ventas (Últimos Movimientos)</h3>
                       <table className="w-full text-left border-collapse bg-white">
                         <thead className="bg-slate-50 text-[9px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-200 sticky top-10 shadow-sm">
                            <tr>
                               <th className="p-4">Fecha Ticket</th>
                               <th className="p-4">Paciente</th>
                               <th className="p-4">Paquete Vendido</th>
                               <th className="p-4 text-right">Monto / Método</th>
                               {currentUserLevel === 1 && <th className="p-4 text-center">Auditoría</th>}
                            </tr>
                         </thead>
                         <tbody className="divide-y divide-slate-100">
                            {dbPatients.flatMap(p => (p.packageHistory || []).map(tx => ({...tx, patientId: p.id, patientName: p.patient})))
                            .sort((a,b) => b.id - a.id).slice(0, 50).map(tx => (
                              <tr key={tx.id} className="hover:bg-slate-50 transition-colors">
                                 <td className="p-4 font-bold text-slate-500 text-xs">{tx.date}</td>
                                 <td className="p-4 font-black text-slate-800 text-sm uppercase">{tx.patientName}</td>
                                 <td className="p-4">
                                    <p className="font-bold text-blue-600 text-xs uppercase">{tx.serviceName}</p>
                                    <p className="text-[9px] font-black text-slate-400 uppercase mt-0.5">+{tx.sessions} SESIONES A CARTERA</p>
                                 </td>
                                 <td className="p-4 text-right">
                                    <p className="font-black text-emerald-600 text-sm">${tx.price} {currencyStr}</p>
                                    <p className="text-[9px] font-black text-slate-400 uppercase mt-0.5 bg-slate-100 inline-block px-2 py-0.5 rounded">{tx.paymentMethod || 'Tarjeta'}</p>
                                 </td>
                                 {currentUserLevel === 1 && (
                                    <td className="p-4 text-center">
                                       <button onClick={() => handleCancelGlobalTransaction(tx, tx.patientId, tx.patientName)} className="bg-red-50 border border-red-200 text-red-600 px-3 py-1.5 rounded-lg text-[9px] font-black uppercase hover:bg-red-100 transition shadow-sm">Revertir Venta</button>
                                    </td>
                                 )}
                              </tr>
                            ))}
                         </tbody>
                       </table>
                  </div>
                </div>
              )
            )}
          </div>
        )}

        {/* VISTA GFE */}
        {activeTab === 'GFE' && <div className="flex-1 p-6 overflow-hidden z-10"><GFEManager patients={dbAppointments} onUpdatePatient={() => {}} /></div>}

        {/* VISTA ADMIN */}
        {activeTab === 'Admin' && currentUserLevel <= 2 && (
          <div className="flex-1 p-6 bg-white overflow-auto flex flex-col h-full z-10">
            <h2 className="text-2xl font-black text-slate-800 uppercase tracking-tight mb-6 pb-4 border-b border-slate-200">Ajustes de Clínica y Horarios</h2>
            
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              
              <div className="bg-slate-50 p-6 rounded-2xl border border-slate-200 shadow-sm h-fit">
                {/* PANEL DE SEGURIDAD Y CÓDIGOS DE ACCESO */}
                <h3 className="font-black text-slate-800 uppercase text-sm mb-4 pb-2 border-b">Seguridad y NIPs de Acceso Maestro</h3>
                <div className="grid grid-cols-2 gap-4 mb-8">
                   <div>
                      <label className="text-[10px] font-black text-red-600 uppercase ml-1">NIP de Entrada (Login) - 6 Dígitos</label>
                      <input type="text" maxLength="6" value={dbCompanyConfig.master_pin || ''} onChange={e => setDbCompanyConfig({...dbCompanyConfig, master_pin: e.target.value})} className="w-full p-2.5 border border-red-200 bg-red-50 rounded-lg font-black tracking-[0.5em] text-center outline-none text-slate-900" placeholder="000000" />
                   </div>
                   <div>
                      <label className="text-[10px] font-black text-emerald-600 uppercase ml-1">NIP Financiero (Ventas) - 6 Dígitos</label>
                      <input type="text" maxLength="6" value={dbCompanyConfig.financial_pin || ''} onChange={e => setDbCompanyConfig({...dbCompanyConfig, financial_pin: e.target.value})} className="w-full p-2.5 border border-emerald-200 bg-emerald-50 rounded-lg font-black tracking-[0.5em] text-center outline-none text-slate-900" placeholder="123456" />
                   </div>
                </div>

                <h3 className="font-black text-slate-800 uppercase text-sm mb-4 pb-2 border-b">Datos del Ticket POS (58mm)</h3>
                <div className="space-y-4">
                  <div>
                    <label className="text-[10px] font-black text-slate-400 uppercase ml-1">Nombre Comercial</label>
                    <input type="text" value={dbCompanyConfig.name} onChange={e => setDbCompanyConfig({...dbCompanyConfig, name: e.target.value})} className="w-full p-2.5 border rounded-lg font-bold uppercase outline-none text-slate-900 bg-white" />
                  </div>
                  <div>
                    <label className="text-[10px] font-black text-slate-400 uppercase ml-1">Dirección Clínica</label>
                    <input type="text" value={dbCompanyConfig.address} onChange={e => setDbCompanyConfig({...dbCompanyConfig, address: e.target.value})} className="w-full p-2.5 border rounded-lg font-bold uppercase outline-none text-slate-900 bg-white" />
                  </div>
                  <div>
                    <label className="text-[10px] font-black text-slate-400 uppercase ml-1">Teléfono Público</label>
                    <input type="text" value={dbCompanyConfig.phone} onChange={e => setDbCompanyConfig({...dbCompanyConfig, phone: e.target.value})} className="w-full p-2.5 border rounded-lg font-bold uppercase outline-none text-slate-900 bg-white" />
                  </div>
                  <div>
                    <label className="text-[10px] font-black text-slate-400 uppercase ml-1">Mensaje de Agradecimiento</label>
                    <input type="text" value={dbCompanyConfig.ticket_message} onChange={e => setDbCompanyConfig({...dbCompanyConfig, ticket_message: e.target.value})} className="w-full p-2.5 border rounded-lg font-bold uppercase outline-none text-slate-900 bg-white" />
                  </div>
                </div>
                
                <h3 className="font-black text-slate-800 uppercase text-sm mb-4 pb-2 border-b mt-6">Reglas y Límites de Agenda</h3>
                <div className="grid grid-cols-2 gap-4 mb-6">
                  <div>
                    <label className="text-[10px] font-black text-slate-400 uppercase ml-1">Anticipación para Agendar (Horas)</label>
                    <input type="number" value={dbCompanyConfig.booking_limit_hours} onChange={e => setDbCompanyConfig({...dbCompanyConfig, booking_limit_hours: Number(e.target.value)})} className="w-full p-2.5 border rounded-lg font-bold outline-none text-slate-900 bg-white" />
                  </div>
                  <div>
                    <label className="text-[10px] font-black text-slate-400 uppercase ml-1">Límite para Cancelar (Horas)</label>
                    <input type="number" value={dbCompanyConfig.cancel_limit_hours} onChange={e => setDbCompanyConfig({...dbCompanyConfig, cancel_limit_hours: Number(e.target.value)})} className="w-full p-2.5 border rounded-lg font-bold outline-none text-slate-900 bg-white" />
                  </div>
                  <div>
                    <label className="text-[10px] font-black text-slate-400 uppercase ml-1">Apertura</label>
                    <input type="time" value={dbCompanyConfig.start_time} onChange={e => setDbCompanyConfig({...dbCompanyConfig, start_time: e.target.value})} className="w-full p-2.5 border rounded-lg font-bold outline-none text-slate-900 bg-white" />
                  </div>
                  <div>
                    <label className="text-[10px] font-black text-slate-400 uppercase ml-1">Cierre</label>
                    <input type="time" value={dbCompanyConfig.end_time} onChange={e => setDbCompanyConfig({...dbCompanyConfig, end_time: e.target.value})} className="w-full p-2.5 border rounded-lg font-bold outline-none text-slate-900 bg-white" />
                  </div>
                  <div className="col-span-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase ml-1">Intervalos en Cuadrícula</label>
                    <select value={dbCompanyConfig.interval_mins} onChange={e => setDbCompanyConfig({...dbCompanyConfig, interval_mins: Number(e.target.value)})} className="w-full p-2.5 border rounded-lg font-bold outline-none text-slate-900 bg-white">
                      <option value={15}>15 minutos</option>
                      <option value={30}>30 minutos</option>
                      <option value={60}>60 minutos</option>
                    </select>
                  </div>
                </div>

                {/* NUEVO: CONFIGURACIÓN DE NOTIFICACIONES */}
                <h3 className="font-black text-slate-800 uppercase text-sm mb-4 pb-2 border-b mt-6">Motor de Notificaciones (Email y SMS)</h3>
                <div className="grid grid-cols-2 gap-4 mb-6">
                  <div className="flex items-center gap-2 bg-white p-3 rounded-lg border border-slate-200 shadow-sm">
                    <input type="checkbox" checked={dbCompanyConfig.notify_on_booking} onChange={e => setDbCompanyConfig({...dbCompanyConfig, notify_on_booking: e.target.checked})} className="w-4 h-4 cursor-pointer" />
                    <label className="text-[10px] font-black text-slate-700 uppercase cursor-pointer">Notificar al crear cita</label>
                  </div>
                  <div>
                    <label className="text-[10px] font-black text-slate-400 uppercase ml-1">Horas previas (Recordatorio)</label>
                    <input type="number" value={dbCompanyConfig.reminder_hours} onChange={e => setDbCompanyConfig({...dbCompanyConfig, reminder_hours: Number(e.target.value)})} className="w-full p-2.5 border border-slate-300 rounded-lg font-bold outline-none text-slate-900 bg-white shadow-sm" />
                  </div>
                </div>

                <button onClick={async () => {
                  try {
                    const p = { 
                      name: dbCompanyConfig.name, 
                      address: dbCompanyConfig.address, 
                      phone: dbCompanyConfig.phone, 
                      ticket_message: dbCompanyConfig.ticket_message, 
                      start_time: dbCompanyConfig.start_time, 
                      end_time: dbCompanyConfig.end_time, 
                      interval_mins: dbCompanyConfig.interval_mins,
                      booking_limit_hours: dbCompanyConfig.booking_limit_hours,
                      cancel_limit_hours: dbCompanyConfig.cancel_limit_hours,
                      master_pin: dbCompanyConfig.master_pin, 
                      financial_pin: dbCompanyConfig.financial_pin,
                      notify_on_booking: dbCompanyConfig.notify_on_booking,
                      reminder_hours: dbCompanyConfig.reminder_hours
                    };
                    if (dbCompanyConfig.id) {
                      await activeSupabase.from('company_config').update(p).eq('id', dbCompanyConfig.id);
                    } else {
                      await activeSupabase.from('company_config').insert([{...p, clinic: activeClinic}]);
                    }
                    alert('Configuración General y NIPs guardados exitosamente.'); 
                    fetchAllData();
                  } catch (e) {
                    alert('Error guardando configuración: ' + e.message);
                  }
                }} className="w-full bg-slate-900 text-white font-black py-4 rounded-xl uppercase shadow-lg hover:bg-slate-800 transition">
                  Guardar Configuración General
                </button>
              </div>

              <div className="space-y-8">
                
                {/* ROLES DE USUARIO (SOLO NIVEL 1) */}
                {currentUserLevel === 1 && (
                  <div className="bg-slate-50 p-6 rounded-2xl border border-slate-200 shadow-sm h-fit">
                    <h3 className="font-black text-slate-800 uppercase text-sm mb-4 pb-2 border-b">Catálogo de Roles y Permisos</h3>
                    <div className="space-y-4 mb-6">
                      <input type="text" placeholder="Nombre del Rol (Ej. Enfermera)" className="w-full p-2.5 border rounded-lg font-bold uppercase outline-none text-slate-900 bg-white" value={newRole.name} onChange={e => setNewRole({...newRole, name: e.target.value})} />
                      <select className="w-full p-2.5 border rounded-lg font-bold uppercase outline-none text-slate-900 bg-white" value={newRole.level} onChange={e => setNewRole({...newRole, level: Number(e.target.value)})}>
                        <option value={1}>Nivel 1: Super Administrador Supremo</option>
                        <option value={2}>Nivel 2: Administrador / Gerente</option>
                        <option value={3}>Nivel 3: Usuario / Staff Operativo</option>
                      </select>
                      <div className="flex gap-2">
                        {isEditingRole && <button onClick={() => {setIsEditingRole(false); setNewRole({ id: null, name: '', level: 3 });}} className="w-1/3 bg-slate-300 text-slate-700 font-black py-3 rounded-xl uppercase text-xs">Cancelar</button>}
                        <button onClick={async () => {
                          if (!newRole.name) return alert("Ingresa el nombre del rol.");
                          if (isEditingRole && newRole.id) {
                            await activeSupabase.from('user_roles').update({ name: newRole.name, level: newRole.level }).eq('id', newRole.id);
                          } else {
                            await activeSupabase.from('user_roles').insert([{ name: newRole.name, level: newRole.level }]);
                          }
                          setIsEditingRole(false); 
                          setNewRole({ id: null, name: '', level: 3 }); 
                          fetchAllData();
                        }} className="flex-1 bg-slate-900 text-white font-black py-3 rounded-xl uppercase text-xs shadow-md">{isEditingRole ? 'Actualizar Rol' : 'Crear Rol'}</button>
                      </div>
                    </div>
                    <table className="w-full text-left bg-white border rounded-xl overflow-hidden">
                      <thead className="bg-slate-100 text-[10px] font-black uppercase text-slate-400">
                        <tr><th className="p-3">Rol</th><th className="p-3 text-center">Nivel</th><th className="p-3"></th></tr>
                      </thead>
                      <tbody className="divide-y text-slate-900">
                        {(dbRoles || []).map(r => (
                          <tr key={r.id} className="text-xs font-bold uppercase">
                            <td className="p-3">{r.name}</td>
                            <td className="p-3 text-center">NVL {r.level}</td>
                            <td className="p-3 text-right">
                              <button onClick={() => {setNewRole(r); setIsEditingRole(true);}} className="text-blue-500 mr-2">Edit</button>
                              <button onClick={async () => { if(window.confirm('Borrar rol?')){ await activeSupabase.from('user_roles').delete().eq('id', r.id); fetchAllData();} }} className="text-red-500">Del</button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* PERSONAL AUTORIZADO (SOLO NIVEL 1) */}
                {currentUserLevel === 1 && (
                  <div className="bg-slate-50 p-6 rounded-2xl border border-slate-200 shadow-sm h-fit">
                    <h3 className="font-black text-slate-800 uppercase text-sm mb-4 pb-2 border-b">{isEditingUser ? 'Editar Empleado' : 'Alta de Nuevo Empleado'}</h3>
                    <div className="space-y-4 mb-6">
                      <input type="text" placeholder="Nombre Completo" className="w-full p-2.5 border rounded-lg font-bold uppercase outline-none text-slate-900 bg-white" value={newUser.name} onChange={e => setNewUser({...newUser, name: e.target.value})} />
                      <select className="w-full p-2.5 border rounded-lg font-bold uppercase outline-none text-slate-900 bg-white" value={newUser.role} onChange={e => setNewUser({...newUser, role: e.target.value})}>
                        {dbRoles.map(r => <option key={r.id} value={r.name}>{r.name} (Nivel {r.level})</option>)}
                      </select>
                      <input type="text" placeholder="Certificación (Ej. IBUM, D.O.)" className="w-full p-2.5 border rounded-lg font-bold uppercase outline-none text-slate-900 bg-white" value={newUser.cert} onChange={e => setNewUser({...newUser, cert: e.target.value})} />
                      <input type="text" placeholder="PIN Personal (6 Dígitos)" maxLength="6" className="w-full p-2.5 border border-slate-300 rounded-lg font-bold outline-none tracking-widest text-slate-900 bg-white" value={newUser.pin || ''} onChange={e => setNewUser({...newUser, pin: e.target.value})} />
                      <div className="flex gap-2">
                        {isEditingUser && <button onClick={() => {setIsEditingUser(false); setNewUser({ id: null, name: '', role: dbRoles[0]?.name || '', cert: '', is_active: true, pin: '' });}} className="w-1/3 bg-slate-300 text-slate-700 font-black py-3 rounded-xl uppercase text-xs">Cancelar</button>}
                        <button onClick={async () => {
                          if (!newUser.name) return alert("Ingresa el nombre.");
                          if (!newUser.pin || newUser.pin.length !== 6) return alert("El PIN debe ser de exactamente 6 dígitos.");
                          if (isEditingUser && newUser.id) {
                            await activeSupabase.from('users_staff').update({ name: newUser.name, role: newUser.role, cert: newUser.cert, is_active: newUser.is_active, pin: newUser.pin }).eq('id', newUser.id);
                            await logAudit(null, newUser.name, 'EDICIÓN DE EMPLEADO', `Rol: ${newUser.role}`);
                          } else {
                            await activeSupabase.from('users_staff').insert([{ name: newUser.name, role: newUser.role, cert: newUser.cert, is_active: newUser.is_active, pin: newUser.pin }]);
                            await logAudit(null, newUser.name, 'ALTA DE EMPLEADO', `Rol: ${newUser.role}`);
                          }
                          setIsEditingUser(false); 
                          setNewUser({ id: null, name: '', role: dbRoles[0]?.name || '', cert: '', is_active: true, pin: '' }); 
                          fetchAllData();
                        }} className="flex-1 bg-slate-900 text-white font-black py-3 rounded-xl uppercase text-xs shadow-md">{isEditingUser ? 'Actualizar' : 'Guardar'}</button>
                      </div>
                    </div>
                    <table className="w-full text-left bg-white border rounded-xl overflow-hidden">
                      <thead className="bg-slate-100 text-[10px] font-black uppercase text-slate-400">
                        <tr><th className="p-3">Nombre</th><th className="p-3">Rol</th><th className="p-3"></th></tr>
                      </thead>
                      <tbody className="divide-y text-slate-900">
                        {(dbUsers || []).map(u => (
                          <tr key={u.id} className={`text-xs font-bold uppercase ${!u.is_active && 'opacity-40 grayscale'}`}>
                            <td className="p-3">{u.name}</td>
                            <td className="p-3 text-blue-600">{u.role}</td>
                            <td className="p-3 text-right">
                              <button onClick={() => {setNewUser(u); setIsEditingUser(true);}} className="text-blue-500 mr-2">Edit</button>
                              <button onClick={async () => { 
                                const newStatus = !u.is_active;
                                await activeSupabase.from('users_staff').update({is_active: newStatus}).eq('id', u.id); 
                                await logAudit(null, u.name, 'ESTATUS EMPLEADO', newStatus ? 'ACTIVADO' : 'DESACTIVADO');
                                fetchAllData(); 
                              }} className="text-slate-500">{u.is_active ? 'Desactivar' : 'Activar'}</button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

              </div>
            </div>
          </div>
        )}

      </main>

      {/* --- MODALES Z-INDEX 50+ FLOTANTES FUERA DE MAIN --- */}

      {/* CAJA NEGRA: VISOR DE AUDITORÍA DE CITA */}
      {showAudit && (
         <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-[99999]">
            <div className="bg-white rounded-3xl w-full max-w-lg shadow-2xl border max-h-[85vh] flex flex-col overflow-hidden text-slate-900">
               <div className="bg-slate-50 px-8 py-5 border-b shrink-0 flex justify-between items-center">
                  <h3 className="font-black text-lg uppercase text-slate-800">👁️ Auditoría</h3>
                  <button onClick={() => setShowAudit(false)} className="text-slate-400 hover:text-slate-800 text-2xl font-black transition">&times;</button>
               </div>
               <div className="p-8 overflow-y-auto flex-1 space-y-3">
                  {auditLogs.map(log => (
                     <div key={log.id} className="text-xs p-4 bg-slate-50 border border-slate-200 rounded-xl shadow-sm">
                        <span className="font-black text-blue-600 bg-blue-50 px-2 py-0.5 rounded">{new Date(log.timestamp).toLocaleString()}</span>
                        <div className="mt-2 text-slate-800">
                           <span className="font-black">{log.action}</span> operado por <span className="font-bold uppercase bg-slate-200 px-1 rounded">{log.changed_by}</span>
                        </div>
                        <p className="text-slate-500 mt-1 font-mono text-[10px]">{log.details}</p>
                     </div>
                  ))}
                  {auditLogs.length === 0 && <p className="text-sm text-slate-400 font-bold text-center py-6">No hay registros auditables para esta cita.</p>}
               </div>
            </div>
         </div>
      )}

      {/* DETALLE DE CITA EXISTENTE (CON NOTAS FÁCILES) */}
      {selectedSlot && activeTab === 'Agenda' && !showBitacora && !showPatientProfile && !showNewAppointment && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50" style={{ zIndex: 9999 }}>
          <div className="bg-white rounded-3xl shadow-2xl max-w-md w-full max-h-[85vh] flex flex-col overflow-hidden border border-slate-200 text-slate-900">
            <div className="bg-slate-50 px-8 py-5 border-b flex justify-between items-center shrink-0">
              <h3 className="text-lg font-black text-slate-800 uppercase tracking-tight">Detalle de Cita</h3>
              <button onClick={() => setSelectedSlot(null)} className="text-slate-400 hover:text-slate-800 text-2xl font-black transition">&times;</button>
            </div>
            
            <div className="p-8 overflow-y-auto flex-1 space-y-5">
              <div className="flex flex-wrap gap-2 mb-2">
                 <button onClick={() => updateAppStatus(selectedSlot.id, 'Llegó', selectedSlot.patient)} className="bg-amber-100 text-amber-700 px-3 py-1.5 rounded-lg text-[9px] font-black uppercase hover:bg-amber-200 transition">✅ Llegó</button>
                 <button onClick={() => updateAppStatus(selectedSlot.id, 'En Sesión', selectedSlot.patient)} className="bg-emerald-100 text-emerald-700 px-3 py-1.5 rounded-lg text-[9px] font-black uppercase hover:bg-emerald-200 transition">🟢 En Sesión</button>
                 <button onClick={() => updateAppStatus(selectedSlot.id, 'No Asistió', selectedSlot.patient)} className="bg-slate-200 text-slate-700 px-3 py-1.5 rounded-lg text-[9px] font-black uppercase hover:bg-slate-300 transition">❌ No Asistió</button>
                 
                 {selectedSlot.check_in_status !== 'Finalizado' && selectedSlot.check_in_status !== 'Devuelto' && (
                   <button onClick={async () => {
                     if(window.confirm('¿Deseas BORRAR DEFINITIVAMENTE esta cita del registro?')){
                        await activeSupabase.from('appointments').delete().eq('id', selectedSlot.id);
                        await logAudit(selectedSlot.id, selectedSlot.patient, 'CITA BORRADA', `Cita físicamente eliminada del sistema.`);
                        setSelectedSlot(null);
                        fetchAllData();
                     }
                   }} className="bg-red-100 text-red-700 px-3 py-1.5 rounded-lg text-[9px] font-black uppercase hover:bg-red-200 transition ml-auto border border-red-200">🗑️ Borrar Cita</button>
                 )}
              </div>
              
              <div className="bg-white border border-slate-300 rounded-xl p-4 shadow-sm flex flex-col relative overflow-hidden">
                <span className="font-black text-slate-800 text-lg uppercase pr-6">{selectedSlot.is_new_patient ? '⭐ ' : ''}{selectedSlot.patient}</span>
                <span className="text-[10px] text-blue-600 font-black uppercase tracking-widest">{selectedSlot.protocol}</span>
                
                <div className="mt-4 space-y-3">
                   <div className="bg-amber-50 border border-amber-200 p-3 rounded-xl">
                      <label className="text-[10px] font-black uppercase text-amber-800 flex items-center gap-1 mb-1">⚠️ Nota General (Para siempre)</label>
                      <textarea 
                        value={selectedSlot.patientNotes || ''} 
                        onChange={e => setSelectedSlot({...selectedSlot, patientNotes: e.target.value})}
                        className="w-full p-2 border border-amber-200 rounded-lg text-xs font-bold outline-none bg-white text-amber-900"
                        rows="2" placeholder="Ej. Diabético, hipertensión..."
                      />
                   </div>
                   <div className="bg-blue-50 border border-blue-200 p-3 rounded-xl">
                      <label className="text-[10px] font-black uppercase text-blue-800 flex items-center gap-1 mb-1">📌 Instrucción de HOY</label>
                      <textarea 
                        value={selectedSlot.notes || ''} 
                        onChange={e => setSelectedSlot({...selectedSlot, notes: e.target.value})}
                        className="w-full p-2 border border-blue-200 rounded-lg text-xs font-bold outline-none bg-white text-blue-900"
                        rows="2" placeholder="Ej. Subir presión despacio..."
                      />
                   </div>
                   <button onClick={async () => {
                     try {
                       await activeSupabase.from('appointments').update({ notes: selectedSlot.notes }).eq('id', selectedSlot.id);
                       const matchingPatients = dbPatients.filter(x => normalizeStr(x.patient) === normalizeStr(selectedSlot.patient));
                       for (const pat of matchingPatients) {
                          let upRes = await activeSupabase.from('patients').update({ notes: selectedSlot.patientNotes }).eq('id', pat.id);
                          if (upRes.error) {
                              await activeSupabase.from('patients').update({ Notes: selectedSlot.patientNotes }).eq('id', pat.id);
                          }
                       }
                       alert("Notas guardadas y sincronizadas correctamente.");
                       fetchAllData();
                     } catch(e) { alert("Error guardando notas."); }
                   }} className="w-full bg-slate-800 text-white font-black py-2 rounded-lg text-[10px] uppercase hover:bg-slate-700 shadow-sm transition">💾 Guardar Notas</button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="bg-slate-50 p-3 rounded-xl border border-slate-200">
                  <span className="block text-[8px] font-black text-slate-400 uppercase">Fecha y Hora de Inicio</span>
                  <span className="text-base font-black text-slate-700 block">{selectedSlot.full_date || selectedSlot.fullDate} <span className="text-sm ml-1 text-slate-500">• {selectedSlot.time}</span></span>
                </div>
                <div className="bg-slate-50 p-3 rounded-xl border border-slate-200">
                  <span className="block text-[8px] font-black text-slate-400 uppercase">Salida (+ Limpieza)</span>
                  <span className="text-base font-black text-blue-600">{calculateEndTime(selectedSlot.time, selectedSlot.duration)} <span className="text-[9px] font-bold text-slate-400 ml-1">({selectedSlot.buffer || 0}m)</span></span>
                </div>
              </div>

              <div className="bg-blue-50 border border-blue-200 p-5 rounded-2xl shadow-sm space-y-3">
                  <div className="flex justify-between items-center bg-white p-3 rounded-xl border border-blue-100">
                    <span className="text-xs font-black text-slate-500 uppercase">Histórico de Sesiones</span>
                    <span className="text-sm font-black text-slate-800 bg-slate-100 px-2 rounded">{selectedSlot.historicoSesiones || 0}</span>
                  </div>
                  <div className={`p-3 rounded-lg flex justify-between items-center text-white shadow-sm ${(selectedSlot.wallets?.[selectedSlot.equipment] || 0) > 0 ? 'bg-emerald-600' : 'bg-red-600'}`}>
                    <span className="text-xs font-black uppercase">Pendientes ({selectedSlot.equipment})</span>
                    <span className="text-lg font-black">
                      {selectedSlot.wallets?.[selectedSlot.equipment] || 0}
                    </span>
                  </div>
              </div>

              <div className="pt-4 pb-2 border-t text-slate-900">
                 <label className="block text-[10px] font-black uppercase text-slate-400 mb-1">Sesión a cargo de (Para Bitácora):</label>
                 {selectedSlot.check_in_status === 'Finalizado' ? (
                    <p className="font-bold text-slate-700 uppercase p-3 bg-slate-50 rounded-xl border border-slate-200 text-sm">{selectedSlot.attendant || 'N/A'}</p>
                 ) : (
                    <select value={selectedSlot.attendant || ''} onChange={(e) => setSelectedSlot({...selectedSlot, attendant: e.target.value})} className="w-full p-3 border border-slate-300 rounded-xl font-bold uppercase outline-none focus:border-blue-500 text-sm bg-white text-slate-900">
                      <option value="">Selecciona Personal...</option>
                      {dbUsers.filter(u => u.is_active).map(u => <option key={u.id} value={u.name}>{u.name}</option>)}
                    </select>
                 )}
              </div>

              <div className="flex gap-3 flex-wrap">
                <button onClick={() => setShowPatientProfile(true)} className="flex-1 bg-slate-100 text-slate-700 py-4 rounded-2xl font-black uppercase text-[10px] hover:bg-slate-200 transition">Expediente</button>
                {selectedSlot.check_in_status === 'Finalizado' ? (
                   <div className="flex-1 bg-emerald-100 text-emerald-800 py-4 rounded-2xl font-black uppercase text-[10px] flex items-center justify-center text-center border border-emerald-300">✅ Bitácora Sellada y Firmada</div>
                ) : (
                   <button onClick={() => {
                      if(!selectedSlot.attendant || selectedSlot.attendant === 'Por Asignar') return alert("Por favor selecciona responsable antes de firmar.");
                      setShowBitacora(true);
                   }} className="flex-1 bg-blue-600 text-white py-4 rounded-2xl font-black uppercase text-[10px] shadow-lg hover:bg-blue-700 transition">Bitácora Médica</button>
                )}
                <button onClick={() => printPatientBitacora(selectedSlot.patient)} className="w-full bg-slate-800 text-white py-3 rounded-2xl font-black uppercase text-[10px] hover:bg-slate-700 transition mt-2">🖨️ Imprimir Historial Completo (Firmas)</button>
              </div>
              
              <button onClick={() => loadAuditLogs(selectedSlot.id)} className="w-full text-slate-400 py-2 rounded-2xl font-black uppercase text-[9px] hover:text-slate-600 transition mt-1 underline">👁️ Ver Caja Negra (Auditoría)</button>
            </div>
          </div>
        </div>
      )}
      
      {/* CREAR NUEVA CITA FORMULARIO */}
      {showNewAppointment && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50" style={{ zIndex: 9999 }}>
          <div className="bg-white rounded-3xl max-w-md w-full max-h-[85vh] flex flex-col shadow-2xl border overflow-hidden text-slate-900">
            <div className="bg-slate-50 px-8 py-5 border-b shrink-0 flex justify-between items-center">
               <h3 className="text-xl font-black uppercase text-emerald-600">{selectedSlot?.status === 'booked' ? 'Editar Cita' : 'Registrar Cita'}</h3>
               <button onClick={() => {setShowNewAppointment(false); setSelectedSlot(null);}} className="text-slate-400 hover:text-slate-800 text-2xl font-black transition">&times;</button>
            </div>
            
            <div className="p-8 overflow-y-auto flex-1 space-y-4">
              <div>
                <label className="text-[10px] font-black uppercase text-slate-400">Paciente</label>
                <input type="text" list="patients-list" placeholder="Escribe para buscar..." value={selectedSlot?.patient || ''} onChange={e => {
                  const pName = e.target.value; 
                  const matchingPatients = dbPatients.filter(x => normalizeStr(x.patient) === normalizeStr(pName));
                  const p = matchingPatients.find(c => c.notes && c.notes.trim() !== '') || matchingPatients[0];
                  setSelectedSlot({...selectedSlot, patient: pName, phone: p ? p.phone : '', protocol: p ? p.protocol : '', patientNotes: p ? p.notes : '', prefers_email: p ? p.prefers_email !== false : true, prefers_sms: p ? p.prefers_sms !== false : true});
                }} className="w-full p-3 border border-slate-300 rounded-xl font-bold uppercase outline-none focus:border-emerald-500 text-slate-900 bg-white" />
                <datalist id="patients-list">{dbPatients.map(p => <option key={p.id} value={p.patient} />)}</datalist>
              </div>

              {selectedSlot?.patient && !isNewPatientInline && (
                <div className="bg-amber-50 border border-amber-200 p-4 rounded-xl shadow-inner">
                  <label className="text-[9px] font-black uppercase text-amber-800 flex items-center gap-1">⚠️ Notas Generales del Expediente</label>
                  <textarea 
                    value={selectedSlot.patientNotes || ''} 
                    onChange={e => setSelectedSlot({...selectedSlot, patientNotes: e.target.value})} 
                    placeholder="Ej. Paciente claustrofóbico, diabético..."
                    className="w-full p-2 mt-2 border border-amber-200 rounded-lg text-xs outline-none bg-white font-bold text-amber-900"
                    rows="2"
                  />
                  <p className="text-[8px] text-amber-600 mt-1 font-bold uppercase">Si editas este cuadro, se guardará permanentemente en su perfil.</p>
                </div>
              )}
              
              {isNewPatientInline && (
                <div className="bg-blue-50 border border-blue-200 p-4 rounded-xl space-y-3">
                  <p className="text-xs font-black text-blue-800 uppercase flex items-center gap-2">✨ Paciente Nuevo Detectado</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[9px] font-black uppercase text-blue-700">Teléfono</label>
                      <input type="text" value={selectedSlot?.phone || ''} onChange={e => setSelectedSlot({...selectedSlot, phone: e.target.value})} className="w-full p-2 border border-blue-200 rounded-lg font-bold text-xs outline-none text-slate-900 bg-white" />
                    </div>
                    <div>
                      <label className="text-[9px] font-black uppercase text-blue-700">Correo</label>
                      <input type="email" value={selectedSlot?.email || ''} onChange={e => setSelectedSlot({...selectedSlot, email: e.target.value})} className="w-full p-2 border border-blue-200 rounded-lg font-bold text-xs outline-none text-slate-900 bg-white" />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3 mt-3">
                    <div className="flex items-center gap-2">
                      <input type="checkbox" checked={selectedSlot?.prefers_sms !== false} onChange={e => setSelectedSlot({...selectedSlot, prefers_sms: e.target.checked})} className="w-4 h-4" />
                      <label className="text-[9px] font-black uppercase text-blue-800">Recibir SMS</label>
                    </div>
                    <div className="flex items-center gap-2">
                      <input type="checkbox" checked={selectedSlot?.prefers_email !== false} onChange={e => setSelectedSlot({...selectedSlot, prefers_email: e.target.checked})} className="w-4 h-4" />
                      <label className="text-[9px] font-black uppercase text-blue-800">Recibir Correo</label>
                    </div>
                  </div>
                </div>
              )}

              {!isNewPatientInline && (
                <div className="flex items-center gap-2 bg-slate-50 p-3 rounded-xl border border-slate-200">
                  <input type="checkbox" checked={selectedSlot?.is_new_patient || false} onChange={e => setSelectedSlot({...selectedSlot, is_new_patient: e.target.checked})} className="w-4 h-4 cursor-pointer" />
                  <label className="text-xs font-black uppercase text-slate-700 cursor-pointer">⭐ Es Paciente de Primera Vez</label>
                </div>
              )}

              <div>
                <label className="text-[10px] font-black uppercase text-slate-400">Servicio a Reservar</label>
                <select value={selectedSlot?.serviceId || ''} onChange={e => {
                  const sid = e.target.value; 
                  const srv = dbServices.find(s => String(s.id) === String(sid));
                  if(srv) setSelectedSlot({...selectedSlot, serviceId: sid, equipment: srv.name, duration: srv.duration, buffer: srv.buffer});
                }} className="w-full p-3 border rounded-xl font-bold uppercase outline-none focus:border-emerald-500 text-slate-900 bg-white">
                  <option value="">Selecciona un servicio...</option>
                  {(dbServices || []).filter(s => s.is_active).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>

              <div>
                <label className="text-[10px] font-black uppercase text-slate-400">Instrucciones para la sesión de hoy</label>
                <textarea 
                    value={selectedSlot?.notes || ''} 
                    onChange={e => setSelectedSlot({...selectedSlot, notes: e.target.value})} 
                    placeholder="Ej. Subir presión despacio, dolor de oído reciente..."
                    className="w-full p-3 border rounded-xl font-bold text-sm outline-none focus:border-emerald-500 mt-1 bg-blue-50 text-blue-900 border-blue-200"
                    rows="2"
                />
              </div>

              <div className="grid grid-cols-2 gap-3 pb-2">
                <div>
                  <label className="text-[10px] font-black uppercase text-slate-400">Fecha</label>
                  <input type="date" value={selectedSlot?.fullDate || currentFullDate} onChange={e => { 
                    const d = new Date(e.target.value + 'T12:00:00'); 
                    setSelectedSlot({
                      ...(selectedSlot || {}), 
                      fullDate: e.target.value, 
                      day: ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'][d.getDay()]
                    }); 
                  }} className="w-full p-3 border rounded-xl font-bold outline-none text-slate-900 bg-white" />
                </div>
                <div>
                  <label className="text-[10px] font-black uppercase text-slate-400">Hora</label>
                  <select value={selectedSlot?.time || ''} onChange={e => { 
                    setSelectedSlot({
                      ...(selectedSlot || {}), 
                      time: e.target.value
                    });
                  }} className="w-full p-3 border rounded-xl font-bold outline-none text-slate-900 bg-white">
                    <option value="">Hora...</option>
                    {timeOptions.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
              </div>
            </div>

            <div className="bg-slate-50 px-8 py-5 border-t shrink-0 flex gap-3 text-slate-900">
              <button onClick={() => {setShowNewAppointment(false); setSelectedSlot(null);}} className="w-1/3 bg-white border border-slate-300 font-black py-4 rounded-xl uppercase text-xs hover:bg-slate-50 transition">Cancelar</button>
              <button onClick={async () => {
                try {
                  if(!selectedSlot?.patient || !selectedSlot?.equipment || !selectedSlot?.time) return alert("Faltan datos.");
                  if (isPastTime(selectedSlot.fullDate, selectedSlot.time) && selectedSlot.status !== 'booked') return alert("🔒 No puedes agendar en el pasado.");
                  const existingP = dbPatients.find(x => normalizeStr(x.patient) === normalizeStr(selectedSlot.patient));
                  if (existingP && existingP.is_blocked) return alert("🚫 Paciente Bloqueado.");
                  if (checkOverlap(selectedSlot.equipment, selectedSlot.fullDate, selectedSlot.time, selectedSlot.duration, selectedSlot.buffer, selectedSlot.id)) return alert("🔒 Empalme de horario.");

                  if (isNewPatientInline && !selectedSlot.id) {
                    const { error: pe } = await savePatientToDB(activeSupabase, { 
                        name: selectedSlot.patient.trim(), 
                        phone: (selectedSlot.phone || '').trim(), 
                        email: (selectedSlot.email || '').trim(), 
                        protocol: selectedSlot.protocol || 'Wellness', 
                        notes: selectedSlot.patientNotes || '',
                        prefers_email: selectedSlot.prefers_email !== false,
                        prefers_sms: selectedSlot.prefers_sms !== false
                    });
                    if (pe) return alert("Error: " + pe.message);
                  } else if (!isNewPatientInline && selectedSlot.patientNotes !== undefined) {
                    const matching = dbPatients.filter(x => normalizeStr(x.patient) === normalizeStr(selectedSlot.patient));
                    for (const pat of matching) { await activeSupabase.from('patients').update({ notes: selectedSlot.patientNotes }).eq('id', pat.id); }
                  }
                  
                  const payload = { patient: selectedSlot.patient.trim(), phone: (selectedSlot.phone || '').trim(), protocol: selectedSlot.protocol || 'Wellness', equipment: selectedSlot.equipment, duration: Number(selectedSlot.duration) || 60, buffer: Number(selectedSlot.buffer) || 0, full_date: selectedSlot.fullDate || currentFullDate, appointment_date: selectedSlot.fullDate || currentFullDate, day: selectedSlot.day || currentDayInfo.name, time: selectedSlot.time, appointment_time: selectedSlot.time, attendant: selectedSlot.attendant || 'Por Asignar', check_in_status: selectedSlot.check_in_status || 'Agendado', is_new_patient: selectedSlot.is_new_patient || isNewPatientInline, notes: selectedSlot.notes || '' };
                  const { data: na, error } = await activeSupabase.from('appointments').insert([payload]).select();
                  if(error) alert("Error: " + error.message); else { if (na && na[0]) await logAudit(na[0].id, payload.patient, 'CREACIÓN', payload.time); setShowNewAppointment(false); setSelectedSlot(null); fetchAllData(); }
                } catch (e) { alert("Error de conexión."); }
              }} className="flex-1 bg-emerald-600 text-white font-black py-4 rounded-xl uppercase text-xs shadow-lg hover:bg-emerald-700 transition">Agendar Espacio</button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL ALTA RÁPIDA (SOLO GUARDAR CLIENTE) */}
      {showNewPatientModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50" style={{ zIndex: 9999 }}>
          <div className="bg-white rounded-3xl max-w-sm w-full max-h-[85vh] flex flex-col shadow-2xl border overflow-hidden">
            <div className="bg-slate-50 px-8 py-5 border-b shrink-0 flex justify-between items-center">
               <h3 className="text-xl font-black uppercase text-emerald-600">Alta Rápida</h3>
               <button onClick={() => setShowNewPatientModal(false)} className="text-slate-400 hover:text-slate-800 text-2xl font-black transition">&times;</button>
            </div>
            
            <div className="p-8 overflow-y-auto flex-1 space-y-4">
              <div>
                <label className="text-[10px] font-black uppercase text-slate-400 ml-1">Nombre Completo</label>
                <input type="text" placeholder="Ej. Juan Pérez" value={newPatientData.name} onChange={e => setNewPatientData({...newPatientData, name: e.target.value})} className="w-full p-3 border rounded-xl font-bold text-sm uppercase outline-none focus:border-emerald-500 text-slate-900 bg-white" />
              </div>
              <div>
                <label className="text-[10px] font-black uppercase text-slate-400 ml-1">Teléfono</label>
                <input type="text" placeholder="Ej. 3312345678" value={newPatientData.phone} onChange={e => setNewPatientData({...newPatientData, phone: e.target.value})} className="w-full p-3 border rounded-xl font-bold text-sm outline-none focus:border-emerald-500 text-slate-900 bg-white" />
              </div>
              <div>
                <label className="text-[10px] font-black uppercase text-slate-400 ml-1">Correo (Opcional)</label>
                <input type="email" placeholder="correo@ejemplo.com" value={newPatientData.email} onChange={e => setNewPatientData({...newPatientData, email: e.target.value})} className="w-full p-3 border rounded-xl font-bold text-sm outline-none focus:border-emerald-500 text-slate-900 bg-white" />
              </div>
              <div>
                <label className="text-[10px] font-black uppercase text-slate-400 ml-1">Protocolo Inicial</label>
                <select value={newPatientData.protocol} onChange={e => setNewPatientData({...newPatientData, protocol: e.target.value})} className="w-full p-3 border rounded-xl font-bold text-sm uppercase outline-none focus:border-emerald-500 text-slate-900 bg-white">
                  <option value="">Selecciona Protocolo...</option>
                  {dbProtocols.filter(p => p.is_active).map(p => <option key={p.id} value={p.name}>{p.name}</option>)}
                </select>
              </div>
              <div className="flex gap-4">
                <div className="flex items-center gap-2">
                  <input type="checkbox" checked={newPatientData.prefers_sms} onChange={e => setNewPatientData({...newPatientData, prefers_sms: e.target.checked})} className="w-4 h-4" />
                  <label className="text-[10px] font-black uppercase text-slate-700">Recibir SMS</label>
                </div>
                <div className="flex items-center gap-2">
                  <input type="checkbox" checked={newPatientData.prefers_email} onChange={e => setNewPatientData({...newPatientData, prefers_email: e.target.checked})} className="w-4 h-4" />
                  <label className="text-[10px] font-black uppercase text-slate-700">Recibir Correo</label>
                </div>
              </div>
              <div className="bg-amber-50 p-3 border border-amber-200 rounded-xl">
                <label className="text-[9px] font-black uppercase text-amber-800 ml-1 flex items-center gap-1">⚠️ Notas Generales / Alertas</label>
                <textarea 
                  placeholder="Ej. Precaución con oídos..." 
                  value={newPatientData.notes || ''} 
                  onChange={e => setNewPatientData({...newPatientData, notes: e.target.value})} 
                  className="w-full p-2 mt-1 border border-amber-200 rounded-lg font-bold text-xs outline-none bg-white text-amber-900" 
                  rows="2"
                />
              </div>
            </div>

            <div className="bg-slate-50 px-8 py-5 border-t shrink-0 flex gap-2">
              <button onClick={async () => {
                const trimmedName = newPatientData.name.trim();
                if (!trimmedName) return alert("El nombre es obligatorio.");
                
                const { error } = await savePatientToDB(activeSupabase, {
                    name: trimmedName,
                    phone: newPatientData.phone.trim(),
                    email: newPatientData.email.trim(),
                    protocol: newPatientData.protocol,
                    notes: newPatientData.notes,
                    prefers_email: newPatientData.prefers_email,
                    prefers_sms: newPatientData.prefers_sms
                });
                
                if (error && error.message === "CLON_DETECTADO") return alert("El paciente o teléfono ya existe en el directorio.");
                if (error) return alert("Error guardando cliente: " + error.message); 
                
                setShowNewPatientModal(false); 
                setNewPatientData({ name: '', phone: '', email: '', protocol: 'Wellness', notes: '', prefers_email: true, prefers_sms: true }); 
                await fetchAllData(); 
              }} className="w-1/2 bg-white border border-slate-300 text-slate-700 font-black py-4 rounded-xl uppercase text-[10px] shadow-sm hover:bg-slate-50">Solo Guardar</button>
              
              <button onClick={async () => {
                const trimmedName = newPatientData.name.trim();
                if (!trimmedName) return alert("El nombre es obligatorio.");
                
                const { error } = await savePatientToDB(activeSupabase, {
                    name: trimmedName,
                    phone: newPatientData.phone.trim(),
                    email: newPatientData.email.trim(),
                    protocol: newPatientData.protocol,
                    notes: newPatientData.notes,
                    prefers_email: newPatientData.prefers_email,
                    prefers_sms: newPatientData.prefers_sms
                });
                
                if (error && error.message === "CLON_DETECTADO") return alert("El paciente o teléfono ya existe en el directorio.");
                if (error) return alert("Error guardando cliente: " + error.message); 
                
                setShowNewPatientModal(false); 
                setSelectedSlot({
                  patient: trimmedName,
                  phone: newPatientData.phone.trim(),
                  email: newPatientData.email.trim(),
                  protocol: newPatientData.protocol,
                  patientNotes: newPatientData.notes,
                  prefers_email: newPatientData.prefers_email,
                  prefers_sms: newPatientData.prefers_sms,
                  status: 'available',
                  is_new_patient: true
                });
                setShowNewAppointment(true);

                setNewPatientData({ name: '', phone: '', email: '', protocol: 'Wellness', notes: '', prefers_email: true, prefers_sms: true }); 
                await fetchAllData(); 
              }} className="w-1/2 bg-emerald-600 text-white font-black py-4 rounded-xl uppercase text-[10px] shadow-lg hover:bg-emerald-700">Guardar y Agendar</button>
            </div>
          </div>
        </div>
      )}

      {showOOOModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50" style={{ zIndex: 9999 }}>
          <div className="bg-white rounded-3xl max-w-sm w-full max-h-[85vh] flex flex-col border-t-8 border-red-500 shadow-2xl overflow-hidden text-slate-900">
            <div className="bg-slate-50 px-8 py-5 border-b shrink-0 flex justify-between items-center">
              <h3 className="text-xl font-black uppercase text-red-600">🚫 Bloquear Agenda</h3>
              <button onClick={() => setShowOOOModal(false)} className="text-slate-400 hover:text-slate-800 text-2xl font-black transition">&times;</button>
            </div>
            
            <div className="p-8 overflow-y-auto flex-1 space-y-4">
              <div>
                <label className="text-[10px] font-black uppercase text-slate-400 ml-1">Fecha a bloquear</label>
                <input type="date" value={oooData.date} onChange={e => setOOOData({...oooData, date: e.target.value})} className="w-full p-3 border rounded-xl font-bold text-sm outline-none text-slate-900 bg-white" />
              </div>
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase ml-1">Desde</label>
                  <input type="time" value={oooData.start_time} onChange={e => setOOOData({...oooData, start_time: e.target.value})} className="w-full p-3 border rounded-xl font-bold outline-none text-slate-900 bg-white" />
                </div>
                <div className="flex-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase ml-1">Hasta</label>
                  <input type="time" value={oooData.end_time} onChange={e => setOOOData({...oooData, end_time: e.target.value})} className="w-full p-3 border rounded-xl font-bold outline-none text-slate-900 bg-white" />
                </div>
              </div>
              <div className="flex items-center gap-3 bg-red-50 p-3 rounded-xl border border-red-100 cursor-pointer" onClick={() => setOOOData({...oooData, is_global: !oooData.is_global})}>
                <div className={`w-5 h-5 rounded flex items-center justify-center ${oooData.is_global ? 'bg-red-500' : 'bg-white border-2 border-slate-300'}`}>
                  {oooData.is_global && <span className="text-white text-xs">✓</span>}
                </div>
                <label className="text-xs font-black uppercase text-red-900 cursor-pointer">Cerrar Toda la Clínica</label>
              </div>
              {!oooData.is_global && (
                <div>
                  <label className="text-[10px] font-black uppercase text-slate-400 ml-1">Equipo a Bloquear</label>
                  <select value={oooData.equipment} onChange={e => setOOOData({...oooData, equipment: e.target.value})} className="w-full p-3 border rounded-xl font-bold text-sm uppercase outline-none text-slate-900 bg-white">
                    {dynamicColumns.map(e => <option key={e} value={e}>{e}</option>)}
                  </select>
                </div>
              )}
              <div className="pb-2">
                <label className="text-[10px] font-black uppercase text-slate-400 ml-1">Motivo</label>
                <input type="text" placeholder="Ej. Mantenimiento Preventivo" value={oooData.reason} onChange={e => setOOOData({...oooData, reason: e.target.value})} className="w-full p-3 border rounded-xl font-bold text-sm uppercase outline-none text-slate-900 bg-white" />
              </div>
            </div>
            
            <div className="bg-slate-50 px-8 py-5 border-t shrink-0 flex gap-3">
              <button onClick={() => setShowOOOModal(false)} className="w-1/3 bg-white border border-slate-300 font-black py-4 rounded-xl uppercase text-xs hover:bg-slate-50">Cancelar</button>
              <button onClick={async () => {
                if (!oooData.date) return alert("Selecciona una fecha");
                await activeSupabase.from('blocked_slots').insert([{ 
                  date: oooData.date, 
                  start_time: oooData.start_time, 
                  end_time: oooData.end_time, 
                  equipment: oooData.is_global ? null : oooData.equipment, 
                  reason: oooData.reason, 
                  is_global: oooData.is_global 
                }]);
                setShowOOOModal(false); 
                fetchAllData();
              }} className="flex-1 bg-red-600 text-white font-black py-4 rounded-xl uppercase text-xs shadow-lg hover:bg-red-700">Aplicar Bloqueo</button>
            </div>
          </div>
        </div>
      )}

      {moveConfirmation && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50" style={{ zIndex: 9999 }}>
          <div className="bg-white rounded-3xl max-w-sm w-full p-8 text-center shadow-2xl text-slate-900">
            <h3 className="text-xl font-black mb-6 uppercase">⚠️ Confirmar Movimiento</h3>
            <p className="text-sm font-bold text-slate-500 mb-4">Reubicar a <span className="text-slate-800 uppercase">{moveConfirmation.app.patient}</span>?</p>
            <div className="flex space-x-3">
              <button onClick={() => setMoveConfirmation(null)} className="flex-1 bg-slate-100 font-black py-4 rounded-2xl uppercase text-xs hover:bg-slate-200">No</button>
              <button onClick={confirmMove} className="flex-1 bg-blue-600 text-white font-black py-4 rounded-2xl uppercase text-xs shadow-lg hover:bg-blue-700">Confirmar</button>
            </div>
          </div>
        </div>
      )}

      {showPatientProfile && selectedSlot && (
        <div className="relative z-50" style={{ zIndex: 9999 }}>
          <PatientProfileModal 
            initialData={selectedSlot} 
            servicios={dbServices} 
            currentUserLevel={currentUserLevel}
            onClose={() => setShowPatientProfile(false)} 
            onSave={async (ud) => {
              const activeSupabase = activeClinic === 'Shenandoah' ? supabaseShenandoah : supabaseGdl;
              if (ud.id && String(ud.id).length > 10) {
                let p = { 
                  Name: ud.patient, 
                  Phone: ud.phone, 
                  Email: ud.email, 
                  protocol: ud.protocol, 
                  notes: ud.notes, 
                  is_blocked: ud.is_blocked, 
                  prefers_email: ud.prefers_email,
                  prefers_sms: ud.prefers_sms,
                  wallets: ud.wallets, 
                  package_history: ud.packageHistory, 
                  historico_sesiones: ud.historicoSesiones 
                };
                let res = await activeSupabase.from('patients').update(p).eq('id', ud.id);

                if (res.error && res.error.message.toLowerCase().includes('column')) {
                  await activeSupabase.from('patients').update({ 
                    name: ud.patient, 
                    phone: ud.phone, 
                    email: ud.email, 
                    protocol: ud.protocol, 
                    notes: ud.notes, 
                    is_blocked: ud.is_blocked, 
                    prefers_email: ud.prefers_email,
                    prefers_sms: ud.prefers_sms,
                    wallets: ud.wallets, 
                    package_history: ud.packageHistory, 
                    historico_sesiones: ud.historicoSesiones 
                  }).eq('id', ud.id);
                }
              }
              setShowPatientProfile(false); 
              fetchAllData();
            }} 
          />
        </div>
      )}

      {showBitacora && selectedSlot && (
        <div className="relative z-50" style={{ zIndex: 9999 }}>
          <BitacoraModal 
            selectedSlot={selectedSlot} 
            onClose={() => setShowBitacora(false)} 
            onSeal={async (sd, vt) => {
              const eq = selectedSlot.equipment; 
              let currentWallets = { ... (selectedSlot.wallets || {}) }; 
              if (currentWallets[eq] && currentWallets[eq] > 0) { 
                 currentWallets[eq] -= 1; 
              } else {
                 const fallbackEq = Object.keys(currentWallets).find(key => (key.toLowerCase().includes('cámara') || key.toLowerCase().includes('camara')) && currentWallets[key] > 0);
                 if (fallbackEq) currentWallets[fallbackEq] -= 1;
              }
              await activeSupabase.from('patients').update({ wallets: currentWallets, historico_sesiones: (selectedSlot.historicoSesiones || 0) + 1 }).eq('id', selectedSlot.patientId || selectedSlot.id);
              await activeSupabase.from('appointments').update({ check_in_status: 'Finalizado', attendant: selectedSlot.attendant, signature: sd }).eq('id', selectedSlot.id);
              
              let auditStr = `Bitácora sellada y firmada por ${selectedSlot.attendant}.`;
              if (selectedSlot.protocol === 'Médico' && vt) {
                 auditStr += ` Signos: PA ${vt.pa}, Temp ${vt.temp}, HR ${vt.hr}.`;
              }
              await logAudit(selectedSlot.id, selectedSlot.patient, 'FIRMA MÉDICA', auditStr);

              setShowBitacora(false); setSelectedSlot(null); fetchAllData();
            }} 
          />
        </div>
      )}
    </div>
  );
}
