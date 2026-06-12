"use client";
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { supabaseShenandoah, supabaseGdl } from '../lib/supabase';
import { SESSION_PRESETS, getPresetFromTimes } from '../lib/sessionPresets';
import {
  canAccessClinic,
  getAllowedClinics,
  getStaffProfileForClinic,
  resolveStaffLogin,
} from '../lib/clinicAccess';
import { ensurePatient, digitsOnly } from '../lib/ensurePatient';
import {
  buildCalendarWeek,
  getDayNameFromDate,
  localeForClinic,
  staffAlert,
  staffStrings,
} from '../lib/i18n';
import BitacoraModal from '../components/BitacoraModal';
import PatientProfileModal from '../components/PatientProfileModal';
import GFEManager from '../components/GFEManager';
import { InstallGuideLink } from '../components/InstallGuide';
import PatientSearchInput from '../components/PatientSearchInput';
import { StaffLocaleProvider } from '../components/StaffLocaleContext';
import StaffBookingOverrides from '../components/StaffBookingOverrides';
import CalendarAppointmentBlock from '../components/CalendarAppointmentBlock';
import { getServiceScheduleBounds, buildAvailabilitySlotTimes, buildStaffAppointmentTimeOptions, normalizeTimeInput } from '../lib/serviceSchedule';
import { insertStaffAppointment, updateStaffAppointment } from '../lib/staffAppointmentSave';
import { saveCompanyConfigRow } from '../lib/companyConfigSave';
import { formatClinicField, formatClinicPhone } from '../lib/clinicText';
import { getSessionPresetLabels, translateCheckInStatus } from '../lib/i18n';
import {
  computeDefaultZoomScale,
  getEquipmentShortLabel,
  isCompactColumn,
  WEEK_STICKY_HEADER_PX,
} from '../lib/calendarDisplay';
import { loadCalendarPrefs, saveCalendarPrefs } from '../lib/calendarPrefs';
import { buildPromoterBookingUrl, normalizePromoCode } from '../lib/promoters';
import {
  buildNotifyContent,
  formatBookingNotifyFeedback,
  notifyHadFailure,
  sendAppointmentNotification,
  summarizeNotifyReport,
} from '../lib/appointmentNotify';
import {
  EMAIL_PLACEHOLDER_HINT,
  emptyEmailTemplateState,
  resolveAppointmentNotifyType,
} from '../lib/emailTemplates';
import {
  defaultNotifySettings,
  getAutoNotifyBlockReason,
  getSessionInstructionsLabel,
  isAutoNotifyEnabled,
  NOTIFY_SETTING_FIELDS,
  resolveSessionInstructions,
} from '../lib/notifySettings';
import {
  notifyStaffNewBooking,
  STAFF_ALERT_FIELDS,
} from '../lib/staffBookingAlert';

export default function AppLayout() {
  // --- SEGURIDAD Y JERARQUÍA ---
  const [currentUser, setCurrentUser] = useState(null);
  const [loginPin, setLoginPin] = useState('');
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [mobileMoreOpen, setMobileMoreOpen] = useState(false);
  const [wrongHostWarning, setWrongHostWarning] = useState(false);

  const canonicalHost = process.env.NEXT_PUBLIC_CANONICAL_HOST || 'oxy-agenda.vercel.app';
  const buildSha = process.env.NEXT_PUBLIC_BUILD_SHA || 'dev';

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const host = window.location.hostname;
    setWrongHostWarning(host !== canonicalHost && host !== 'localhost' && !host.endsWith('.local'));
  }, [canonicalHost]);

  // --- ESTADOS PRINCIPALES ---
  const [activeClinic, setActiveClinic] = useState('Guadalajara'); 
  const [activeTab, setActiveTab] = useState('Agenda');
  const [viewMode, setViewMode] = useState('Semana'); 
  const [equipmentFilter, setEquipmentFilter] = useState('Todos');
  const [zoomScale, setZoomScale] = useState(80);
  const [zoomManual, setZoomManual] = useState(false);
  const [isMobileViewport, setIsMobileViewport] = useState(false);
  const [weekFilterHintDismissed, setWeekFilterHintDismissed] = useState(false);
  const [showCalendarLegend, setShowCalendarLegend] = useState(false);
  const [currentDate, setCurrentDate] = useState(new Date());
  const prefsHydratedRef = useRef(false);
  const skipAutoZoomRef = useRef(false);
  
  // --- RELOJ MULTIHUSO HORARIO ---
  const [clinicNow, setClinicNow] = useState({ mins: 0, dateStr: '' });

  // Moneda Dinámica
  const currencyStr = activeClinic === 'Shenandoah' ? 'USD' : 'MXN';

  // --- MODALES Y SELECCIÓN ---
  const [showBitacora, setShowBitacora] = useState(false);
  const [showPatientProfile, setShowPatientProfile] = useState(false);
  const [showNewAppointment, setShowNewAppointment] = useState(false);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancelDeductSession, setCancelDeductSession] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState(null);
  const [draggedApp, setDraggedApp] = useState(null);
  const [moveConfirmation, setMoveConfirmation] = useState(null);
  const [isRescheduling, setIsRescheduling] = useState(false);
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
    reminder_hours: 24,
    ...defaultNotifySettings('es'),
    ...emptyEmailTemplateState('es'),
  });
  
  const [emailTemplateTab, setEmailTemplateTab] = useState('first');
  const [emailPreview, setEmailPreview] = useState(null);
  const [adminSubTab, setAdminSubTab] = useState('general');

  const [searchQuery, setSearchQuery] = useState('');
  const [dbStatus, setDbStatus] = useState('cargando');
  const [dbErrorMessage, setDbErrorMessage] = useState('');

  // --- FORMULARIOS GLOBALES ---
  const [newSrv, setNewSrv] = useState({ id: null, name: '', duration: 60, buffer: 30, price: 100, color: 'blue', is_active: true, equipment: 'Cámara 1', start_time: '', end_time: '' });
  const [isEditingSrv, setIsEditingSrv] = useState(false);
  
  const [newProtocol, setNewProtocol] = useState({ id: null, name: '', is_active: true });
  const [isEditingProtocol, setIsEditingProtocol] = useState(false);

  const [dbPromoters, setDbPromoters] = useState([]);
  const [promotersLoadError, setPromotersLoadError] = useState('');
  const [newPromoter, setNewPromoter] = useState({ id: null, code: '', name: '', is_active: true });
  const [isEditingPromoter, setIsEditingPromoter] = useState(false);

  const [newRole, setNewRole] = useState({ id: null, name: '', level: 3 });
  const [isEditingRole, setIsEditingRole] = useState(false);

  const [newUser, setNewUser] = useState({ id: null, name: '', email: '', phone: '', notify_on_booking: true, role: 'Técnico Certificado IBUM', cert: '', is_active: true, pin: '' });
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

  const locale = localeForClinic(activeClinic);
  const L = useMemo(() => staffStrings(locale), [locale]);
  const presetLabels = useMemo(() => getSessionPresetLabels(locale), [locale]);
  const a = (key, ...args) => staffAlert(locale, key, ...args);

  const emailTemplateTabLabels = {
    first: locale === 'en' ? 'First appointment' : 'Primera cita',
    booking: locale === 'en' ? 'Scheduling' : 'Programación',
    reschedule: locale === 'en' ? 'Reschedule' : 'Reprogramación',
    cancel: locale === 'en' ? 'Cancellation' : 'Cancelación',
  };

  const pickEmailTemplates = (config = dbCompanyConfig) => ({
    notify_subject_first: config.notify_subject_first,
    notify_body_first: config.notify_body_first,
    notify_subject_booking: config.notify_subject_booking,
    notify_body_booking: config.notify_body_booking,
    notify_subject_reschedule: config.notify_subject_reschedule,
    notify_body_reschedule: config.notify_body_reschedule,
    notify_subject_cancel: config.notify_subject_cancel,
    notify_body_cancel: config.notify_body_cancel,
    notify_extra_info: config.notify_extra_info,
  });

  const pickStaffAlertSettings = (config = dbCompanyConfig) => {
    const picked = {};
    for (const key of STAFF_ALERT_FIELDS) {
      picked[key] = config[key];
    }
    return picked;
  };

  const alertStaffNewBooking = async (slot, { source = 'staff', promoterCode = '' } = {}) => {
    if (dbCompanyConfig.notify_staff_on_booking !== true) {
      return { skipped: true, reason: 'disabled' };
    }
    try {
      return await notifyStaffNewBooking({
        companyConfig: { ...pickStaffAlertSettings(), notify_staff_on_booking: true },
        staffRoster: (dbUsers || []).filter((u) => u.is_active),
        clinicName: activeClinic,
        clinicDisplayName: dbCompanyConfig.name,
        patientName: slot.patient,
        date: slot.full_date || slot.fullDate,
        time: slot.time,
        equipment: slot.equipment,
        locale,
        source,
        promoterCode,
      });
    } catch (error) {
      console.warn('Staff booking alert failed', error);
      return null;
    }
  };

  const pickNotifySettings = (config = dbCompanyConfig) => {
    const picked = {};
    for (const key of NOTIFY_SETTING_FIELDS) {
      picked[key] = config[key];
    }
    return picked;
  };

  const openEmailPreview = () => {
    const sampleDate = new Date();
    sampleDate.setDate(sampleDate.getDate() + 3);
    const dateStr = sampleDate.toISOString().split('T')[0];
    const sampleService = dbServices.find((s) => s.is_active)?.name
      || (locale === 'en' ? 'Hyperbaric Chamber' : 'Cámara Hiperbárica');
    const previewInstructions = resolveSessionInstructions('', dbCompanyConfig, locale);
    const previewTimes = resolveSessionTimes({ duration: 60, buffer: 30 });
    const preview = buildNotifyContent({
      locale,
      notifyType: emailTemplateTab,
      patientName: locale === 'en' ? 'John Smith' : 'María González',
      clinicName: activeClinic,
      clinicDisplayName: dbCompanyConfig.name,
      date: dateStr,
      time: '10:00',
      equipment: sampleService,
      instructions: previewInstructions,
      instructionsLabel: getSessionInstructionsLabel(dbCompanyConfig, locale),
      address: dbCompanyConfig.address || (locale === 'en' ? '123 Medical Center Dr, Houston TX' : 'Av. Patria 123, Guadalajara'),
      clinicPhone: dbCompanyConfig.phone || (locale === 'en' ? '2815550100' : '3312345678'),
      ticketMessage: dbCompanyConfig.ticket_message,
      emailTemplates: pickEmailTemplates(),
      durationMins: previewTimes.duration,
      bufferMins: previewTimes.buffer,
    });
    setEmailPreview(preview);
  };

  const buildCompanyConfigPayload = () => ({
    name: formatClinicField(dbCompanyConfig.name),
    address: formatClinicField(dbCompanyConfig.address),
    phone: formatClinicPhone(dbCompanyConfig.phone),
    ticket_message: formatClinicField(dbCompanyConfig.ticket_message),
    start_time: normalizeTimeInput(dbCompanyConfig.start_time) || '07:00',
    end_time: normalizeTimeInput(dbCompanyConfig.end_time) || '20:00',
    interval_mins: dbCompanyConfig.interval_mins,
    booking_limit_hours: dbCompanyConfig.booking_limit_hours,
    cancel_limit_hours: dbCompanyConfig.cancel_limit_hours,
    master_pin: dbCompanyConfig.master_pin,
    financial_pin: dbCompanyConfig.financial_pin,
    notify_on_booking: dbCompanyConfig.notify_on_booking,
    reminder_hours: dbCompanyConfig.reminder_hours,
    ...pickEmailTemplates(),
    ...pickNotifySettings(),
    ...pickStaffAlertSettings(),
  });

  const saveCompanyConfig = async () => {
    const { error, warning } = await saveCompanyConfigRow(activeSupabase, {
      id: dbCompanyConfig.id,
      clinic: activeClinic,
      payload: buildCompanyConfigPayload(),
    });
    if (error) throw new Error(error.message);
    alert(warning || L.p.admin.configSaved);
    fetchAllData();
  };

  useEffect(() => {
    document.documentElement.lang = locale === 'en' ? 'en' : 'es';
  }, [locale]);

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 1023px)');
    const update = () => setIsMobileViewport(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);

  const activeSupabase = activeClinic === 'Shenandoah' ? supabaseShenandoah : supabaseGdl;

  const allowedClinics = getAllowedClinics(currentUser);
  const activeStaffProfile = getStaffProfileForClinic(currentUser, activeClinic) || currentUser;

  // CÁLCULO DE JERARQUÍA (rol puede variar por clínica)
  const currentUserLevel = currentUser?.id === 'admin'
    ? 1
    : (dbRoles.find(r => r.name === activeStaffProfile?.role)?.level || 3);

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

  const getServiceForSlot = (slot) => (
    dbServices.find(s => String(s.id) === String(slot?.serviceId))
    || dbServices.find(s => s.name === slot?.equipment)
  );

  const isExtendedSession = (slot) => (
    !!slot?.extended_session
    || !!slot?.is_extended_block
  );

  const resolveSessionTimes = (slot) => {
    if (isExtendedSession(slot)) {
      return { duration: 90, buffer: 90 };
    }
    const srv = getServiceForSlot(slot);
    return {
      duration: Number(slot?.duration) || Number(srv?.duration) || 60,
      buffer: Number(slot?.buffer ?? srv?.buffer ?? 30),
    };
  };

  const applyExtendedSession = (slot, enabled) => {
    const base = { ...(slot || {}) };
    if (enabled) {
      return {
        ...base,
        extended_session: true,
        sessionPreset: SESSION_PRESETS.extended.id,
        duration: 90,
        buffer: 90,
        time: '',
      };
    }
    const srv = getServiceForSlot(base);
    const duration = Number(srv?.duration) || 60;
    const buffer = Number(srv?.buffer ?? 30);
    return {
      ...base,
      extended_session: false,
      sessionPreset: getPresetFromTimes(duration, buffer).id,
      duration,
      buffer,
      time: '',
    };
  };

  const applyOutsideHours = (slot, enabled) => ({
    ...(slot || {}),
    outside_normal_hours: enabled,
    time: '',
  });

  const appointmentFlagsFromApp = (app) => ({
    outside_normal_hours: !!app.outside_normal_hours,
    extended_session: !!app.is_extended_block,
  });

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
      alert(a('auditReadError'));
    }
  };

  // --- MOTOR INTELIGENTE AUTO-ADAPTABLE (TX / GDL) ---
  const savePatientToDB = async (db, pData) => {
    const result = await ensurePatient(db, {
      name: pData.name,
      phone: pData.phone,
      email: pData.email,
      protocol: pData.protocol,
      notes: pData.notes,
      prefers_email: pData.prefers_email,
      prefers_sms: pData.prefers_sms,
    });
    if (result.error) {
      const last10 = digitsOnly(pData.phone).slice(-10);
      const duplicateInMemory = dbPatients.some(
        (p) => digitsOnly(p.phone).slice(-10) === last10 && last10.length === 10
      );
      if (duplicateInMemory) return { error: { message: 'CLON_DETECTADO' } };
      return { error: result.error };
    }
    return { data: [{ id: result.id }], error: null };
  };

  const persistPatientContactFromSlot = async (slot) => {
    const matchingPatients = dbPatients.filter(x => normalizeStr(x.patient) === normalizeStr(slot.patient));
    const canonicalPhone = (slot.phone || '').trim();
    const canonicalEmail = (slot.email || '').trim();
    const phoneDigits = digitsOnly(canonicalPhone).slice(-10);

    if (phoneDigits.length === 10) {
      const ensured = await ensurePatient(activeSupabase, {
        name: slot.patient,
        phone: canonicalPhone,
        email: canonicalEmail,
        protocol: slot.protocol || matchingPatients[0]?.protocol || 'Wellness',
        notes: slot.patientNotes ?? matchingPatients[0]?.notes ?? '',
        prefers_email: slot.prefers_email !== false,
        prefers_sms: slot.prefers_sms !== false,
      });
      if (ensured.error) return ensured;
      return {
        error: null,
        phone: ensured.phone,
        email: ensured.email,
        patient: ensured.displayName,
      };
    }

    for (const pat of matchingPatients) {
      const legacyPatch = {
        notes: slot.patientNotes ?? pat.notes ?? '',
        prefers_email: slot.prefers_email !== false,
        prefers_sms: slot.prefers_sms !== false,
      };
      if (canonicalPhone) {
        legacyPatch.Phone = canonicalPhone;
        legacyPatch.phone = canonicalPhone;
      }
      if (canonicalEmail) {
        legacyPatch.Email = canonicalEmail;
        legacyPatch.email = canonicalEmail;
      }
      let upRes = await activeSupabase.from('patients').update(legacyPatch).eq('id', pat.id);
      if (upRes.error) {
        const lowerPatch = {
          notes: legacyPatch.notes,
          prefers_email: legacyPatch.prefers_email,
          prefers_sms: legacyPatch.prefers_sms,
        };
        if (canonicalPhone) lowerPatch.phone = canonicalPhone;
        if (canonicalEmail) lowerPatch.email = canonicalEmail;
        upRes = await activeSupabase.from('patients').update(lowerPatch).eq('id', pat.id);
        if (upRes.error) return { error: upRes.error };
      }
    }

    return {
      error: null,
      phone: canonicalPhone,
      email: canonicalEmail,
      patient: slot.patient,
    };
  };

  // --- SINCRONIZACIÓN CON PAGINACIÓN INTELIGENTE ---
  const fetchAllData = async () => {
    if (!activeSupabase) { 
      setDbStatus('sin_llaves'); 
      return; 
    }

    try {
      setDbStatus('cargando');

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

      const [patientsData, appointmentsData, resS, resU, resB, resC, resProt, resRoles, resPromo] = await Promise.all([
        fetchPaginated('patients'),
        fetchPaginated('appointments'),
        activeSupabase.from('services').select('*'),
        activeSupabase.from('users_staff').select('*'),
        activeSupabase.from('blocked_slots').select('*'),
        activeSupabase.from('company_config').select('*').eq('clinic', activeClinic).maybeSingle(),
        activeSupabase.from('protocols').select('*'),
        activeSupabase.from('user_roles').select('*'),
        activeSupabase.from('promoters').select('id, code, name, is_active, created_at').order('code'),
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
      if (resPromo.error) {
        setDbPromoters([]);
        setPromotersLoadError(resPromo.error.message || 'promoters');
      } else {
        setDbPromoters(resPromo.data || []);
        setPromotersLoadError('');
      }
      
      if (resC.data) {
        const clinicLocale = localeForClinic(activeClinic);
        setDbCompanyConfig({
          ...emptyEmailTemplateState(clinicLocale),
          ...defaultNotifySettings(clinicLocale),
          ...resC.data,
          name: formatClinicField(resC.data.name),
          address: formatClinicField(resC.data.address),
          phone: formatClinicPhone(resC.data.phone),
          ticket_message: formatClinicField(resC.data.ticket_message),
          notify_session_label: resC.data.notify_session_label || defaultNotifySettings(clinicLocale).notify_session_label,
          notify_session_default: resC.data.notify_session_default ?? defaultNotifySettings(clinicLocale).notify_session_default,
          notify_auto_first: resC.data.notify_auto_first !== false,
          notify_auto_booking: resC.data.notify_auto_booking !== false,
          notify_auto_reschedule: resC.data.notify_auto_reschedule !== false,
          notify_auto_cancel: resC.data.notify_auto_cancel !== false,
          notify_channel_email: resC.data.notify_channel_email !== false,
          notify_channel_sms: resC.data.notify_channel_sms !== false,
          notify_on_booking: resC.data.notify_on_booking !== false,
          notify_staff_on_booking: resC.data.notify_staff_on_booking === true,
          staff_alert_phones: resC.data.staff_alert_phones || '',
          staff_alert_emails: resC.data.staff_alert_emails || '',
          start_time: normalizeTimeInput(resC.data.start_time) || '07:00',
          end_time: normalizeTimeInput(resC.data.end_time) || '20:00',
        });
      } else {
        const clinicLocale = localeForClinic(activeClinic);
        const defaultCfg = { 
          clinic: activeClinic, 
          name: activeClinic === 'Shenandoah' ? 'REGENOXY LLC' : 'OXYGENGDL', 
          address: '', 
          phone: '', 
          ticket_message: activeClinic === 'Shenandoah' ? 'Thank you for choosing us' : 'Gracias por su preferencia', 
          start_time: '07:00', 
          end_time: '20:00', 
          interval_mins: 30,
          booking_limit_hours: 2,
          cancel_limit_hours: 24,
          master_pin: '000000',
          financial_pin: '123456',
          notify_on_booking: true,
          reminder_hours: 24,
          ...defaultNotifySettings(clinicLocale),
          ...emptyEmailTemplateState(clinicLocale),
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

  useEffect(() => {
    if (!currentUser) return;
    const allowed = getAllowedClinics(currentUser);
    if (allowed.length && !allowed.includes(activeClinic)) {
      setActiveClinic(allowed[0]);
    }
  }, [currentUser, activeClinic]);

  // --- MOTORES DE ACCESO Y SEGURIDAD ---
  const handleLoginSubmit = async () => {
    if (isLoggingIn) return;
    setIsLoggingIn(true);
    try {
      const result = await resolveStaffLogin(loginPin, supabaseGdl, supabaseShenandoah);
      if (!result.user) {
        alert(staffAlert(locale, 'pinInvalid'));
        setLoginPin('');
        return;
      }
      setCurrentUser(result.user);
      setActiveClinic(result.user.allowedClinics[0] || 'Guadalajara');
      setLoginPin('');
    } catch {
      alert(staffAlert(locale, 'loginFailed'));
      setLoginPin('');
    } finally {
      setIsLoggingIn(false);
    }
  };

  const switchClinic = (clinic) => {
    if (!canAccessClinic(currentUser, clinic)) {
      alert(staffAlert(locale, 'noClinicAccess'));
      return;
    }
    setActiveClinic(clinic);
  };

  const handleLogout = () => {
    setCurrentUser(null);
    setLoginPin('');
    setActiveTab('Agenda');
    setIsReportsUnlocked(false);
    setActiveClinic('Guadalajara');
  };

  const handleFinancialUnlock = () => {
    const lock = dbCompanyConfig.financial_pin || '123456';
    const staffPin = activeStaffProfile?.pin || currentUser?.pin;
    if (String(pinInput) === String(staffPin) || String(pinInput) === String(lock)) {
        setIsReportsUnlocked(true); 
    } else { 
        alert(staffAlert(locale, 'financialPin')); 
        setPinInput(''); 
    }
  };

  // --- LÓGICA DE TIEMPOS Y CALENDARIO ---
  const currentDateISO = new Date(currentDate).toISOString().split('T')[0];
  const currentFullDate = currentDateISO; 

  const weekDays = useMemo(
    () => buildCalendarWeek(locale, currentDate),
    [locale, currentDate],
  );

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
  const CALENDAR_PAD_MINS = 30;
  const startMins = getMinutes(normalizeTimeInput(dbCompanyConfig.start_time) || '07:00');
  const endMins = getMinutes(normalizeTimeInput(dbCompanyConfig.end_time) || '20:00');
  const calendarStartMins = startMins - CALENDAR_PAD_MINS;
  const intervalMins = Number(dbCompanyConfig.interval_mins) || 30;

  const CALENDAR_HEIGHT = (endMins - calendarStartMins) * PIXELS_PER_MINUTE;
  const currentColWidth = (160 * zoomScale) / 100;
  const isCompact = isCompactColumn(currentColWidth);

  const timeToPixels = (timeStr) => {
    return (getMinutes(timeStr) - calendarStartMins) * PIXELS_PER_MINUTE;
  };

  const activeServices = dbServices.filter(s => s.is_active);
  const dynamicColumns = activeServices.map(s => s.name);
  const displayedEquipments = equipmentFilter === 'Todos' ? dynamicColumns : [equipmentFilter];

  const activeClinicLabel = activeClinic === 'Guadalajara' ? L.clinicGdl : L.clinicTx;
  const activeClinicShort = activeClinic === 'Guadalajara' ? 'GDL' : 'TX';

  const showWeekFilterHint = (
    activeTab === 'Agenda'
    && viewMode === 'Semana'
    && equipmentFilter === 'Todos'
    && dynamicColumns.length > 1
    && !weekFilterHintDismissed
  );

  const agendaSummary = useMemo(() => {
    const active = dbAppointments.filter((a) => a.check_in_status !== 'Cancelado');
    const weekDates = new Set(weekDays.map((d) => d.fullDate));
    const viewApps = viewMode === 'Día'
      ? active.filter((a) => a.full_date === currentFullDate)
      : active.filter((a) => weekDates.has(a.full_date));
    const todayApps = active.filter((a) => a.full_date === clinicNow.dateStr);
    return {
      today: todayApps.length,
      view: viewApps.length,
      extended: viewApps.filter((a) => a.is_extended_block).length,
      outside: viewApps.filter((a) => a.outside_normal_hours).length,
    };
  }, [dbAppointments, viewMode, currentFullDate, weekDays, clinicNow.dateStr]);

  useEffect(() => {
    prefsHydratedRef.current = false;
    skipAutoZoomRef.current = true;
    const prefs = loadCalendarPrefs(activeClinic);
    if (prefs?.viewMode === 'Día' || prefs?.viewMode === 'Semana') setViewMode(prefs.viewMode);
    if (prefs?.equipmentFilter) setEquipmentFilter(prefs.equipmentFilter);
    if (typeof prefs?.zoomScale === 'number') setZoomScale(prefs.zoomScale);
    if (prefs?.zoomManual) setZoomManual(true);
    if (prefs?.weekFilterHintDismissed) setWeekFilterHintDismissed(true);
    prefsHydratedRef.current = true;
    const t = setTimeout(() => { skipAutoZoomRef.current = false; }, 0);
    return () => clearTimeout(t);
  }, [activeClinic]);

  useEffect(() => {
    if (!prefsHydratedRef.current || displayedEquipments.length === 0 || skipAutoZoomRef.current) return;
    if (zoomManual) return;
    setZoomScale(computeDefaultZoomScale({
      viewMode,
      equipmentCount: displayedEquipments.length,
      isMobile: isMobileViewport,
    }));
  }, [viewMode, equipmentFilter, displayedEquipments.length, isMobileViewport, zoomManual]);

  useEffect(() => {
    if (!prefsHydratedRef.current) return;
    saveCalendarPrefs(activeClinic, {
      viewMode,
      equipmentFilter,
      zoomScale,
      zoomManual,
      weekFilterHintDismissed,
    });
  }, [activeClinic, viewMode, equipmentFilter, zoomScale, zoomManual, weekFilterHintDismissed]);

  const timeOptions = useMemo(() => {
    const slots = [];
    for (let m = calendarStartMins; m < endMins; m += intervalMins) {
      const h = Math.floor(m / 60); 
      const mins = m % 60; 
      const ampm = h >= 12 ? 'PM' : 'AM'; 
      const displayH = h > 12 ? h - 12 : h === 0 ? 12 : h;
      slots.push(`${displayH.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')} ${ampm}`);
    }
    return slots;
  }, [calendarStartMins, endMins, intervalMins]);

  const createEmptyAppointmentDraft = () => {
    const firstSrv = dbServices.find(s => s.is_active);
    const duration = Number(firstSrv?.duration) || 60;
    const buffer = Number(firstSrv?.buffer ?? 30);
    return {
      status: 'available',
      fullDate: currentFullDate,
      day: currentDayInfo.name,
      duration,
      buffer,
      sessionPreset: getPresetFromTimes(duration, buffer).id,
      equipment: firstSrv?.name || '',
      serviceId: firstSrv?.id ?? '',
      is_new_patient: false,
      prefers_email: true,
      prefers_sms: true,
      time: '',
      patient: '',
      outside_normal_hours: false,
      extended_session: false,
    };
  };

  const openNewAppointment = (draft = {}) => {
    setSelectedSlot({ ...createEmptyAppointmentDraft(), ...draft });
    setShowNewAppointment(true);
  };

  const openAppointmentDetails = (app) => {
    const matchingPatients = dbPatients.filter(x => normalizeStr(x.patient) === normalizeStr(app.patient));
    const patInfo = matchingPatients.find(x => x.notes && x.notes.trim() !== '') || matchingPatients[0];
    setSelectedSlot({
      ...app,
      status: 'booked',
      patientId: patInfo?.id,
      phone: patInfo?.phone || app.phone,
      email: patInfo?.email,
      protocol: patInfo?.protocol || app.protocol,
      wallets: patInfo?.wallets || {},
      historicoSesiones: patInfo?.historicoSesiones || 0,
      packageHistory: patInfo?.packageHistory || [],
      patientNotes: patInfo ? patInfo.notes : '',
      sessionPreset: getPresetFromTimes(app.duration, app.buffer).id,
      prefers_email: patInfo?.prefers_email !== false,
      prefers_sms: patInfo?.prefers_sms !== false,
      ...appointmentFlagsFromApp(app),
    });
  };

  const resolveSlotContact = (slot) => {
    const matching = dbPatients.filter((x) => normalizeStr(x.patient) === normalizeStr(slot?.patient));
    const pat = matching[0];
    return {
      phone: String(slot?.phone || pat?.phone || '').trim(),
      email: String(slot?.email || pat?.email || '').trim(),
      prefers_email: slot?.prefers_email ?? pat?.prefers_email,
      prefers_sms: slot?.prefers_sms ?? pat?.prefers_sms,
    };
  };

  const notifyPatientFromSlot = async (slot, { showSuccess = false, notifyReason, notifyType: notifyTypeOverride, reportResult = false, forceNotify = false } = {}) => {
    const contact = resolveSlotContact(slot);
    const email = contact.email;
    const phone = contact.phone;

    const notifyType = notifyTypeOverride || resolveAppointmentNotifyType({
      notifyReason,
      isNewPatient: slot.is_new_patient,
      patientName: slot.patient,
      appointments: dbAppointments,
      excludeAppointmentId: slot.id,
      normalize: normalizeStr,
    });

    const isManual = showSuccess;
    const blockReason = forceNotify ? null : getAutoNotifyBlockReason(dbCompanyConfig, notifyType, locale);
    if (!isManual && blockReason) {
      if (showSuccess) alert(L.p.appt.notifyDisabled);
      return reportResult ? { skipped: true, reason: blockReason } : null;
    }

    if (!email && !phone) {
      const reason = locale === 'en'
        ? 'No phone or email on file for this patient.'
        : 'El paciente no tiene teléfono ni correo.';
      if (showSuccess) alert(L.p.appt.notifyNoContact);
      return reportResult ? { skipped: true, reason } : null;
    }

    const sendEmail = dbCompanyConfig.notify_channel_email !== false;
    const sendSms = dbCompanyConfig.notify_channel_sms !== false;
    if (!sendEmail && !sendSms) {
      const reason = locale === 'en'
        ? 'Email and SMS channels are disabled in Admin.'
        : 'Correo y SMS están desactivados en Admin.';
      if (showSuccess) alert(reason);
      return reportResult ? { skipped: true, reason } : null;
    }

    const prefersEmail = contact.prefers_email;
    const prefersSms = contact.prefers_sms;
    if (!isManual && !forceNotify && prefersEmail === false && prefersSms === false) {
      const reason = locale === 'en'
        ? 'Patient opted out of SMS and email.'
        : 'El paciente desactivó SMS y correo.';
      return reportResult ? { skipped: true, reason } : null;
    }

    try {
      const data = await sendAppointmentNotification({
        patientName: slot.patient,
        phone,
        email,
        date: slot.full_date || slot.fullDate,
        time: slot.time,
        equipment: slot.equipment,
        clinicName: activeClinic,
        clinicDisplayName: dbCompanyConfig.name,
        instructions: resolveSessionInstructions(slot.notes, dbCompanyConfig, locale),
        instructionsLabel: getSessionInstructionsLabel(dbCompanyConfig, locale),
        address: dbCompanyConfig.address,
        clinicPhone: dbCompanyConfig.phone,
        ticketMessage: dbCompanyConfig.ticket_message,
        locale,
        durationMins: resolveSessionTimes(slot).duration,
        bufferMins: resolveSessionTimes(slot).buffer,
        prefers_email: prefersEmail,
        prefers_sms: prefersSms,
        notifyEnabled: true,
        notifyType,
        emailTemplates: pickEmailTemplates(),
        sendEmail,
        sendSms,
      });

      const summary = summarizeNotifyReport(data.report, locale);
      if (showSuccess) {
        alert(notifyHadFailure(data.report) ? a('notifyFailed', summary) : a('notifySent', summary));
      } else if (!reportResult && notifyHadFailure(data.report)) {
        alert(a('notifyFailed', summary));
      }
      return reportResult ? { ...data, skipped: false } : data;
    } catch (error) {
      if (showSuccess || (reportResult && forceNotify)) alert(a('notifyFailed', error.message));
      return reportResult ? { skipped: true, reason: error.message } : null;
    }
  };

  useEffect(() => {
    if (!currentUser || activeTab !== 'Agenda') return undefined;
    const onKeyDown = (e) => {
      if (e.target.closest('input, textarea, select, [contenteditable="true"]')) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const key = e.key;
      if (key === 'h' || key === 'H') {
        e.preventDefault();
        setCurrentDate(new Date());
      } else if (key === 'd' || key === 'D') {
        e.preventDefault();
        setZoomManual(false);
        setViewMode('Día');
      } else if (key === 's' || key === 'S') {
        e.preventDefault();
        setZoomManual(false);
        setViewMode('Semana');
      } else if (key === '+' || key === '=') {
        e.preventDefault();
        openNewAppointment();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [currentUser, activeTab, dbServices, currentFullDate, currentDayInfo]);

  const appointmentTimeOptions = useMemo(() => {
    const srv = getServiceForSlot(selectedSlot);
    const { duration, buffer } = resolveSessionTimes(selectedSlot || {});
    return buildStaffAppointmentTimeOptions({
      service: srv,
      companyConfig: dbCompanyConfig,
      duration,
      buffer,
      outsideNormalHours: !!selectedSlot?.outside_normal_hours,
    });
  }, [
    selectedSlot?.serviceId,
    selectedSlot?.equipment,
    selectedSlot?.outside_normal_hours,
    selectedSlot?.extended_session,
    selectedSlot?.duration,
    selectedSlot?.buffer,
    dbServices,
    dbCompanyConfig,
  ]);

  const selectedBlockMins = useMemo(() => {
    const { duration, buffer } = resolveSessionTimes(selectedSlot || {});
    return duration + buffer;
  }, [selectedSlot]);

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
    if (status === 'Falta Justificada') { badgeClass = 'bg-orange-200 text-orange-900'; icon = '📋'; }
    if (status === 'Devuelto') { badgeClass = 'bg-purple-200 text-purple-900'; icon = '↩️'; }
    return (
      <span title={status} className={`text-[8px] font-black px-1 rounded shadow-sm flex items-center gap-0.5 ${badgeClass}`}>
        {icon} {!isCompact && <span>{translateCheckInStatus(locale, status)}</span>}
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
    if (!window.confirm(a('cancelSaleConfirm', patientName, tx.price, tx.sessions, tx.serviceName))) {
      return;
    }

    try {
      const p = dbPatients.find(x => String(x.id) === String(patientId));
      if (!p) return alert(a('patientNotFound'));

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
      alert(a('saleCancelled'));
      fetchAllData();
    } catch (e) {
      alert(a('saleCancelError'));
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
  
  const closeAppointmentPanel = () => {
    setSelectedSlot(null);
    setIsRescheduling(false);
  };

  const startReschedule = () => {
    if (!selectedSlot?.id) return;
    if (['Finalizado', 'Devuelto', 'No Asistió', 'Falta Justificada'].includes(selectedSlot.check_in_status)) return;
    setIsRescheduling(true);
    const targetDate = selectedSlot.full_date || selectedSlot.fullDate;
    if (targetDate) {
      setCurrentDate(new Date(targetDate + 'T12:00:00'));
      setViewMode('Día');
    }
  };

  const canRescheduleAppointment = selectedSlot?.id && !['Finalizado', 'Devuelto', 'No Asistió', 'Falta Justificada'].includes(selectedSlot.check_in_status);

  const tryRequestMove = (app, newTime, newEquipment, newDay, newFullDate) => {
    if (
      app.full_date === newFullDate &&
      app.time === newTime &&
      app.equipment === newEquipment
    ) {
      alert(a('alreadyAtTime'));
      return false;
    }

    if (isPastTime(newFullDate, newTime)) {
      alert(a('pastMove'));
      return false;
    }

    const pInfo = dbPatients.find(x => normalizeStr(x.patient) === normalizeStr(app.patient));
    if (pInfo && pInfo.is_blocked) {
      alert(a('patientBlockedMove'));
      return false;
    }

    const srv = dbServices.find(s => s.name === newEquipment);
    const times = resolveSessionTimes(app);
    const dur = times.duration;
    const buf = times.buffer;

    if (checkOverlap(newEquipment, newFullDate, newTime, dur, buf, app.id)) {
      alert(a('overlapLong'));
      return false;
    }

    setMoveConfirmation({ app, newTime, newEquipment, newDay, newFullDate });
    return true;
  };

  const handleDrop = (e, newTime, newEquipment, newDay, newFullDate) => {
    e.preventDefault();
    if (!draggedApp) return;
    tryRequestMove(draggedApp, newTime, newEquipment, newDay, newFullDate);
    setDraggedApp(null);
  };

  const handleRescheduleSubmit = () => {
    if (!selectedSlot?.id) return;

    const targetDate = selectedSlot.fullDate || selectedSlot.full_date;
    const targetTime = selectedSlot.time;
    const targetEquipment = selectedSlot.equipment;

    if (!targetDate || !targetTime || !targetEquipment) {
      alert(a('completeDateTimeService'));
      return;
    }

    const d = new Date(targetDate + 'T12:00:00');
    const dayName = getDayNameFromDate(locale, d);

    if (tryRequestMove(selectedSlot, targetTime, targetEquipment, dayName, targetDate)) {
      setIsRescheduling(false);
    }
  };

  const confirmMove = async () => {
    try {
      const times = resolveSessionTimes(moveConfirmation.app);
      const { error } = await updateStaffAppointment(activeSupabase, moveConfirmation.app.id, { 
        time: moveConfirmation.newTime, 
        appointment_time: moveConfirmation.newTime,
        equipment: moveConfirmation.newEquipment, 
        day: moveConfirmation.newDay,
        full_date: moveConfirmation.newFullDate,
        appointment_date: moveConfirmation.newFullDate,
        duration: times.duration,
        buffer: times.buffer,
        outside_normal_hours: !!moveConfirmation.app.outside_normal_hours,
        is_extended_block: isExtendedSession(moveConfirmation.app),
      });
      
      if (error) alert(a('moveError', error.message));
      else {
        await logAudit(moveConfirmation.app.id, moveConfirmation.app.patient, 'REUBICACIÓN', `De ${moveConfirmation.app.full_date} ${moveConfirmation.app.time} (${moveConfirmation.app.equipment}) a ${moveConfirmation.newFullDate} ${moveConfirmation.newTime} (${moveConfirmation.newEquipment})`);
        await notifyPatientFromSlot({
          ...moveConfirmation.app,
          full_date: moveConfirmation.newFullDate,
          fullDate: moveConfirmation.newFullDate,
          time: moveConfirmation.newTime,
          equipment: moveConfirmation.newEquipment,
        }, { notifyReason: 'reschedule' });
      }
      
      setMoveConfirmation(null);
      closeAppointmentPanel();
      fetchAllData();
    } catch (e) {
      alert(a('connectionErrorMsg', e.message));
    }
  };

  const updateAppStatus = async (id, status, patientName, equipment) => {
    try {
      const app = dbAppointments.find(a => a.id === id);
      if (!app) return alert(a('apptNotFound'));

      if (status === 'No Asistió') {
        if (app.check_in_status === 'No Asistió') return alert(a('alreadyNoShow'));
        if (!window.confirm(a('noShowConfirm'))) return;

        const p = dbPatients.find(x => normalizeStr(x.patient) === normalizeStr(patientName));
        if (p) {
          const eq = equipment || app.equipment;
          const currentWallets = { ...(p.wallets || {}) };
          let deducted = false;

          if (currentWallets[eq] && currentWallets[eq] > 0) {
            currentWallets[eq] -= 1;
            deducted = true;
          } else {
            const fallbackEq = Object.keys(currentWallets).find(key =>
              (key.toLowerCase().includes('cámara') || key.toLowerCase().includes('camara')) && currentWallets[key] > 0
            );
            if (fallbackEq) {
              currentWallets[fallbackEq] -= 1;
              deducted = true;
            }
          }

          await activeSupabase.from('patients').update({
            wallets: currentWallets,
            historico_sesiones: (p.historicoSesiones || 0) + 1
          }).eq('id', p.id);

          await logAudit(id, patientName, 'NO ASISTIÓ', deducted
            ? `No asistió. Se descontó 1 sesión pagada de cartera (${eq}).`
            : `No asistió. Sin sesiones pagadas en cartera para descontar.`);
        }

        await activeSupabase.from('appointments').update({ check_in_status: 'No Asistió' }).eq('id', id);
      } else if (status === 'Falta Justificada') {
        if (app.check_in_status === 'Falta Justificada') return alert(a('alreadyExcused'));
        await activeSupabase.from('appointments').update({ check_in_status: 'Falta Justificada' }).eq('id', id);
        await logAudit(id, patientName, 'FALTA JUSTIFICADA', 'Paciente no atendió (justificado). La sesión pagada se conserva en cartera.');
      } else {
        await activeSupabase.from('appointments').update({ check_in_status: status }).eq('id', id);
        await logAudit(id, patientName, 'CAMBIO DE ESTATUS', `Estatus actualizado a: ${status}`);
      }

      setSelectedSlot(null);
      fetchAllData();
    } catch(e) { alert(a('statusUpdateError')); }
  };

  const handleRefund = async (app) => {
    if (window.confirm(a('refundConfirm'))) {
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

  const deductPatientSession = async (patientName, equipment, appId) => {
    const p = dbPatients.find(x => normalizeStr(x.patient) === normalizeStr(patientName));
    if (!p) return { deducted: false, detail: 'Paciente no encontrado en expediente.' };

    const eq = equipment;
    const currentWallets = { ...(p.wallets || {}) };
    let deducted = false;

    if (currentWallets[eq] && currentWallets[eq] > 0) {
      currentWallets[eq] -= 1;
      deducted = true;
    } else {
      const fallbackEq = Object.keys(currentWallets).find(key =>
        (key.toLowerCase().includes('cámara') || key.toLowerCase().includes('camara')) && currentWallets[key] > 0
      );
      if (fallbackEq) {
        currentWallets[fallbackEq] -= 1;
        deducted = true;
      }
    }

    await activeSupabase.from('patients').update({
      wallets: currentWallets,
      historico_sesiones: (p.historicoSesiones || 0) + (deducted ? 1 : 0),
    }).eq('id', p.id);

    return {
      deducted,
      detail: deducted
        ? `Se descontó 1 sesión pagada de cartera (${eq}).`
        : 'Sin sesiones pagadas en cartera para descontar.',
    };
  };

  const handleCancelAppointment = async () => {
    if (!selectedSlot?.id || !activeSupabase) return;
    try {
      const app = selectedSlot;
      const patientName = app.patient;
      let auditDetail = `Cancelada por ${currentUser?.name || 'staff'}. Descuento de sesión: ${cancelDeductSession ? 'Sí' : 'No'}.`;

      if (cancelDeductSession) {
        const result = await deductPatientSession(patientName, app.equipment, app.id);
        auditDetail += ` ${result.detail}`;
      }

      const cancelNote = `[CANCELADA ${new Date().toLocaleString()}] ${auditDetail}`;
      const newNotes = app.notes ? `${app.notes}\n${cancelNote}` : cancelNote;

      await activeSupabase.from('appointments').update({
        check_in_status: 'Cancelado',
        notes: newNotes,
      }).eq('id', app.id);

      await logAudit(app.id, patientName, 'CITA CANCELADA', auditDetail);
      await notifyPatientFromSlot(app, { notifyReason: 'cancel' });
      setShowCancelModal(false);
      setCancelDeductSession(false);
      closeAppointmentPanel();
      fetchAllData();
    } catch (e) {
      alert(a('connectionErrorMsg', e.message));
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
    if(apps.length === 0) return alert(a('noFinishedAppts'));

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
            <h1 style="margin: 0; font-size: 24px; text-transform: uppercase;">${formatClinicField(dbCompanyConfig.name) || 'OXYHYPERBARIC'}</h1>
            <p style="margin: 0; font-size: 12px; text-transform: uppercase;">${formatClinicField(dbCompanyConfig.address)} | Tel: ${formatClinicPhone(dbCompanyConfig.phone)}</p>
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
    const srv = dbServices.find(s => s.name === equipment) || { duration: 60, buffer: 30, id: null };
    const duration = Number(srv.duration) || 60;
    const buffer = Number(srv.buffer ?? 30);
    const blockMins = duration + buffer;
    const { startMins: svcStart, endMins: svcEnd } = getServiceScheduleBounds(srv, dbCompanyConfig);

    const slotTimes = buildAvailabilitySlotTimes({
      service: srv,
      companyConfig: dbCompanyConfig,
      duration,
      buffer,
      stepByBlock: true,
    });

    const offHourBands = [];
    for (let m = startMins; m < endMins; m += intervalMins) {
      if (m < svcStart || m >= svcEnd) {
        offHourBands.push(m);
      }
    }

    return (
      <>
        {offHourBands.map((m) => {
          const h = Math.floor(m / 60);
          const mins = m % 60;
          const ampm = h >= 12 ? 'PM' : 'AM';
          const displayH = h > 12 ? h - 12 : h === 0 ? 12 : h;
          const timeStr = `${displayH.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')} ${ampm}`;
          return (
            <div
              key={`off-${timeStr}`}
              onClick={() => {
                if (isPastTime(fullDate, timeStr)) {
                  alert(a('pastScheduleAppt'));
                  return;
                }
                openNewAppointment({
                  time: timeStr,
                  equipment,
                  day,
                  fullDate,
                  serviceId: srv.id,
                  duration,
                  buffer,
                  sessionPreset: getPresetFromTimes(duration, buffer).id,
                  outside_normal_hours: true,
                });
              }}
              className="absolute left-0 right-0 bg-slate-200/60 hover:bg-amber-100/80 active:bg-amber-200/90 cursor-pointer border-b border-slate-300 box-border z-0 transition-all hover:ring-2 hover:ring-inset hover:ring-amber-400/50"
              style={{ top: `${timeToPixels(timeStr)}px`, height: `${intervalMins * PIXELS_PER_MINUTE}px` }}
              title={`${L.clickToBook} · ${L.p.legendOutsideHours}`}
            />
          );
        })}
        {slotTimes.map((time) => (
          <div
            key={time}
            onClick={() => {
              if (isPastTime(fullDate, time)) {
                alert(a('pastScheduleAppt'));
                return;
              }
              if (isRescheduling && selectedSlot?.id) {
                setSelectedSlot({
                  ...selectedSlot,
                  time,
                  equipment,
                  day,
                  fullDate,
                  full_date: fullDate,
                  serviceId: srv.id,
                  duration,
                  buffer,
                  sessionPreset: getPresetFromTimes(duration, buffer).id,
                });
                setCurrentDate(new Date(fullDate + 'T12:00:00'));
                setViewMode('Día');
                return;
              }
              openNewAppointment({
                time,
                equipment,
                day,
                fullDate,
                duration,
                buffer,
                sessionPreset: getPresetFromTimes(duration, buffer).id,
                serviceId: srv.id,
              });
            }}
            onDragOver={handleDragOver}
            onDrop={(e) => handleDrop(e, time, equipment, day, fullDate)}
            className="absolute left-0 right-0 border-b border-slate-300 hover:bg-emerald-50/90 active:bg-emerald-100/90 hover:shadow-[inset_0_0_0_2px_rgba(16,185,129,0.45)] cursor-pointer transition-all box-border z-0"
            style={{ top: `${timeToPixels(time)}px`, height: `${blockMins * PIXELS_PER_MINUTE}px` }}
            title={L.clickToBook}
          />
        ))}
      </>
    );
  };

  const isNewPatientInline = selectedSlot?.patient && selectedSlot.patient.length > 0 && !dbPatients.find(x => normalizeStr(x.patient) === normalizeStr(selectedSlot.patient));

  const selectTab = (tab) => {
    setActiveTab(tab);
    setMobileMoreOpen(false);
  };

  const copyPromoterLink = async (code) => {
    const url = buildPromoterBookingUrl(activeClinic, code, typeof window !== 'undefined' ? window.location.origin : '');
    try {
      await navigator.clipboard.writeText(url);
      alert(L.p.admin.promoterCopied);
    } catch {
      window.prompt(L.p.admin.promoterCopy, url);
    }
  };

  const savePromoter = async () => {
    const code = normalizePromoCode(newPromoter.code);
    const name = String(newPromoter.name || '').trim();
    if (code.length < 2) return alert(L.p.admin.promoterCodeRequired);
    if (!name) return alert(L.p.admin.promoterNameRequired);
    if (promotersLoadError) return alert(L.p.admin.promoterTableMissing);

    const duplicate = dbPromoters.some(
      (p) => normalizePromoCode(p.code) === code && p.id !== newPromoter.id,
    );
    if (duplicate) return alert(L.p.admin.promoterDuplicate);

    const payload = { code, name, is_active: newPromoter.is_active !== false };
    let res;
    if (isEditingPromoter && newPromoter.id) {
      res = await activeSupabase.from('promoters').update(payload).eq('id', newPromoter.id);
    } else {
      res = await activeSupabase.from('promoters').insert([payload]);
    }
    if (res.error) return alert(`${L.p.admin.promoterSaveError}: ${res.error.message}`);

    await logAudit(
      null,
      name,
      isEditingPromoter ? 'PROMOTOR ACTUALIZADO' : 'ALTA PROMOTOR',
      `Código ${code} · ${activeClinic}`,
    );
    setIsEditingPromoter(false);
    setNewPromoter({ id: null, code: '', name: '', is_active: true });
    fetchAllData();
  };

  const mobilePrimaryTabs = [
    { id: 'Agenda', icon: '📅', label: L.tabs.Agenda },
    { id: 'Pacientes', icon: '👥', label: L.tabs.Pacientes },
    { id: 'GFE', icon: '🩺', label: L.tabs.GFE },
  ];

  const mobileAdminTabs = currentUserLevel <= 2
    ? [
        { id: 'Servicios', icon: '⚙️', label: L.mobileTabs.Servicios },
        { id: 'Reportes', icon: '📊', label: L.mobileTabs.Reportes },
        { id: 'Admin', icon: '🔒', label: L.mobileTabs.Admin },
      ]
    : [];

  const mobileMoreActive = mobileAdminTabs.some(t => t.id === activeTab);

  return (
    <StaffLocaleProvider clinic={activeClinic}>
    <div className="flex h-screen bg-slate-50 font-sans text-slate-900 overflow-hidden relative">

      {wrongHostWarning && (
        <div className="fixed top-0 inset-x-0 z-[100000] bg-amber-500 text-amber-950 px-3 py-2 text-center text-[10px] sm:text-xs font-black uppercase shadow-lg">
          Esta URL no es producción — abre{' '}
          <a href={`https://${canonicalHost}`} className="underline underline-offset-2">
            {canonicalHost}
          </a>
          {' '}(versión {buildSha})
        </div>
      )}
      
      {/* CAPA DE BLOQUEO: INICIAR TURNO Y LLAVE MAESTRA */}
      {!currentUser && (
        <div className="fixed inset-0 bg-slate-900/95 backdrop-blur-md flex items-center justify-center z-[99999]">
           <div className="bg-white p-6 sm:p-10 rounded-3xl shadow-2xl w-full max-w-sm text-center border mx-4">
             <img src="/1c3300f3-f5e7-4682-b627-257e868ed467.jpg" className="h-20 mx-auto mb-6 rounded-xl shadow-sm" alt="Logo"/>
             <h2 className="text-2xl font-black uppercase mb-2 text-slate-800">{L.loginTitle}</h2>
             <p className="text-xs font-bold text-slate-500 mb-8 uppercase">{L.loginHint}</p>
             <input 
                type="password" 
                maxLength="10" 
                value={loginPin} 
                onChange={e => setLoginPin(e.target.value)} 
                onKeyDown={e => {
                 if (e.key === 'Enter') handleLoginSubmit();
               }}
               disabled={isLoggingIn}
               className="w-full text-center text-3xl tracking-[0.2em] font-black p-4 border-2 border-slate-200 rounded-xl outline-none focus:border-blue-500 mb-6 bg-slate-50 text-slate-900 disabled:opacity-60" 
             />
             <button onClick={handleLoginSubmit} disabled={isLoggingIn || !loginPin.trim()} className="w-full bg-blue-600 text-white font-black py-4 rounded-xl uppercase text-sm shadow-md hover:bg-blue-700 transition disabled:opacity-60 disabled:cursor-not-allowed">
                {isLoggingIn ? L.loginVerifying : L.loginEnter}
             </button>
             <div className="mt-5 pt-4 border-t border-slate-100">
               <InstallGuideLink className="text-[11px] font-bold text-blue-600 hover:text-blue-800 underline underline-offset-2 transition w-full text-center block leading-relaxed" />
             </div>
           </div>
        </div>
      )}

      {/* SIDEBAR — solo escritorio / tablet horizontal */}
      <aside className="hidden lg:flex w-52 xl:w-60 bg-slate-900 text-slate-300 flex-col shadow-2xl z-30 shrink-0">
        <div className="p-3 xl:p-4 border-b border-slate-800 bg-slate-950 flex flex-col items-center">
          <img src="/1c3300f3-f5e7-4682-b627-257e868ed467.jpg" alt="Logo" className="h-11 xl:h-14 w-auto object-contain mb-1.5 xl:mb-2 bg-white rounded p-1" />
          <h1 className="text-sm xl:text-base font-black text-white uppercase tracking-widest text-center">OxyHyperbaric</h1>
        </div>
        
        {currentUser && (
           <div className="px-3 py-2 bg-slate-800 text-[10px] font-black uppercase text-slate-400 flex flex-col gap-0.5 border-b border-slate-700">
             <div className="flex justify-between items-center w-full">
               <span className="truncate mr-2 text-white">👤 {currentUser.name}</span>
               <button onClick={handleLogout} className="text-red-400 hover:text-red-300 shrink-0">{L.logout}</button>
             </div>
             <span className="text-[8px] text-emerald-400">{L.accessLevel}: {currentUserLevel}</span>
             {allowedClinics.length > 1 && (
               <span className="text-[8px] text-blue-300">{L.clinics}: {allowedClinics.map(c => c === 'Guadalajara' ? 'GDL' : 'TX').join(' · ')}</span>
             )}
           </div>
        )}

        {currentUser && allowedClinics.length > 1 && (
        <div className="p-3 bg-slate-900 border-b border-slate-800">
          <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1.5 px-1">{L.activeLocation}</p>
          <div className="bg-slate-950 p-1 rounded-xl flex border border-slate-800">
            {allowedClinics.includes('Shenandoah') && (
              <button onClick={() => switchClinic('Shenandoah')} className={`flex-1 py-2 text-[10px] font-black uppercase rounded-lg transition-all ${activeClinic === 'Shenandoah' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-500 hover:text-slate-300'}`}>🇺🇸 TX</button>
            )}
            {allowedClinics.includes('Guadalajara') && (
              <button onClick={() => switchClinic('Guadalajara')} className={`flex-1 py-2 text-[10px] font-black uppercase rounded-lg transition-all ${activeClinic === 'Guadalajara' ? 'bg-emerald-600 text-white shadow-md' : 'text-slate-500 hover:text-slate-300'}`}>🇲🇽 GDL</button>
            )}
          </div>
        </div>
        )}

        {currentUser && allowedClinics.length === 1 && (
        <div className="p-3 bg-slate-900 border-b border-slate-800">
          <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1.5 px-1">{L.location}</p>
          <div className="bg-slate-950 py-2 px-3 rounded-xl border border-slate-800 text-center text-[10px] font-black uppercase text-white">
            {allowedClinics[0] === 'Guadalajara' ? L.clinicGdl : L.clinicTx}
          </div>
        </div>
        )}

        <div className="p-3">
          <button onClick={() => openNewAppointment()} className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-black py-3 rounded-xl flex items-center justify-center gap-2 shadow-lg transition uppercase text-xs">
            <span className="text-xl leading-none">+</span> {L.newAppointment}
          </button>
        </div>

        {activeTab === 'Agenda' && currentUser && (
          <div className="px-3 pb-2">
            <div className="bg-slate-800/80 border border-slate-700 rounded-lg px-2.5 py-2 text-[9px] font-bold text-slate-300 leading-relaxed">
              <span className="block text-emerald-400 font-black uppercase text-[8px] mb-1">{activeClinicShort} · {L.agendaSummaryToday}</span>
              <span>{agendaSummary.today} {L.agendaSummaryAppts}</span>
              {agendaSummary.view !== agendaSummary.today && (
                <span className="text-slate-400"> · {L.agendaSummaryView}: {agendaSummary.view}</span>
              )}
              {(agendaSummary.extended > 0 || agendaSummary.outside > 0) && (
                <span className="block text-slate-400 mt-0.5">
                  {agendaSummary.extended > 0 && `${agendaSummary.extended} ${L.agendaSummaryExtended}`}
                  {agendaSummary.extended > 0 && agendaSummary.outside > 0 && ' · '}
                  {agendaSummary.outside > 0 && `${agendaSummary.outside} ${L.agendaSummaryOutside}`}
                </span>
              )}
            </div>
          </div>
        )}
        
        <nav className="flex-1 overflow-y-auto py-1 px-2 space-y-0.5">
          <div className="text-[10px] font-black text-slate-600 uppercase tracking-widest mb-1 px-2 mt-1">{L.operation}</div>
          <button onClick={() => selectTab('Agenda')} className={`w-full flex items-center gap-2 px-2.5 py-2 rounded-lg font-bold transition text-sm ${activeTab === 'Agenda' ? 'bg-blue-600/20 text-blue-400' : 'hover:bg-slate-800'}`}>📅 {L.tabs.Agenda}</button>
          <button onClick={() => selectTab('Pacientes')} className={`w-full flex items-center gap-2 px-2.5 py-2 rounded-lg font-bold transition text-sm ${activeTab === 'Pacientes' ? 'bg-blue-600/20 text-blue-400' : 'hover:bg-slate-800'}`}>👥 {L.tabs.Pacientes}</button>
          <button onClick={() => selectTab('GFE')} className={`w-full flex items-center gap-2 px-2.5 py-2 rounded-lg font-bold transition text-sm ${activeTab === 'GFE' ? 'bg-blue-600/20 text-blue-400' : 'hover:bg-slate-800'}`}>🩺 {L.tabs.GFE}</button>
          
          {currentUserLevel <= 2 && (
            <>
              <div className="text-[10px] font-black text-slate-600 uppercase tracking-widest mb-1 px-2 mt-4">{L.administration}</div>
              <button onClick={() => selectTab('Servicios')} className={`w-full flex items-center gap-2 px-2.5 py-2 rounded-lg font-bold transition text-sm ${activeTab === 'Servicios' ? 'bg-blue-600/20 text-blue-400' : 'hover:bg-slate-800'}`}>⚙️ {L.tabs.Servicios}</button>
              <button onClick={() => selectTab('Reportes')} className={`w-full flex items-center gap-2 px-2.5 py-2 rounded-lg font-bold transition text-sm ${activeTab === 'Reportes' ? 'bg-blue-600/20 text-blue-400' : 'hover:bg-slate-800'}`}>📊 {L.tabs.Reportes}</button>
              <button onClick={() => selectTab('Admin')} className={`w-full flex items-center gap-2 px-2.5 py-2 rounded-lg font-bold transition text-sm ${activeTab === 'Admin' ? 'bg-blue-600/20 text-blue-400' : 'hover:bg-slate-800'}`}>🔒 {L.tabs.Admin}</button>
            </>
          )}
        </nav>
      </aside>

      {/* CONTENIDO PRINCIPAL */}
      <main className="flex-1 flex flex-col h-screen overflow-hidden relative min-w-0 pb-[calc(3.5rem+env(safe-area-inset-bottom))] lg:pb-0">

        {/* Barra superior móvil — compacta */}
        {currentUser && (
          <div className="lg:hidden shrink-0 bg-slate-950 text-white px-2 py-2 flex items-center gap-2 border-b border-slate-800 z-20">
            <img src="/1c3300f3-f5e7-4682-b627-257e868ed467.jpg" alt="Logo" className="h-8 w-8 object-contain bg-white rounded p-0.5 shrink-0" />
            {allowedClinics.length > 1 ? (
              <div className="flex bg-slate-900 p-0.5 rounded-lg border border-slate-700 shrink-0">
                {allowedClinics.includes('Shenandoah') && (
                  <button onClick={() => switchClinic('Shenandoah')} className={`px-2 py-1 text-[9px] font-black rounded-md ${activeClinic === 'Shenandoah' ? 'bg-blue-600 text-white' : 'text-slate-400'}`}>🇺🇸</button>
                )}
                {allowedClinics.includes('Guadalajara') && (
                  <button onClick={() => switchClinic('Guadalajara')} className={`px-2 py-1 text-[9px] font-black rounded-md ${activeClinic === 'Guadalajara' ? 'bg-emerald-600 text-white' : 'text-slate-400'}`}>🇲🇽</button>
                )}
              </div>
            ) : (
              <span className="text-[9px] font-black uppercase text-slate-300 shrink-0">{allowedClinics[0] === 'Guadalajara' ? '🇲🇽 GDL' : '🇺🇸 TX'}</span>
            )}
            <span className="flex-1 truncate text-[10px] font-bold text-slate-200 min-w-0">{currentUser.name}</span>
            <button onClick={() => openNewAppointment()} className="shrink-0 h-8 w-8 bg-emerald-600 rounded-lg text-white font-black text-lg leading-none shadow" aria-label={L.ariaNewAppt}>+</button>
            <button onClick={handleLogout} className="shrink-0 text-[9px] font-black text-red-400 uppercase px-1">{L.logout}</button>
          </div>
        )}
        
        {/* VISTA AGENDA */}
        {activeTab === 'Agenda' && (
          <div className="flex flex-col h-full relative z-10">
            <header className="bg-white p-2 lg:p-3 border-b border-slate-200 flex flex-col gap-2 shrink-0 shadow-sm z-20">
              <div className="flex flex-col xl:flex-row items-stretch xl:items-center justify-between gap-2 lg:gap-3">
              <div className="flex items-center gap-2 lg:gap-3 min-w-0 flex-wrap">
                <span className={`shrink-0 text-[9px] font-black uppercase px-2 py-0.5 rounded-md border ${activeClinic === 'Guadalajara' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-blue-50 text-blue-700 border-blue-200'}`} title={activeClinicLabel}>
                  {activeClinicShort}
                </span>
                <div className="flex bg-slate-100 p-0.5 lg:p-1 rounded-lg lg:rounded-xl border border-slate-200 shrink-0">
                  <button onClick={() => navigateDate(-1)} className="p-1.5 lg:p-2 hover:bg-white rounded-lg transition text-slate-600 text-sm">◀</button>
                  <div className="px-2 lg:px-4 flex flex-col items-center justify-center min-w-0">
                    <span className="text-[8px] lg:text-[10px] font-black text-blue-600 uppercase leading-none">{viewMode === 'Día' ? L.viewDay : L.viewWeek}</span>
                    <span className="text-[10px] lg:text-xs font-bold text-slate-800 truncate max-w-[7rem] sm:max-w-none">{viewMode === 'Día' ? currentDayInfo.date : `${weekDays[0].date} - ${weekDays[6].date}`}</span>
                  </div>
                  <button onClick={() => navigateDate(1)} className="p-1.5 lg:p-2 hover:bg-white rounded-lg transition text-slate-600 text-sm">▶</button>
                </div>
                <button onClick={() => setCurrentDate(new Date())} className="text-[9px] lg:text-[10px] font-black uppercase text-slate-400 hover:text-blue-600 transition border px-2 py-1 rounded shrink-0">{L.today}</button>
                <div className="lg:hidden flex-1 min-w-0 text-[9px] font-bold text-slate-500 truncate">
                  {L.agendaSummaryToday}: {agendaSummary.today} · {L.agendaSummaryView}: {agendaSummary.view}
                </div>
              </div>

              <div className="flex items-center gap-1.5 lg:gap-3 bg-slate-50 p-1 lg:p-1.5 rounded-lg lg:rounded-xl border border-slate-200 flex-wrap">
                {currentUserLevel <= 2 && (
                  <button onClick={() => setShowOOOModal(true)} className="bg-red-100 text-red-700 border-2 border-red-300 px-2.5 sm:px-3 py-1.5 text-[9px] sm:text-[10px] font-black rounded-lg hover:bg-red-200 transition uppercase shadow-sm shrink-0 flex items-center gap-1" title={L.blockSlot}>
                    <span>🚫</span>
                    <span className="sm:inline">{L.blockSlot}</span>
                  </button>
                )}
                <div className="flex items-center gap-1 lg:gap-2 px-1 lg:px-2 border-l border-slate-200">
                  <span className="text-[8px] lg:text-[9px] font-black text-slate-400 uppercase hidden sm:inline">{L.zoom}</span>
                  <input type="range" min="20" max="300" value={zoomScale} onChange={(e) => { setZoomScale(Number(e.target.value)); setZoomManual(true); }} className="w-14 sm:w-20 lg:w-24 h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer" />
                </div>
                <select value={equipmentFilter} onChange={e => { setEquipmentFilter(e.target.value); setZoomManual(false); }} className="bg-white border border-slate-300 text-slate-700 font-bold text-[10px] lg:text-xs rounded-md px-1.5 lg:px-2 py-1 outline-none uppercase max-w-[5.5rem] sm:max-w-none truncate">
                  <option value="Todos">{L.allEquipment}</option>
                  {dynamicColumns.map(e => <option key={e} value={e}>{e}</option>)}
                </select>
                <div className="flex items-center bg-slate-200/50 p-0.5 lg:p-1 rounded-lg shrink-0">
                  <button onClick={() => { setZoomManual(false); setViewMode('Día'); }} className={`px-2 lg:px-3 py-0.5 lg:py-1 rounded font-black text-[9px] lg:text-[10px] uppercase transition ${viewMode === 'Día' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-500'}`}>{L.viewDay}</button>
                  <button onClick={() => { setZoomManual(false); setViewMode('Semana'); }} className={`px-2 lg:px-3 py-0.5 lg:py-1 rounded font-black text-[9px] lg:text-[10px] uppercase transition ${viewMode === 'Semana' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-500'}`}>{L.viewWeekShort}</button>
                </div>
                <button
                  type="button"
                  onClick={() => setShowCalendarLegend(v => !v)}
                  className={`px-2 py-1 rounded-lg text-[9px] font-black uppercase border shrink-0 ${showCalendarLegend ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-500 border-slate-300'}`}
                  title={L.calendarLegend}
                >
                  ?
                </button>
              </div>
              </div>

              {showCalendarLegend && (
                <div className="flex flex-wrap gap-2 px-1 pb-1 text-[9px] font-bold text-slate-600">
                  <span className="inline-flex items-center gap-1 bg-emerald-50 border border-emerald-200 px-2 py-1 rounded-lg"><span className="w-3 h-3 bg-emerald-100 border border-emerald-300 rounded" /> {L.legendAvailable}</span>
                  <span className="inline-flex items-center gap-1 bg-amber-50 border border-amber-200 px-2 py-1 rounded-lg">🟡 {L.legendOutsideHours}</span>
                  <span className="inline-flex items-center gap-1 bg-violet-50 border border-violet-200 px-2 py-1 rounded-lg">🟣 {L.legendExtended}</span>
                  <span className="inline-flex items-center gap-1 bg-slate-50 border border-slate-200 px-2 py-1 rounded-lg">⭐ {L.legendNewPatient}</span>
                  <span className="hidden lg:inline text-slate-400 self-center">{L.shortcutsHint}</span>
                </div>
              )}
            </header>

            {showWeekFilterHint && (
              <div className="mx-1.5 lg:mx-4 mt-1 lg:mt-0 shrink-0 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 flex flex-col sm:flex-row sm:items-center gap-2 text-slate-800">
                <p className="text-[10px] font-bold flex-1">{L.weekFilterHint}</p>
                <div className="flex gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => { setZoomManual(false); setEquipmentFilter(dynamicColumns[0]); setWeekFilterHintDismissed(true); }}
                    className="text-[9px] font-black uppercase bg-blue-600 text-white px-2.5 py-1.5 rounded-lg hover:bg-blue-700"
                  >
                    {L.weekFilterApply}
                  </button>
                  <button
                    type="button"
                    onClick={() => setWeekFilterHintDismissed(true)}
                    className="text-[9px] font-black uppercase text-blue-700 px-2 py-1.5"
                  >
                    {L.weekFilterDismiss}
                  </button>
                </div>
              </div>
            )}

            {/* --- CONTENEDOR DEL CALENDARIO: SCROLL UNIFICADO (CIRUGÍA CSS) --- */}
            <div className="flex-1 bg-white overflow-auto relative m-1.5 lg:m-4 rounded-lg lg:rounded-xl shadow-inner border border-slate-200 min-h-0">
              <div className="flex min-w-max">
                
                <div className="w-16 md:w-20 shrink-0 border-r border-slate-200 bg-slate-50 sticky left-0 z-50">
                  <div
                    className="border-b border-slate-200 bg-slate-100 flex items-center justify-center sticky top-0 z-[60]"
                    style={{ height: viewMode === 'Semana' ? `${WEEK_STICKY_HEADER_PX}px` : '48px' }}
                  >
                    <span className="text-[9px] font-black text-slate-400 uppercase">{L.time}</span>
                  </div>
                  <div className="relative pt-2" style={{ height: `${CALENDAR_HEIGHT + 8}px` }}>
                    {timeOptions.map((timeStr) => (
                      <div key={timeStr} className="absolute w-full text-right pr-2 border-b border-slate-300" style={{ top: `${timeToPixels(timeStr)}px`, height: `${intervalMins * PIXELS_PER_MINUTE}px` }}>
                        <span className="text-[9px] font-black text-slate-500 relative inline-block top-0 translate-y-[-50%] bg-slate-50 px-0.5">{timeStr}</span>
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
                          <div className="relative w-full pt-2" style={{ height: `${CALENDAR_HEIGHT + 8}px` }}>
                            
                            <div className="absolute inset-0 z-0">{renderBackgroundSlots(eqName, currentDayInfo.name, currentDayInfo.fullDate)}</div>
                            
                            {/* LÍNEA DE HORA ACTUAL (MULTIHUSO) */}
                            {currentDayInfo.fullDate === clinicNow.dateStr && clinicNow.mins >= calendarStartMins && clinicNow.mins <= endMins && (
                              <div className="absolute left-0 right-0 pointer-events-none flex items-center z-20" style={{ top: `${(clinicNow.mins - calendarStartMins) * PIXELS_PER_MINUTE}px`, marginTop: '-1px' }}>
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
                              <CalendarAppointmentBlock
                                key={app.id}
                                app={app}
                                colWidth={currentColWidth * 2}
                                locale={locale}
                                L={L}
                                isSelected={selectedSlot?.id === app.id}
                                colorClasses={getEquipmentColors(srvColor)}
                                topPx={timeToPixels(app.time)}
                                calculateEndTime={calculateEndTime}
                                onSelect={() => openAppointmentDetails(app)}
                                draggable={selectedSlot?.id !== app.id || !isRescheduling}
                                onDragStart={(e) => handleDragStart(e, app)}
                              />
                            ))}
                          </div>
                        </div>
                      )})}
                    </div>
                  ) : (
                    <div className="flex min-w-full">
                      {weekDays.map((dayInfo) => (
                        <div key={dayInfo.fullDate} className="flex-1 shrink-0 border-r-2 border-slate-300" style={{ minWidth: `${displayedEquipments.length * currentColWidth}px` }}>
                          <div className="sticky top-0 z-40 bg-slate-50 border-b border-slate-200">
                            <div className="h-8 flex flex-col items-center justify-center">
                              <span className="text-[9px] font-black text-slate-800 uppercase leading-none">{dayInfo.name}</span>
                              <span className="text-[10px] font-bold text-blue-600 leading-none">{dayInfo.date}</span>
                            </div>
                            <div className="flex border-t border-slate-200 h-7">
                              {displayedEquipments.map((eqName) => {
                                const srvColor = dbServices.find(s => s.name === eqName)?.color || 'blue';
                                return (
                                  <div
                                    key={`${dayInfo.fullDate}-hdr-${eqName}`}
                                    className={`flex-1 flex items-center justify-center border-r border-slate-300/80 last:border-r-0 ${getEquipmentHeaderColor(srvColor)}`}
                                    style={{ minWidth: `${currentColWidth}px` }}
                                    title={eqName}
                                  >
                                    <span className="text-[7px] sm:text-[8px] font-black uppercase truncate px-0.5 text-center w-full leading-none">
                                      {currentColWidth >= 104 ? eqName : getEquipmentShortLabel(eqName)}
                                    </span>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                          <div className="flex w-full relative pt-2" style={{ height: `${CALENDAR_HEIGHT + 8}px` }}>
                            {displayedEquipments.map(eqName => {
                              const srvColor = dbServices.find(s => s.name === eqName)?.color || 'blue';
                              return (
                              <div key={`${dayInfo.fullDate}-${eqName}`} className={`flex-1 relative border-r border-slate-300 ${getEquipmentBgColor(srvColor)}`} style={{ minWidth: `${currentColWidth}px` }}>
                                
                                <div className="absolute inset-0 z-0">{renderBackgroundSlots(eqName, dayInfo.name, dayInfo.fullDate)}</div>
                                
                                {/* LÍNEA DE HORA ACTUAL (MULTIHUSO) */}
                                {dayInfo.fullDate === clinicNow.dateStr && clinicNow.mins >= calendarStartMins && clinicNow.mins <= endMins && (
                                  <div className="absolute left-0 right-0 pointer-events-none flex items-center z-20" style={{ top: `${(clinicNow.mins - calendarStartMins) * PIXELS_PER_MINUTE}px`, marginTop: '-1px' }}>
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
                                  <CalendarAppointmentBlock
                                    key={app.id}
                                    app={app}
                                    colWidth={currentColWidth}
                                    locale={locale}
                                    L={L}
                                    isSelected={selectedSlot?.id === app.id}
                                    colorClasses={getEquipmentColors(srvColor)}
                                    topPx={timeToPixels(app.time)}
                                    paddingClass="left-0.5 right-0.5"
                                    roundedClass="rounded-md"
                                    calculateEndTime={calculateEndTime}
                                    onSelect={() => openAppointmentDetails(app)}
                                    draggable={selectedSlot?.id !== app.id || !isRescheduling}
                                    onDragStart={(e) => handleDragStart(e, app)}
                                  />
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
          <div className="flex-1 p-3 lg:p-6 bg-white overflow-auto flex flex-col relative z-10 min-h-0">
            <div className="flex flex-col md:flex-row md:items-end justify-between border-b pb-4 mb-6 gap-4">
              <div className="flex items-center gap-4">
                <h2 className="text-2xl font-black text-slate-800 uppercase tracking-tight">{L.directory}: {activeClinic}</h2>
                <button onClick={() => setShowNewPatientModal(true)} className="bg-emerald-100 text-emerald-800 border border-emerald-300 px-4 py-2 rounded-lg text-xs font-black uppercase shadow-sm hover:bg-emerald-200 transition">+ {L.newPatient}</button>
              </div>
              <input type="text" placeholder={L.searchPatients} value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="w-full md:max-w-md p-3 border border-slate-300 rounded-xl shadow-sm outline-none focus:border-blue-500 font-bold bg-white text-slate-900 text-sm" />
            </div>
            
            {dbStatus === 'listo' && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                 {filteredPatients.map(p => (
                   <div key={p.id} className={`bg-slate-50 border ${p.is_blocked ? 'border-red-300 bg-red-50 opacity-80' : 'border-slate-200'} p-4 rounded-2xl hover:shadow-lg transition flex flex-col relative`}>

                      <p className="font-black text-slate-900 uppercase text-base truncate pr-6">
                        {p.is_blocked && <span title="Paciente Bloqueado" className="mr-2">🚫</span>}
                        {p.patient}
                      </p>
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest truncate">{p.phone || L.noPhone}</p>
                      <div className="flex justify-between items-center mt-2 mb-4">
                        <p className="text-[9px] font-black text-blue-600 uppercase tracking-widest bg-blue-50 px-2 py-1 rounded">{p.protocol}</p>
                        <p className="text-[9px] font-black text-slate-500 bg-slate-200 px-2 py-1 rounded">{L.sessions}: {p.historicoSesiones}</p>
                      </div>
                      <div className="mt-auto flex gap-2">
                         <button onClick={() => { 
                           setSelectedSlot(p); 
                           setShowPatientProfile(true); 
                         }} className="flex-1 bg-emerald-600 text-white text-[9px] font-black uppercase py-2 rounded hover:bg-emerald-700 transition shadow-sm">💳 {L.chart}</button>
                         <button onClick={() => { 
                           if (p.is_blocked) {
                              alert(staffAlert(locale, 'patientBlocked'));
                              return;
                           }
                           openNewAppointment({ 
                             patient: p.patient, 
                             phone: p.phone, 
                             protocol: p.protocol, 
                             email: p.email,
                             patientNotes: p.notes,
                             is_new_patient: false,
                           }); 
                         }} className="flex-1 bg-blue-600 text-white text-[9px] font-black uppercase py-2 rounded hover:bg-blue-700 transition shadow-sm">📅 {L.schedule}</button>
                      </div>
                   </div>
                 ))}
                 {filteredPatients.length === 0 && <div className="col-span-full py-20 text-center"><p className="text-slate-400 font-black uppercase text-lg">{L.noPatients}</p></div>}
              </div>
            )}
          </div>
        )}

        {/* VISTA SERVICIOS Y PROTOCOLOS (CATÁLOGO) */}
        {activeTab === 'Servicios' && currentUserLevel <= 2 && (
          <div className="flex-1 p-3 lg:p-6 bg-slate-50 overflow-auto flex flex-col h-full z-10">
            <div className="mb-6">
              <h2 className="text-2xl font-black text-slate-800 uppercase tracking-tight">{L.p.services.title}</h2>
              <p className="text-xs font-bold text-slate-500 mt-1">{L.p.services.subtitle}</p>
            </div>
            <div className="grid grid-cols-1 xl:grid-cols-5 gap-6 mb-10">
              
              <div className="xl:col-span-2 bg-white p-6 rounded-2xl border border-slate-200 h-fit shadow-sm">
                <h3 className="font-black text-slate-800 uppercase text-sm mb-4 pb-3 border-b border-slate-100">{isEditingSrv ? 'Editar equipo' : 'Nuevo equipo'}</h3>
                <div className="space-y-4">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Nombre en calendario</label>
                    <input type="text" placeholder="Ej. Cámara 1" className="w-full p-3 rounded-xl border border-slate-300 font-bold text-sm outline-none uppercase focus:border-blue-500 text-slate-900 bg-white" value={newSrv.name} onChange={e => setNewSrv({...newSrv, name: e.target.value})} />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Precio ({currencyStr})</label>
                      <input type="number" className="w-full p-3 rounded-xl border border-slate-300 font-bold text-sm outline-none text-slate-900 bg-white" value={newSrv.price} onChange={e => setNewSrv({...newSrv, price: Number(e.target.value)})} />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Color en agenda</label>
                      <div className="flex items-center gap-2">
                        <div className={`w-9 h-9 rounded-full border-2 border-white shadow-sm ${getDynamicColorClass(newSrv.color)} shrink-0`}></div>
                        <select className="flex-1 min-w-0 p-3 rounded-xl border border-slate-300 font-bold text-xs outline-none uppercase text-slate-900 bg-white" value={newSrv.color} onChange={e => setNewSrv({...newSrv, color: e.target.value})}>
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
                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-2">
                    <p className="text-[9px] font-black text-slate-500 uppercase">{L.p.appt.workHours}</p>
                    <p className="text-[8px] font-bold text-slate-500">{L.p.appt.workHoursHint}</p>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">{L.p.appt.workStart}</label>
                        <input type="time" className="w-full p-3 rounded-xl border border-slate-300 font-bold text-sm outline-none text-slate-900 bg-white" value={newSrv.start_time || ''} onChange={e => setNewSrv({...newSrv, start_time: e.target.value})} />
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">{L.p.appt.workEnd}</label>
                        <input type="time" className="w-full p-3 rounded-xl border border-slate-300 font-bold text-sm outline-none text-slate-900 bg-white" value={newSrv.end_time || ''} onChange={e => setNewSrv({...newSrv, end_time: e.target.value})} />
                      </div>
                    </div>
                  </div>
                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-2">
                    <p className="text-[9px] font-black text-slate-500 uppercase">{L.p.services.sessionDuration} / {L.p.services.bufferTime}</p>
                    <p className="text-[8px] font-bold text-slate-500">{L.p.services.totalBlockHint}</p>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">{L.p.services.sessionDuration}</label>
                        <input type="number" min="5" step="5" className="w-full p-3 rounded-xl border border-slate-300 font-bold text-sm outline-none text-slate-900 bg-white" value={newSrv.duration} onChange={e => setNewSrv({...newSrv, duration: Number(e.target.value)})} />
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">{L.p.services.bufferTime}</label>
                        <input type="number" min="0" step="5" className="w-full p-3 rounded-xl border border-slate-300 font-bold text-sm outline-none text-slate-900 bg-white" value={newSrv.buffer} onChange={e => setNewSrv({...newSrv, buffer: Number(e.target.value)})} />
                      </div>
                    </div>
                    <p className="text-[10px] font-black text-blue-700 uppercase">
                      {L.p.services.totalBlock}: {(Number(newSrv.duration) || 60) + (Number(newSrv.buffer) ?? 30)} min
                    </p>
                  </div>
                  <label className="flex items-center gap-2 bg-white p-3 rounded-xl border border-slate-200 cursor-pointer">
                    <input type="checkbox" checked={newSrv.is_active} onChange={e => setNewSrv({...newSrv, is_active: e.target.checked})} className="w-4 h-4" />
                    <span className="text-xs font-black uppercase text-slate-700">Visible en calendario</span>
                  </label>
                  <div className="flex gap-2 pt-1">
                    {isEditingSrv && <button onClick={() => {setIsEditingSrv(false); setNewSrv({ id: null, name: '', duration: 60, buffer: 30, price: 100, color: 'blue', is_active: true, equipment: 'Cámara 1', start_time: '', end_time: '' });}} className="px-4 bg-slate-100 text-slate-700 font-black py-3 rounded-xl uppercase text-xs hover:bg-slate-200">Cancelar</button>}
                    <button onClick={async () => {
                      if(!newSrv.name) return alert(L.p.services.missingName);
                      const duration = Math.max(5, Number(newSrv.duration) || 60);
                      const buffer = Math.max(0, Number(newSrv.buffer) ?? 30);
                      const startTrim = normalizeTimeInput(newSrv.start_time);
                      const endTrim = normalizeTimeInput(newSrv.end_time);
                      if ((startTrim && !endTrim) || (!startTrim && endTrim)) {
                        return alert('Define horario de inicio y fin, o déjalos ambos vacíos para usar el de la clínica.');
                      }
                      const p = {
                        name: newSrv.name.trim(),
                        duration,
                        buffer,
                        price: Number(newSrv.price) || 0,
                        color: newSrv.color,
                        is_active: newSrv.is_active,
                        start_time: startTrim || null,
                        end_time: endTrim || null,
                      };
                      try {
                        let error;
                        if(isEditingSrv && newSrv.id) {
                          ({ error } = await activeSupabase.from('services').update(p).eq('id', newSrv.id));
                        } else {
                          ({ error } = await activeSupabase.from('services').insert([p]));
                        }
                        if (error) return alert(`${L.p.services.saveError}: ${error.message}`);
                        setIsEditingSrv(false);
                        setNewSrv({ id: null, name: '', duration: 60, buffer: 30, price: 100, color: 'blue', is_active: true, equipment: 'Cámara 1', start_time: '', end_time: '' });
                        await fetchAllData();
                      } catch (e) {
                        alert(`${L.p.services.saveError}: ${e.message}`);
                      }
                    }} className="flex-1 bg-blue-600 text-white font-black py-3 rounded-xl uppercase text-xs shadow-md hover:bg-blue-700 transition">{isEditingSrv ? 'Actualizar' : 'Guardar'}</button>
                  </div>
                </div>
              </div>
              
              <div className="xl:col-span-3 bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
                <div className="px-5 py-4 border-b border-slate-100 bg-slate-50">
                  <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Equipos registrados</h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead className="border-b border-slate-100 text-[9px] font-black text-slate-400 uppercase tracking-widest">
                      <tr><th className="px-5 py-3">Equipo</th><th className="px-5 py-3">Horario</th><th className="px-5 py-3">Bloque</th><th className="px-5 py-3">Precio</th><th className="px-5 py-3">Estado</th><th className="px-5 py-3 text-right">Acciones</th></tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {(dbServices || []).map(s => (
                        <tr key={s.id} className={`hover:bg-slate-50/80 transition-colors ${!s.is_active ? 'opacity-50' : ''}`}>
                          <td className="px-5 py-4">
                            <div className="flex items-center gap-3 min-w-0">
                              <div className={`w-3 h-3 rounded-full shrink-0 ${getDynamicColorClass(s.color)}`} />
                              <span className="font-black text-slate-800 uppercase text-sm truncate">{s.name}</span>
                            </div>
                          </td>
                          <td className="px-5 py-4 font-bold text-slate-500 text-[10px] whitespace-nowrap uppercase">
                            {s.start_time && s.end_time ? `${normalizeTimeInput(s.start_time)} – ${normalizeTimeInput(s.end_time)}` : 'Clínica'}
                          </td>
                          <td className="px-5 py-4 font-bold text-slate-600 text-[10px] whitespace-nowrap">
                            {(Number(s.duration) || 60)} + {(Number(s.buffer) ?? 30)} min
                            <span className="block text-[8px] text-slate-400 uppercase">= {(Number(s.duration) || 60) + (Number(s.buffer) ?? 30)} min</span>
                          </td>
                          <td className="px-5 py-4 font-bold text-slate-600 text-sm whitespace-nowrap">${s.price} {currencyStr}</td>
                          <td className="px-5 py-4">
                            <span className={`inline-block px-2 py-1 rounded-md text-[9px] font-black uppercase ${s.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>{s.is_active ? 'Activo' : 'Oculto'}</span>
                          </td>
                          <td className="px-5 py-4">
                            <div className="flex justify-end gap-2">
                              <button onClick={() => {
                                setNewSrv({
                                  ...s,
                                  duration: Number(s.duration) || 60,
                                  buffer: Number(s.buffer ?? 30),
                                  start_time: normalizeTimeInput(s.start_time),
                                  end_time: normalizeTimeInput(s.end_time),
                                });
                                setIsEditingSrv(true);
                              }} className="bg-blue-50 text-blue-700 px-3 py-1.5 rounded-lg text-[9px] font-black uppercase hover:bg-blue-100 border border-blue-100">Editar</button>
                              <button onClick={async () => { 
                                if(window.confirm(a('deleteEquipment'))) { 
                                  await activeSupabase.from('services').delete().eq('id', s.id); 
                                  fetchAllData(); 
                                } 
                              }} className="bg-red-50 text-red-600 px-3 py-1.5 rounded-lg text-[9px] font-black uppercase hover:bg-red-100 border border-red-100">Borrar</button>
                            </div>
                          </td>
                        </tr>
                      ))}
                      {(!dbServices || dbServices.length === 0) && <tr><td colSpan="6" className="px-5 py-12 text-center text-slate-400 font-bold uppercase text-sm">Sin equipos configurados</td></tr>}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {/* SECCIÓN DE PROTOCOLOS */}
            <div className="mb-4">
              <h3 className="text-xl font-black text-slate-800 uppercase tracking-tight">Protocolos</h3>
              <p className="text-xs font-bold text-slate-500 mt-1">Tipos clínicos asignables a pacientes y citas.</p>
            </div>
            <div className="grid grid-cols-1 xl:grid-cols-5 gap-6">
              
              <div className="xl:col-span-2 bg-white p-6 rounded-2xl border border-slate-200 h-fit shadow-sm">
                <h3 className="font-black text-slate-800 uppercase text-sm mb-4 pb-3 border-b border-slate-100">{isEditingProtocol ? 'Editar protocolo' : 'Nuevo protocolo'}</h3>
                <div className="space-y-4">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Nombre</label>
                    <input type="text" placeholder="Ej. Médico Especial" className="w-full p-3 rounded-xl border border-slate-300 font-bold text-sm outline-none uppercase focus:border-blue-500 text-slate-900 bg-white" value={newProtocol.name} onChange={e => setNewProtocol({...newProtocol, name: e.target.value})} />
                  </div>
                  <label className="flex items-center gap-2 bg-slate-50 p-3 rounded-xl border border-slate-200 cursor-pointer">
                    <input type="checkbox" checked={newProtocol.is_active} onChange={e => setNewProtocol({...newProtocol, is_active: e.target.checked})} className="w-4 h-4" />
                    <span className="text-xs font-black uppercase text-slate-700">Activo en listas</span>
                  </label>
                  <div className="flex gap-2 pt-1">
                    {isEditingProtocol && <button onClick={() => {setIsEditingProtocol(false); setNewProtocol({ id: null, name: '', is_active: true });}} className="px-4 bg-slate-100 text-slate-700 font-black py-3 rounded-xl uppercase text-xs hover:bg-slate-200">Cancelar</button>}
                    <button onClick={async () => {
                      if(!newProtocol.name) return alert(L.p.services.missingName);
                      const p = { name: newProtocol.name, is_active: newProtocol.is_active };
                      if(isEditingProtocol && newProtocol.id) {
                        await activeSupabase.from('protocols').update(p).eq('id', newProtocol.id);
                      } else {
                        await activeSupabase.from('protocols').insert([p]);
                      }
                      setIsEditingProtocol(false); 
                      setNewProtocol({ id: null, name: '', is_active: true }); 
                      fetchAllData();
                    }} className="flex-1 bg-blue-600 text-white font-black py-3 rounded-xl uppercase text-xs shadow-md hover:bg-blue-700 transition">{isEditingProtocol ? 'Actualizar' : 'Guardar'}</button>
                  </div>
                </div>
              </div>
              
              <div className="xl:col-span-3 bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
                <div className="px-5 py-4 border-b border-slate-100 bg-slate-50">
                  <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Protocolos registrados</h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead className="border-b border-slate-100 text-[9px] font-black text-slate-400 uppercase tracking-widest">
                      <tr><th className="px-5 py-3">Nombre</th><th className="px-5 py-3">Estado</th><th className="px-5 py-3 text-right">Acciones</th></tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {(dbProtocols || []).map(p => (
                        <tr key={p.id} className={`hover:bg-slate-50/80 transition-colors ${!p.is_active ? 'opacity-50' : ''}`}>
                          <td className="px-5 py-4 font-black text-slate-800 uppercase text-sm">{p.name}</td>
                          <td className="px-5 py-4">
                            <span className={`inline-block px-2 py-1 rounded-md text-[9px] font-black uppercase ${p.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>{p.is_active ? 'Activo' : 'Inactivo'}</span>
                          </td>
                          <td className="px-5 py-4">
                            <div className="flex justify-end gap-2">
                              <button onClick={() => {setNewProtocol(p); setIsEditingProtocol(true);}} className="bg-blue-50 text-blue-700 px-3 py-1.5 rounded-lg text-[9px] font-black uppercase hover:bg-blue-100 border border-blue-100">Editar</button>
                              <button onClick={async () => { 
                                if(window.confirm(a('deleteProtocol'))) { 
                                  await activeSupabase.from('protocols').delete().eq('id', p.id); 
                                  fetchAllData(); 
                                } 
                              }} className="bg-red-50 text-red-600 px-3 py-1.5 rounded-lg text-[9px] font-black uppercase hover:bg-red-100 border border-red-100">Borrar</button>
                            </div>
                          </td>
                        </tr>
                      ))}
                      {(!dbProtocols || dbProtocols.length === 0) && <tr><td colSpan="3" className="px-5 py-12 text-center text-slate-400 font-bold uppercase text-sm">Sin protocolos configurados</td></tr>}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* VISTA REPORTES */}
        {activeTab === 'Reportes' && currentUserLevel <= 2 && (
          <div className="flex-1 p-3 lg:p-6 overflow-auto bg-white flex flex-col h-full z-10 relative">
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
                  <div className="bg-white p-6 sm:p-10 rounded-3xl shadow-2xl border text-center max-w-sm w-full mx-4">
                    <h2 className="text-2xl font-black uppercase mb-2 text-slate-800">🔒 Acceso a Ventas</h2>
                    <p className="text-xs font-bold text-slate-500 mb-8 uppercase">Ingresa la Llave Financiera de 6 Dígitos</p>
                    <input type="password" placeholder="******" maxLength="6" value={pinInput} onKeyDown={e => e.key === 'Enter' && handleFinancialUnlock()} onChange={e => setPinInput(e.target.value)} className="w-full text-center text-3xl tracking-[0.2em] font-black p-4 border rounded-xl outline-none focus:border-blue-500 mb-6 bg-slate-50 text-slate-900" />
                    <button onClick={handleFinancialUnlock} className="w-full bg-slate-900 text-white font-black py-4 rounded-xl shadow-lg uppercase text-sm hover:bg-slate-800 transition">Desbloquear Ventas</button>
                  </div>
                </div>
              ) : (
                <div className="flex-1 flex flex-col">
                  <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 mb-6">
                    <div className="min-w-0 flex-1"><label className="block text-[10px] font-black uppercase text-slate-400 mb-1">Fecha Inicio</label><input type="date" value={reportStartDate} onChange={e => setReportStartDate(e.target.value)} className="w-full min-w-0 p-2 border border-slate-300 rounded-lg font-bold outline-none text-slate-900 bg-white text-sm" /></div>
                    <div className="min-w-0 flex-1"><label className="block text-[10px] font-black uppercase text-slate-400 mb-1">Fecha Fin</label><input type="date" value={reportEndDate} onChange={e => setReportEndDate(e.target.value)} className="w-full min-w-0 p-2 border border-slate-300 rounded-lg font-bold outline-none text-slate-900 bg-white text-sm" /></div>
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
        {activeTab === 'GFE' && <div className="flex-1 p-3 lg:p-6 overflow-hidden z-10 min-h-0"><GFEManager patients={dbAppointments} onUpdatePatient={() => {}} /></div>}

        {/* VISTA ADMIN */}
        {activeTab === 'Admin' && currentUserLevel <= 2 && (
          <div className="flex-1 p-3 lg:p-6 bg-white overflow-auto flex flex-col h-full z-10">
            <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-6 pb-4 border-b border-slate-200">
              <div>
                <h2 className="text-2xl font-black text-slate-800 uppercase tracking-tight">Ajustes de Clínica</h2>
                <p className="text-[10px] font-bold text-slate-500 uppercase mt-1">
                  {activeClinic === 'Shenandoah' ? 'Houston · USA' : 'Guadalajara · MX'}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setAdminSubTab('general')}
                  className={`px-4 py-2.5 rounded-xl text-[10px] font-black uppercase transition ${adminSubTab === 'general' ? 'bg-slate-900 text-white shadow' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                >
                  ⚙️ General y horarios
                </button>
                <button
                  type="button"
                  onClick={() => setAdminSubTab('mensajes')}
                  className={`px-4 py-2.5 rounded-xl text-[10px] font-black uppercase transition ${adminSubTab === 'mensajes' ? 'bg-emerald-600 text-white shadow' : 'bg-emerald-50 text-emerald-800 border border-emerald-200 hover:bg-emerald-100'}`}
                >
                  ✉️ Mensajes de correo
                </button>
              </div>
            </div>

            {adminSubTab === 'mensajes' && (
              <div className="bg-emerald-50/50 p-4 sm:p-8 rounded-2xl border-2 border-emerald-200 shadow-sm mb-8">
                <h3 className="font-black text-emerald-900 uppercase text-lg mb-1">Mensajes que se envían al paciente</h3>
                <p className="text-xs font-bold text-emerald-800/80 mb-6 leading-relaxed max-w-3xl">
                  Edita el texto de cada tipo de aviso. Cada clínica (GDL y Houston) tiene sus propios mensajes.
                  Al agendar, reprogramar o cancelar se usa la plantilla correspondiente. Los datos de fecha, hora y servicio se agregan solos.
                </p>

                <div className="flex flex-wrap gap-2 mb-4">
                  {[
                    { id: 'first', label: locale === 'en' ? 'First visit' : 'Primera cita' },
                    { id: 'booking', label: locale === 'en' ? 'Scheduling' : 'Programación' },
                    { id: 'reschedule', label: locale === 'en' ? 'Reschedule' : 'Reprogramación' },
                    { id: 'cancel', label: locale === 'en' ? 'Cancellation' : 'Cancelación' },
                  ].map((tab) => (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setEmailTemplateTab(tab.id)}
                      className={`px-4 py-2.5 rounded-lg text-[10px] font-black uppercase transition ${emailTemplateTab === tab.id ? 'bg-emerald-600 text-white shadow' : 'bg-white border border-emerald-200 text-emerald-900 hover:bg-emerald-100'}`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
                  <div className="space-y-3 bg-white p-4 sm:p-5 rounded-xl border border-emerald-100 shadow-sm">
                    <div>
                      <label className="text-[10px] font-black text-slate-500 uppercase ml-1">Asunto del correo</label>
                      <input
                        type="text"
                        value={dbCompanyConfig[`notify_subject_${emailTemplateTab}`] || ''}
                        onChange={(e) => setDbCompanyConfig({ ...dbCompanyConfig, [`notify_subject_${emailTemplateTab}`]: e.target.value })}
                        className="w-full p-3 border border-slate-300 rounded-lg font-bold outline-none text-slate-900 bg-white mt-1"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-black text-slate-500 uppercase ml-1">Mensaje principal</label>
                      <textarea
                        rows={8}
                        value={dbCompanyConfig[`notify_body_${emailTemplateTab}`] || ''}
                        onChange={(e) => setDbCompanyConfig({ ...dbCompanyConfig, [`notify_body_${emailTemplateTab}`]: e.target.value })}
                        className="w-full p-3 border border-slate-300 rounded-lg font-bold outline-none text-slate-900 bg-white mt-1 text-sm leading-relaxed"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={openEmailPreview}
                      className="w-full sm:w-auto px-4 py-2.5 bg-blue-50 border border-blue-200 text-blue-800 font-black text-[10px] uppercase rounded-lg hover:bg-blue-100 transition"
                    >
                      👁 {locale === 'en' ? 'Preview email' : 'Vista previa del correo'}
                    </button>
                  </div>

                  <div className="space-y-3">
                    <div className="bg-white p-4 sm:p-5 rounded-xl border border-emerald-100 shadow-sm">
                      <label className="text-[10px] font-black text-slate-500 uppercase ml-1">Datos relevantes (en todos los correos)</label>
                      <p className="text-[9px] font-bold text-slate-400 mb-2">Estacionamiento, qué traer, políticas, maps, etc.</p>
                      <textarea
                        rows={8}
                        value={dbCompanyConfig.notify_extra_info || ''}
                        onChange={(e) => setDbCompanyConfig({ ...dbCompanyConfig, notify_extra_info: e.target.value })}
                        className="w-full p-3 border border-slate-300 rounded-lg font-bold outline-none text-slate-900 bg-white text-sm leading-relaxed"
                        placeholder={locale === 'en' ? 'Free parking in lot B. Wear comfortable clothes.' : 'Estacionamiento gratuito. Traer ropa cómoda y evitar perfumes fuertes.'}
                      />
                    </div>
                    <div className="bg-slate-800 text-slate-200 p-4 rounded-xl text-[10px] font-bold leading-relaxed">
                      <p className="font-black uppercase text-slate-400 mb-2">Variables que puedes usar</p>
                      <p className="font-mono text-[9px] break-all">{EMAIL_PLACEHOLDER_HINT}</p>
                    </div>
                  </div>
                </div>

                <div className="bg-amber-50 border-2 border-amber-200 rounded-xl p-4 sm:p-5 mb-4">
                  <h4 className="text-xs font-black uppercase text-amber-900 mb-1">Indicaciones para tu sesión (bloque amarillo del correo)</h4>
                  <p className="text-[10px] font-bold text-amber-800/90 mb-4 leading-relaxed">
                    Texto por defecto si la cita no trae notas del día. Si al agendar escribes instrucciones en la cita, esas tienen prioridad.
                    Usa {'{{instrucciones}}'} en el mensaje principal si quieres insertarlo ahí también.
                  </p>
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    <div>
                      <label className="text-[10px] font-black text-amber-800 uppercase ml-1">Título del bloque</label>
                      <input
                        type="text"
                        value={dbCompanyConfig.notify_session_label || ''}
                        onChange={(e) => setDbCompanyConfig({ ...dbCompanyConfig, notify_session_label: e.target.value })}
                        className="w-full p-3 border border-amber-200 rounded-lg font-bold outline-none text-slate-900 bg-white mt-1"
                        placeholder="Indicaciones para tu sesión"
                      />
                    </div>
                    <div className="lg:col-span-2">
                      <label className="text-[10px] font-black text-amber-800 uppercase ml-1">Texto de indicaciones</label>
                      <textarea
                        rows={4}
                        value={dbCompanyConfig.notify_session_default || ''}
                        onChange={(e) => setDbCompanyConfig({ ...dbCompanyConfig, notify_session_default: e.target.value })}
                        className="w-full p-3 border border-amber-200 rounded-lg font-bold outline-none text-slate-900 bg-white mt-1 text-sm leading-relaxed"
                        placeholder="Evitar comidas pesadas 2 horas antes de la sesión."
                      />
                    </div>
                  </div>
                </div>

                <button
                  onClick={async () => {
                    try {
                      await saveCompanyConfig();
                    } catch (e) {
                      alert(a('configSaveError', e.message));
                    }
                  }}
                  className="w-full sm:w-auto sm:min-w-[280px] bg-emerald-600 text-white font-black py-4 px-8 rounded-xl uppercase shadow-lg hover:bg-emerald-700 transition"
                >
                  Guardar mensajes de correo
                </button>
              </div>
            )}

            {adminSubTab === 'general' && (
            <>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              
              <div className="bg-slate-50 p-6 rounded-2xl border border-slate-200 shadow-sm h-fit">
                {/* PANEL DE SEGURIDAD Y CÓDIGOS DE ACCESO */}
                <h3 className="font-black text-slate-800 uppercase text-sm mb-4 pb-2 border-b">Seguridad y NIPs de Acceso Maestro</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
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
                    <input type="text" value={dbCompanyConfig.name} onChange={e => setDbCompanyConfig({...dbCompanyConfig, name: formatClinicField(e.target.value)})} className="w-full p-2.5 border rounded-lg font-bold uppercase outline-none text-slate-900 bg-white" />
                  </div>
                  <div>
                    <label className="text-[10px] font-black text-slate-400 uppercase ml-1">Dirección Clínica</label>
                    <input type="text" value={dbCompanyConfig.address} onChange={e => setDbCompanyConfig({...dbCompanyConfig, address: formatClinicField(e.target.value)})} className="w-full p-2.5 border rounded-lg font-bold uppercase outline-none text-slate-900 bg-white" />
                  </div>
                  <div>
                    <label className="text-[10px] font-black text-slate-400 uppercase ml-1">Teléfono Público</label>
                    <input type="text" value={dbCompanyConfig.phone} onChange={e => setDbCompanyConfig({...dbCompanyConfig, phone: formatClinicPhone(e.target.value)})} className="w-full p-2.5 border rounded-lg font-bold uppercase outline-none text-slate-900 bg-white" />
                  </div>
                  <div>
                    <label className="text-[10px] font-black text-slate-400 uppercase ml-1">Mensaje de Agradecimiento</label>
                    <input type="text" value={dbCompanyConfig.ticket_message} onChange={e => setDbCompanyConfig({...dbCompanyConfig, ticket_message: formatClinicField(e.target.value)})} className="w-full p-2.5 border rounded-lg font-bold uppercase outline-none text-slate-900 bg-white" />
                  </div>
                </div>
                
                <h3 className="font-black text-slate-800 uppercase text-sm mb-4 pb-2 border-b mt-6">Reglas y Límites de Agenda</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
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
                    <input type="time" value={normalizeTimeInput(dbCompanyConfig.start_time) || '07:00'} onChange={e => setDbCompanyConfig({...dbCompanyConfig, start_time: e.target.value})} className="w-full p-2.5 border rounded-lg font-bold outline-none text-slate-900 bg-white" />
                  </div>
                  <div>
                    <label className="text-[10px] font-black text-slate-400 uppercase ml-1">Cierre</label>
                    <input type="time" value={normalizeTimeInput(dbCompanyConfig.end_time) || '20:00'} onChange={e => setDbCompanyConfig({...dbCompanyConfig, end_time: e.target.value})} className="w-full p-2.5 border rounded-lg font-bold outline-none text-slate-900 bg-white" />
                  </div>
                  <div className="col-span-1 sm:col-span-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase ml-1">Intervalos en Cuadrícula</label>
                    <select value={dbCompanyConfig.interval_mins} onChange={e => setDbCompanyConfig({...dbCompanyConfig, interval_mins: Number(e.target.value)})} className="w-full p-2.5 border rounded-lg font-bold outline-none text-slate-900 bg-white">
                      <option value={15}>15 minutos</option>
                      <option value={30}>30 minutos</option>
                      <option value={60}>60 minutos</option>
                    </select>
                  </div>
                </div>

                {/* CONFIGURACIÓN DE NOTIFICACIONES */}
                <h3 className="font-black text-slate-800 uppercase text-sm mb-4 pb-2 border-b mt-6">Motor de Notificaciones (Email y SMS)</h3>
                <p className="text-[10px] font-bold text-slate-500 mb-3 leading-relaxed">
                  Elige qué eventos envían correo/SMS automáticamente. El botón manual &quot;Enviar indicaciones&quot; en la cita sigue funcionando aunque desactives un tipo.
                </p>
                <div className="flex items-center gap-2 bg-white p-3 rounded-lg border border-slate-200 shadow-sm mb-4">
                  <input type="checkbox" checked={dbCompanyConfig.notify_on_booking !== false} onChange={e => setDbCompanyConfig({...dbCompanyConfig, notify_on_booking: e.target.checked})} className="w-4 h-4 cursor-pointer" />
                  <label className="text-[10px] font-black text-slate-700 uppercase cursor-pointer">Master: notificaciones automáticas activas</label>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
                  {[
                    { key: 'notify_auto_first', label: locale === 'en' ? 'First appointment' : 'Primera cita' },
                    { key: 'notify_auto_booking', label: locale === 'en' ? 'Recurring / scheduling' : 'Programación (recurrente)' },
                    { key: 'notify_auto_reschedule', label: locale === 'en' ? 'Reschedule' : 'Reprogramación' },
                    { key: 'notify_auto_cancel', label: locale === 'en' ? 'Cancellation' : 'Cancelación' },
                  ].map((item) => (
                    <label key={item.key} className="flex items-center gap-2 bg-white p-3 rounded-lg border border-slate-200 shadow-sm cursor-pointer">
                      <input
                        type="checkbox"
                        checked={dbCompanyConfig[item.key] !== false}
                        onChange={(e) => setDbCompanyConfig({ ...dbCompanyConfig, [item.key]: e.target.checked })}
                        className="w-4 h-4"
                      />
                      <span className="text-[10px] font-black text-slate-700 uppercase">{item.label}</span>
                    </label>
                  ))}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
                  <label className="flex items-center gap-2 bg-blue-50 p-3 rounded-lg border border-blue-200 cursor-pointer">
                    <input type="checkbox" checked={dbCompanyConfig.notify_channel_email !== false} onChange={e => setDbCompanyConfig({...dbCompanyConfig, notify_channel_email: e.target.checked})} className="w-4 h-4" />
                    <span className="text-[10px] font-black text-blue-900 uppercase">Canal: correo electrónico</span>
                  </label>
                  <label className="flex items-center gap-2 bg-violet-50 p-3 rounded-lg border border-violet-200 cursor-pointer">
                    <input type="checkbox" checked={dbCompanyConfig.notify_channel_sms !== false} onChange={e => setDbCompanyConfig({...dbCompanyConfig, notify_channel_sms: e.target.checked})} className="w-4 h-4" />
                    <span className="text-[10px] font-black text-violet-900 uppercase">
                      {activeClinic === 'Shenandoah' ? 'Canal: SMS (Twilio — USA)' : 'Canal: WhatsApp (México)'}
                    </span>
                  </label>
                </div>
                <div>
                  <label className="text-[10px] font-black text-slate-400 uppercase ml-1">Horas previas (recordatorio automático — próximamente)</label>
                  <input type="number" value={dbCompanyConfig.reminder_hours} onChange={e => setDbCompanyConfig({...dbCompanyConfig, reminder_hours: Number(e.target.value)})} className="w-full p-2.5 border border-slate-300 rounded-lg font-bold outline-none text-slate-900 bg-white shadow-sm" />
                </div>
                <div className="mt-6 mb-4 p-4 rounded-xl bg-indigo-50 border-2 border-indigo-200">
                  <h4 className="text-xs font-black uppercase text-indigo-900 mb-2">Alertas al equipo — cita nueva</h4>
                  <p className="text-[10px] font-bold text-indigo-800/90 mb-3 leading-relaxed">
                    Cuando un cliente o promotor agenda (web o staff), avisa por {activeClinic === 'Shenandoah' ? 'SMS' : 'WhatsApp'} y/o correo.
                    Puedes poner números extra abajo <strong>o</strong> agregar celular y correo en cada empleado (Admin → Personal autorizado).
                    Requiere {activeClinic === 'Shenandoah' ? 'Twilio (SMS)' : 'WhatsApp Business (Meta)'} y Resend (correo) en Vercel.
                  </p>
                  <label className="flex items-center gap-2 bg-white p-3 rounded-lg border border-indigo-200 shadow-sm cursor-pointer mb-3">
                    <input
                      type="checkbox"
                      checked={dbCompanyConfig.notify_staff_on_booking === true}
                      onChange={(e) => setDbCompanyConfig({ ...dbCompanyConfig, notify_staff_on_booking: e.target.checked })}
                      className="w-4 h-4"
                    />
                    <span className="text-[10px] font-black text-indigo-900 uppercase">Avisar al equipo cuando hay cita nueva</span>
                  </label>
                  <div className="space-y-3">
                    <div>
                      <label className="text-[10px] font-black text-indigo-800 uppercase ml-1">
                        Teléfonos del equipo ({activeClinic === 'Shenandoah' ? 'SMS' : 'WhatsApp'})
                      </label>
                      <textarea
                        rows={2}
                        value={dbCompanyConfig.staff_alert_phones || ''}
                        onChange={(e) => setDbCompanyConfig({ ...dbCompanyConfig, staff_alert_phones: e.target.value })}
                        placeholder="3312345678, 3398765432"
                        className="w-full p-2.5 border border-indigo-200 rounded-lg font-bold text-sm outline-none bg-white mt-1"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-black text-indigo-800 uppercase ml-1">Correos del equipo</label>
                      <textarea
                        rows={2}
                        value={dbCompanyConfig.staff_alert_emails || ''}
                        onChange={(e) => setDbCompanyConfig({ ...dbCompanyConfig, staff_alert_emails: e.target.value })}
                        placeholder="recepcion@oxygengdl.com, gerencia@oxygengdl.com"
                        className="w-full p-2.5 border border-indigo-200 rounded-lg font-bold text-sm outline-none bg-white mt-1"
                      />
                    </div>
                  </div>
                </div>
                <div className="mt-4 mb-4 p-3 rounded-lg bg-slate-100 border border-slate-200 text-[10px] font-bold text-slate-600 leading-relaxed">
                  <span className="font-black uppercase text-slate-500 block mb-1">Notificaciones push en el teléfono (icono de la app)</span>
                  Aún no disponibles. Las alertas al equipo funcionan por SMS al número de arriba (llega como mensaje de texto) o por correo. Push nativo requiere desarrollo adicional.
                </div>
                <button
                  type="button"
                  onClick={() => setAdminSubTab('mensajes')}
                  className="w-full mb-6 p-4 rounded-xl border-2 border-dashed border-emerald-300 bg-emerald-50 text-left hover:bg-emerald-100 transition group"
                >
                  <span className="block text-[10px] font-black uppercase text-emerald-800">✉️ Editar textos de correo y SMS</span>
                  <span className="block text-xs font-bold text-emerald-700 mt-1">Primera cita · Programación · Reprogramación · Cancelación · Datos relevantes</span>
                </button>
                <details className="mb-6 text-[10px] font-bold text-slate-500">
                  <summary className="cursor-pointer uppercase text-slate-400 font-black">Configuración técnica (Vercel / Resend / Twilio / WhatsApp)</summary>
                  <p className="mt-2 leading-relaxed pl-2 border-l-2 border-slate-200">
                    Un solo deploy: oxy-agenda.vercel.app. Diagnóstico: /api/health/notify
                    Correo: RESEND_* · USA SMS: TWILIO_* + TWILIO_MESSAGING_SERVICE_SID (A2P) · MX: WHATSAPP_*
                  </p>
                </details>

                <button onClick={async () => {
                  try {
                    await saveCompanyConfig();
                  } catch (e) {
                    alert(a('configSaveError', e.message));
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
                          if (!newRole.name) return alert(L.p.admin.roleName);
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
                      <input type="tel" placeholder={L.p.admin.staffPhonePh} className="w-full p-2.5 border rounded-lg font-bold outline-none text-slate-900 bg-white" value={newUser.phone || ''} onChange={e => setNewUser({...newUser, phone: e.target.value})} />
                      <input type="email" placeholder={L.p.admin.staffEmailPh} className="w-full p-2.5 border rounded-lg font-bold outline-none text-slate-900 bg-white" value={newUser.email || ''} onChange={e => setNewUser({...newUser, email: e.target.value})} />
                      <label className="flex items-center gap-2 bg-indigo-50 p-3 rounded-lg border border-indigo-200 cursor-pointer">
                        <input type="checkbox" checked={newUser.notify_on_booking !== false} onChange={e => setNewUser({ ...newUser, notify_on_booking: e.target.checked })} className="w-4 h-4" />
                        <span className="text-[10px] font-black uppercase text-indigo-900">{L.p.admin.staffNotifyBooking}</span>
                      </label>
                      <select className="w-full p-2.5 border rounded-lg font-bold uppercase outline-none text-slate-900 bg-white" value={newUser.role} onChange={e => setNewUser({...newUser, role: e.target.value})}>
                        {dbRoles.map(r => <option key={r.id} value={r.name}>{r.name} (Nivel {r.level})</option>)}
                      </select>
                      <input type="text" placeholder="Certificación (Ej. IBUM, D.O.)" className="w-full p-2.5 border rounded-lg font-bold uppercase outline-none text-slate-900 bg-white" value={newUser.cert} onChange={e => setNewUser({...newUser, cert: e.target.value})} />
                      <input type="text" placeholder="PIN Personal (6 Dígitos)" maxLength="6" className="w-full p-2.5 border border-slate-300 rounded-lg font-bold outline-none tracking-widest text-slate-900 bg-white" value={newUser.pin || ''} onChange={e => setNewUser({...newUser, pin: e.target.value})} />
                      <div className="flex gap-2">
                        {isEditingUser && <button onClick={() => {setIsEditingUser(false); setNewUser({ id: null, name: '', email: '', phone: '', notify_on_booking: true, role: dbRoles[0]?.name || '', cert: '', is_active: true, pin: '' });}} className="w-1/3 bg-slate-300 text-slate-700 font-black py-3 rounded-xl uppercase text-xs">Cancelar</button>}
                        <button onClick={async () => {
                          if (!newUser.name) return alert(L.p.admin.userName);
                          if (!newUser.pin || newUser.pin.length !== 6) return alert(L.p.admin.pinSix);
                          const staffPayload = {
                            name: newUser.name,
                            role: newUser.role,
                            cert: newUser.cert,
                            is_active: newUser.is_active,
                            pin: newUser.pin,
                            notify_on_booking: newUser.notify_on_booking !== false,
                          };
                          const email = (newUser.email || '').trim();
                          const phone = (newUser.phone || '').trim();
                          if (email) staffPayload.email = email;
                          if (phone) staffPayload.phone = phone;

                          const saveStaff = async (payload) => {
                            if (isEditingUser && newUser.id) {
                              return activeSupabase.from('users_staff').update(payload).eq('id', newUser.id);
                            }
                            return activeSupabase.from('users_staff').insert([payload]);
                          };

                          let res = await saveStaff(staffPayload);
                          if (res.error && res.error.message.toLowerCase().includes('column')) {
                            const fallback = { ...staffPayload };
                            delete fallback.phone;
                            delete fallback.notify_on_booking;
                            if (fallback.email) {
                              res = await saveStaff(fallback);
                              if (res.error && res.error.message.toLowerCase().includes('column')) {
                                const { email: _e, ...rest } = fallback;
                                res = await saveStaff(rest);
                              }
                            } else {
                              res = await saveStaff(fallback);
                            }
                            if (!res.error && (phone || newUser.notify_on_booking !== false)) {
                              alert(L.p.admin.staffPhoneColumnMissing);
                            }
                          } else if (res.error && res.error.message.toLowerCase().includes('column') && staffPayload.email) {
                            const { email: _e, ...rest } = staffPayload;
                            res = await saveStaff(rest);
                          }
                          if (res.error) return alert(a('saveError', res.error.message));

                          if (isEditingUser && newUser.id) {
                            await logAudit(null, newUser.name, 'EDICIÓN DE EMPLEADO', `Rol: ${newUser.role} · ${activeClinic}`);
                          } else {
                            await logAudit(null, newUser.name, 'ALTA DE EMPLEADO', `Rol: ${newUser.role} · ${activeClinic}`);
                          }
                          setIsEditingUser(false); 
                          setNewUser({ id: null, name: '', email: '', phone: '', notify_on_booking: true, role: dbRoles[0]?.name || '', cert: '', is_active: true, pin: '' }); 
                          fetchAllData();
                        }} className="flex-1 bg-slate-900 text-white font-black py-3 rounded-xl uppercase text-xs shadow-md">{isEditingUser ? 'Actualizar' : 'Guardar'}</button>
                      </div>
                    </div>
                    <table className="w-full text-left bg-white border rounded-xl overflow-hidden">
                      <thead className="bg-slate-100 text-[10px] font-black uppercase text-slate-400">
                        <tr><th className="p-3">Nombre</th><th className="p-3">Teléfono</th><th className="p-3">Correo</th><th className="p-3">Rol</th><th className="p-3"></th></tr>
                      </thead>
                      <tbody className="divide-y text-slate-900">
                        {(dbUsers || []).map(u => (
                          <tr key={u.id} className={`text-xs font-bold uppercase ${!u.is_active && 'opacity-40 grayscale'}`}>
                            <td className="p-3">{u.name}</td>
                            <td className="p-3 text-slate-600 normal-case text-[10px]">{u.phone || '—'}</td>
                            <td className="p-3 text-slate-500 normal-case text-[10px]">{u.email || '—'}</td>
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

            <div className="mt-8 bg-slate-50 p-4 sm:p-6 rounded-2xl border border-slate-200 shadow-sm">
              <div className="mb-4">
                <h3 className="font-black text-slate-800 uppercase text-sm">{L.p.admin.promotersTitle}</h3>
                <p className="text-[10px] font-bold text-slate-500 mt-1">{L.p.admin.promotersHint}</p>
                <p className="text-[10px] font-black text-blue-600 mt-1 uppercase">{activeClinicLabel}</p>
              </div>

              {promotersLoadError ? (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-[11px] font-bold text-amber-900">
                  {L.p.admin.promoterTableMissing}
                  <pre className="mt-2 text-[9px] font-mono text-amber-800/80 whitespace-pre-wrap">{promotersLoadError}</pre>
                </div>
              ) : (
                <div className="grid grid-cols-1 xl:grid-cols-5 gap-6">
                  <div className="xl:col-span-2 bg-white p-4 sm:p-6 rounded-2xl border border-slate-200 h-fit">
                    <h4 className="font-black text-slate-800 uppercase text-xs mb-4 pb-2 border-b">
                      {isEditingPromoter ? L.p.admin.promoterEdit : L.p.admin.promoterNew}
                    </h4>
                    <div className="space-y-3">
                      <div>
                        <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">{L.p.admin.promoterCode}</label>
                        <input
                          type="text"
                          value={newPromoter.code}
                          onChange={(e) => setNewPromoter({ ...newPromoter, code: e.target.value.toUpperCase() })}
                          placeholder="ANA01"
                          className="w-full p-3 rounded-xl border border-slate-300 font-black text-sm outline-none uppercase focus:border-blue-500 text-slate-900 bg-white tracking-wider"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">{L.p.admin.promoterName}</label>
                        <input
                          type="text"
                          value={newPromoter.name}
                          onChange={(e) => setNewPromoter({ ...newPromoter, name: e.target.value })}
                          placeholder="Ana García"
                          className="w-full p-3 rounded-xl border border-slate-300 font-bold text-sm outline-none focus:border-blue-500 text-slate-900 bg-white"
                        />
                      </div>
                      <label className="flex items-center gap-2 bg-slate-50 p-3 rounded-xl border border-slate-200 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={newPromoter.is_active !== false}
                          onChange={(e) => setNewPromoter({ ...newPromoter, is_active: e.target.checked })}
                          className="w-4 h-4"
                        />
                        <span className="text-xs font-black uppercase text-slate-700">{L.p.admin.promoterActive}</span>
                      </label>
                      {normalizePromoCode(newPromoter.code).length >= 2 && (
                        <p className="text-[9px] font-mono text-slate-500 break-all bg-slate-50 p-2 rounded-lg border border-slate-200">
                          {buildPromoterBookingUrl(activeClinic, newPromoter.code, typeof window !== 'undefined' ? window.location.origin : '')}
                        </p>
                      )}
                      <div className="flex gap-2 pt-1">
                        {isEditingPromoter && (
                          <button
                            type="button"
                            onClick={() => { setIsEditingPromoter(false); setNewPromoter({ id: null, code: '', name: '', is_active: true }); }}
                            className="px-4 bg-slate-100 text-slate-700 font-black py-3 rounded-xl uppercase text-xs hover:bg-slate-200"
                          >
                            {L.p.common.cancel}
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={savePromoter}
                          className="flex-1 bg-blue-600 text-white font-black py-3 rounded-xl uppercase text-xs shadow-md hover:bg-blue-700 transition"
                        >
                          {isEditingPromoter ? L.p.admin.promoterUpdate : L.p.admin.promoterSave}
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="xl:col-span-3 bg-white rounded-2xl border border-slate-200 overflow-hidden">
                    <div className="px-4 sm:px-5 py-3 border-b border-slate-100 bg-slate-50">
                      <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{L.p.admin.promoterList}</h4>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-left min-w-[320px]">
                        <thead className="border-b border-slate-100 text-[9px] font-black text-slate-400 uppercase tracking-widest">
                          <tr>
                            <th className="px-4 py-3">{L.p.admin.promoterCode}</th>
                            <th className="px-4 py-3">{L.p.admin.promoterName}</th>
                            <th className="px-4 py-3">{L.p.admin.promoterLink}</th>
                            <th className="px-4 py-3 text-right">{L.p.common.edit}</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {(dbPromoters || []).map((pr) => (
                            <tr key={pr.id} className={`hover:bg-slate-50/80 ${!pr.is_active ? 'opacity-50' : ''}`}>
                              <td className="px-4 py-3 font-black text-slate-800 text-xs tracking-wider">{pr.code}</td>
                              <td className="px-4 py-3 font-bold text-slate-700 text-xs">{pr.name}</td>
                              <td className="px-4 py-3">
                                <button
                                  type="button"
                                  onClick={() => copyPromoterLink(pr.code)}
                                  className="text-[9px] font-black uppercase text-blue-600 hover:text-blue-800 bg-blue-50 px-2 py-1 rounded border border-blue-100"
                                >
                                  {L.p.admin.promoterCopy}
                                </button>
                              </td>
                              <td className="px-4 py-3">
                                <div className="flex justify-end gap-1 flex-wrap">
                                  <button
                                    type="button"
                                    onClick={() => { setNewPromoter(pr); setIsEditingPromoter(true); }}
                                    className="bg-blue-50 text-blue-700 px-2 py-1 rounded-lg text-[9px] font-black uppercase hover:bg-blue-100 border border-blue-100"
                                  >
                                    {L.p.common.edit}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={async () => {
                                      await activeSupabase.from('promoters').update({ is_active: !pr.is_active }).eq('id', pr.id);
                                      fetchAllData();
                                    }}
                                    className="bg-slate-50 text-slate-600 px-2 py-1 rounded-lg text-[9px] font-black uppercase hover:bg-slate-100 border border-slate-200"
                                  >
                                    {pr.is_active ? L.p.admin.promoterDeactivate : L.p.admin.promoterActivate}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={async () => {
                                      if (!window.confirm(L.p.admin.promoterDeleteConfirm)) return;
                                      await activeSupabase.from('promoters').delete().eq('id', pr.id);
                                      fetchAllData();
                                    }}
                                    className="bg-red-50 text-red-600 px-2 py-1 rounded-lg text-[9px] font-black uppercase hover:bg-red-100 border border-red-100"
                                  >
                                    {L.p.admin.promoterDelete}
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))}
                          {(!dbPromoters || dbPromoters.length === 0) && (
                            <tr>
                              <td colSpan="4" className="px-4 py-10 text-center text-slate-400 font-bold uppercase text-xs">
                                {L.p.admin.noPromoters}
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}
            </div>
            </>
            )}
          </div>
        )}

      </main>

      {emailPreview && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 z-[99999]">
          <div className="bg-white rounded-t-2xl sm:rounded-3xl w-full max-w-2xl shadow-2xl border max-h-[92dvh] sm:max-h-[90vh] flex flex-col overflow-hidden text-slate-900">
            <div className="bg-blue-50 px-4 sm:px-8 py-3 sm:py-4 border-b border-blue-100 shrink-0 flex justify-between items-start gap-3">
              <div className="min-w-0">
                <p className="text-[10px] font-black uppercase text-blue-600 mb-1">
                  {locale === 'en' ? 'Email preview' : 'Vista previa'} · {emailTemplateTabLabels[emailTemplateTab]}
                </p>
                <h3 className="font-black text-sm sm:text-base uppercase text-slate-800 truncate">{emailPreview.subject}</h3>
                <p className="text-[9px] font-bold text-slate-500 mt-1">
                  {locale === 'en' ? 'Sample data — not sent' : 'Datos de ejemplo — no se envía'}
                </p>
              </div>
              <button onClick={() => setEmailPreview(null)} className="text-slate-400 hover:text-slate-800 text-2xl font-black transition shrink-0">&times;</button>
            </div>
            <div className="p-4 sm:p-6 overflow-y-auto flex-1 space-y-4 min-h-0">
              <div className="rounded-xl border border-slate-200 overflow-hidden bg-slate-50">
                <iframe
                  title={locale === 'en' ? 'Email preview' : 'Vista previa correo'}
                  srcDoc={emailPreview.emailHtml}
                  className="w-full min-h-[320px] sm:min-h-[420px] bg-white border-0"
                  sandbox=""
                />
              </div>
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
                <p className="text-[10px] font-black uppercase text-slate-400 mb-2">SMS</p>
                <p className="text-xs font-bold text-slate-700 leading-relaxed whitespace-pre-wrap">{emailPreview.smsBody}</p>
              </div>
            </div>
            <div className="px-4 sm:px-8 py-3 border-t bg-slate-50 shrink-0">
              <button
                onClick={() => setEmailPreview(null)}
                className="w-full bg-slate-900 text-white font-black py-3 rounded-xl uppercase text-xs hover:bg-slate-800 transition"
              >
                {locale === 'en' ? 'Close' : 'Cerrar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showCancelModal && selectedSlot && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 z-[99999]">
          <div className="bg-white rounded-t-2xl sm:rounded-3xl w-full max-w-md shadow-2xl border overflow-hidden text-slate-900">
            <div className="bg-red-50 px-4 sm:px-8 py-4 border-b border-red-100 flex justify-between items-center">
              <h3 className="font-black text-lg uppercase text-red-700">{L.p.appt.cancelApptTitle}</h3>
              <button onClick={() => { setShowCancelModal(false); setCancelDeductSession(false); }} className="text-slate-400 hover:text-slate-800 text-2xl font-black transition">&times;</button>
            </div>
            <div className="p-4 sm:p-8 space-y-4">
              <p className="text-sm font-bold text-slate-600">{L.p.appt.cancelApptHint}</p>
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
                <span className="block font-black uppercase text-slate-800">{selectedSlot.patient}</span>
                {selectedSlot.phone && (
                  <a href={`tel:${digitsOnly(selectedSlot.phone)}`} className="block text-sm font-bold text-slate-600 mt-1 normal-case">{selectedSlot.phone}</a>
                )}
                <span className="block text-[10px] font-bold text-slate-500 mt-1 uppercase">{selectedSlot.equipment} · {selectedSlot.time} · {selectedSlot.full_date || selectedSlot.fullDate}</span>
              </div>
              <label className="flex items-start gap-3 bg-amber-50 border border-amber-200 p-4 rounded-xl cursor-pointer">
                <input type="checkbox" checked={cancelDeductSession} onChange={e => setCancelDeductSession(e.target.checked)} className="w-4 h-4 mt-0.5" />
                <span className="text-xs font-black uppercase text-amber-900">{L.p.appt.cancelDeductSession}</span>
              </label>
              <div className="flex gap-2 pt-2">
                <button onClick={() => { setShowCancelModal(false); setCancelDeductSession(false); }} className="flex-1 bg-white border border-slate-300 font-black py-3 rounded-xl uppercase text-xs hover:bg-slate-50">{L.p.common.cancel}</button>
                <button onClick={handleCancelAppointment} className="flex-1 bg-red-600 text-white font-black py-3 rounded-xl uppercase text-xs hover:bg-red-700 shadow-md">{L.p.appt.cancelConfirm}</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* CAJA NEGRA: VISOR DE AUDITORÍA DE CITA */}
      {showAudit && (
         <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 z-[99999]">
            <div className="bg-white rounded-t-2xl sm:rounded-3xl w-full max-w-lg shadow-2xl border max-h-[92dvh] sm:max-h-[85vh] flex flex-col overflow-hidden text-slate-900">
               <div className="bg-slate-50 px-4 sm:px-8 py-3 sm:py-5 border-b shrink-0 flex justify-between items-center">
                  <h3 className="font-black text-lg uppercase text-slate-800">👁️ Auditoría</h3>
                  <button onClick={() => setShowAudit(false)} className="text-slate-400 hover:text-slate-800 text-2xl font-black transition">&times;</button>
               </div>
               <div className="p-4 sm:p-8 overflow-y-auto flex-1 space-y-3 min-h-0">
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
        <>
          {!isRescheduling && (
            <div className="fixed inset-0 bg-slate-900/40 z-[9998]" onClick={closeAppointmentPanel} />
          )}
          <div className={`fixed inset-0 sm:inset-y-0 sm:left-auto sm:right-0 h-full w-full sm:max-w-md bg-white shadow-2xl flex flex-col overflow-hidden sm:border-l border-slate-200 text-slate-900 ${isRescheduling ? 'z-[9999]' : 'z-[9999]'}`}>
            <div className="bg-slate-50 px-4 sm:px-8 py-3 sm:py-5 border-b flex justify-between items-center shrink-0">
              <div>
                <h3 className="text-lg font-black text-slate-800 uppercase tracking-tight">
                  {isRescheduling ? L.p.appt.reschedule : L.p.appt.detail}
                </h3>
                {isRescheduling && (
                  <p className="text-[9px] font-bold text-blue-600 uppercase mt-1">{L.p.appt.rescheduleHint}</p>
                )}
              </div>
              <button onClick={closeAppointmentPanel} className="text-slate-400 hover:text-slate-800 text-2xl font-black transition">&times;</button>
            </div>
            
            <div className="p-4 sm:p-8 overflow-y-auto flex-1 space-y-4 sm:space-y-5 min-h-0">
              <div className="flex flex-wrap gap-2 mb-2">
                 {!isRescheduling && !['Finalizado', 'Devuelto', 'No Asistió', 'Falta Justificada'].includes(selectedSlot.check_in_status) && (
                   <>
                     <button onClick={() => updateAppStatus(selectedSlot.id, 'Llegó', selectedSlot.patient, selectedSlot.equipment)} className="bg-amber-100 text-amber-700 px-3 py-1.5 rounded-lg text-[9px] font-black uppercase hover:bg-amber-200 transition">{L.p.appt.arrived}</button>
                     <button onClick={() => updateAppStatus(selectedSlot.id, 'En Sesión', selectedSlot.patient, selectedSlot.equipment)} className="bg-emerald-100 text-emerald-700 px-3 py-1.5 rounded-lg text-[9px] font-black uppercase hover:bg-emerald-200 transition">{L.p.appt.inSession}</button>
                     <button onClick={() => updateAppStatus(selectedSlot.id, 'No Asistió', selectedSlot.patient, selectedSlot.equipment)} className="bg-red-100 text-red-700 px-3 py-1.5 rounded-lg text-[9px] font-black uppercase hover:bg-red-200 transition">{L.p.appt.noShow}</button>
                     <button onClick={() => updateAppStatus(selectedSlot.id, 'Falta Justificada', selectedSlot.patient, selectedSlot.equipment)} className="bg-orange-100 text-orange-700 px-3 py-1.5 rounded-lg text-[9px] font-black uppercase hover:bg-orange-200 transition">{L.p.appt.excused}</button>
                   </>
                 )}
                 
                 {selectedSlot.check_in_status !== 'Finalizado' && selectedSlot.check_in_status !== 'Devuelto' && selectedSlot.check_in_status !== 'Cancelado' && !isRescheduling && (
                     <button onClick={() => { setCancelDeductSession(false); setShowCancelModal(true); }} className="bg-red-100 text-red-700 px-3 py-1.5 rounded-lg text-[9px] font-black uppercase hover:bg-red-200 transition ml-auto border border-red-200">{L.p.appt.cancelAppt}</button>
                 )}
              </div>
              
              <div className="bg-white border border-slate-300 rounded-xl p-4 shadow-sm flex flex-col relative overflow-hidden">
                <span className="font-black text-slate-800 text-lg uppercase pr-6">{selectedSlot.is_new_patient ? '⭐ ' : ''}{selectedSlot.patient}</span>
                <span className="text-[10px] text-blue-600 font-black uppercase tracking-widest">{selectedSlot.protocol}</span>

                <div className="mt-3 bg-slate-50 border border-slate-200 p-3 rounded-xl space-y-3">
                  <label className="text-[10px] font-black uppercase text-slate-500">{L.p.appt.contactSection}</label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="text-[9px] font-black uppercase text-slate-400 mb-1 block">{L.p.appt.phone}</label>
                      <input
                        type="tel"
                        value={selectedSlot.phone || ''}
                        onChange={e => setSelectedSlot({ ...selectedSlot, phone: e.target.value })}
                        className="w-full p-2 border border-slate-200 rounded-lg text-xs font-bold outline-none bg-white text-slate-900"
                        placeholder={L.p.appt.noPhone}
                      />
                    </div>
                    <div>
                      <label className="text-[9px] font-black uppercase text-slate-400 mb-1 block">{L.p.appt.email}</label>
                      <input
                        type="email"
                        value={selectedSlot.email || ''}
                        onChange={e => setSelectedSlot({ ...selectedSlot, email: e.target.value })}
                        className="w-full p-2 border border-slate-200 rounded-lg text-xs font-bold outline-none bg-white text-slate-900"
                        placeholder={L.p.appt.noEmail}
                      />
                    </div>
                  </div>
                  <div className="rounded-xl border-2 border-indigo-300 bg-indigo-50 p-3 space-y-2">
                    <p className="text-[10px] font-black uppercase text-indigo-900">{L.p.appt.notifyPrefsTitle}</p>
                    <p className="text-[8px] font-bold text-indigo-800/90">{L.p.appt.notifyPrefsHint}</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <label className="flex items-center gap-2 rounded-lg border border-indigo-200 bg-white px-3 py-2 text-[9px] font-black uppercase text-indigo-900">
                        <input type="checkbox" checked={selectedSlot.prefers_sms !== false} onChange={e => setSelectedSlot({ ...selectedSlot, prefers_sms: e.target.checked })} className="w-4 h-4 shrink-0" />
                        {L.modals.patient.receiveSms}
                      </label>
                      <label className="flex items-center gap-2 rounded-lg border border-indigo-200 bg-white px-3 py-2 text-[9px] font-black uppercase text-indigo-900">
                        <input type="checkbox" checked={selectedSlot.prefers_email !== false} onChange={e => setSelectedSlot({ ...selectedSlot, prefers_email: e.target.checked })} className="w-4 h-4 shrink-0" />
                        {L.modals.patient.receiveEmail}
                      </label>
                    </div>
                  </div>
                  <p className="text-[8px] text-slate-500 font-bold uppercase">{L.p.appt.contactHint}</p>
                </div>
                
                <div className="mt-4 space-y-3">
                   <div className="bg-amber-50 border border-amber-200 p-3 rounded-xl">
                      <label className="text-[10px] font-black uppercase text-amber-800 flex items-center gap-1 mb-1">{L.p.appt.notePermanent}</label>
                      <textarea 
                        value={selectedSlot.patientNotes || ''} 
                        onChange={e => setSelectedSlot({...selectedSlot, patientNotes: e.target.value})}
                        className="w-full p-2 border border-amber-200 rounded-lg text-xs font-bold outline-none bg-white text-amber-900"
                        rows="2" placeholder={L.p.appt.notePermanentPh}
                      />
                   </div>
                   <div className="bg-blue-50 border border-blue-200 p-3 rounded-xl">
                      <label className="text-[10px] font-black uppercase text-blue-800 flex items-center gap-1 mb-1">{L.p.appt.noteToday}</label>
                      <textarea 
                        value={selectedSlot.notes || ''} 
                        onChange={e => setSelectedSlot({...selectedSlot, notes: e.target.value})}
                        className="w-full p-2 border border-blue-200 rounded-lg text-xs font-bold outline-none bg-white text-blue-900"
                        rows="2" placeholder={L.p.appt.noteTodayPh}
                      />
                   </div>
                   <button onClick={async () => {
                      try {
                        const contactResult = await persistPatientContactFromSlot(selectedSlot);
                        if (contactResult.error) return alert(staffAlert(locale, 'patientFileError', contactResult.error.message));

                        await activeSupabase.from('appointments').update({
                          notes: selectedSlot.notes,
                          phone: contactResult.phone || selectedSlot.phone || '',
                          email: contactResult.email || selectedSlot.email || '',
                        }).eq('id', selectedSlot.id);

                        alert(a('notesSavedOk'));
                        fetchAllData();
                      } catch(e) { alert(a('notesSaveError')); }
                   }} className="w-full bg-slate-800 text-white font-black py-2 rounded-lg text-[10px] uppercase hover:bg-slate-700 shadow-sm transition">{L.p.appt.saveNotesAndContact}</button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {isRescheduling ? (
                  <>
                    <div className="col-span-1 sm:col-span-2 bg-blue-50 border border-blue-200 p-4 rounded-xl space-y-3">
                      <div>
                        <label className="block text-[8px] font-black text-blue-700 uppercase mb-1">Servicio / Cámara</label>
                        <select
                          value={selectedSlot.equipment || ''}
                          onChange={e => {
                            const srv = dbServices.find(s => s.name === e.target.value);
                            const dur = srv ? Number(srv.duration) || 60 : Number(selectedSlot.duration) || 60;
                            const buf = srv ? Number(srv.buffer ?? 30) : Number(selectedSlot.buffer ?? 30);
                            setSelectedSlot({
                              ...selectedSlot,
                              equipment: e.target.value,
                              duration: dur,
                              buffer: buf,
                              sessionPreset: getPresetFromTimes(dur, buf).id,
                              serviceId: srv?.id ?? selectedSlot.serviceId,
                              time: '',
                            });
                          }}
                          className="w-full p-3 border border-blue-200 rounded-xl font-bold uppercase outline-none text-slate-900 bg-white text-sm"
                        >
                          {(dbServices || []).filter(s => s.is_active).map(s => (
                            <option key={s.id} value={s.name}>{s.name}</option>
                          ))}
                        </select>
                      </div>
                      <StaffBookingOverrides
                        compact
                        slot={selectedSlot}
                        labels={L.p.appt}
                        blockMins={(Number(selectedSlot.duration) || 60) + (Number(selectedSlot.buffer) || 0)}
                        onOutsideHoursChange={(checked) => setSelectedSlot(applyOutsideHours(selectedSlot, checked))}
                        onExtendedChange={(checked) => setSelectedSlot(applyExtendedSession(selectedSlot, checked))}
                      />
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="min-w-0">
                          <label className="block text-[8px] font-black text-blue-700 uppercase mb-1">Fecha</label>
                          <input
                            type="date"
                            value={selectedSlot.fullDate || selectedSlot.full_date || ''}
                            onChange={e => {
                              const d = new Date(e.target.value + 'T12:00:00');
                              setCurrentDate(d);
                              setViewMode('Día');
                              setSelectedSlot({
                                ...selectedSlot,
                                fullDate: e.target.value,
                                full_date: e.target.value,
                                day: getDayNameFromDate(locale, d)
                              });
                            }}
                            className="w-full min-w-0 max-w-full p-2.5 sm:p-3 border border-blue-200 rounded-xl font-bold outline-none text-slate-900 bg-white text-sm box-border"
                          />
                        </div>
                        <div className="min-w-0">
                          <label className="block text-[8px] font-black text-blue-700 uppercase mb-1">Hora</label>
                          <select
                            value={selectedSlot.time || ''}
                            onChange={e => setSelectedSlot({ ...selectedSlot, time: e.target.value })}
                            className="w-full min-w-0 p-2.5 sm:p-3 border border-blue-200 rounded-xl font-bold outline-none text-slate-900 bg-white text-sm"
                          >
                            <option value="">Hora...</option>
                            {appointmentTimeOptions.map(t => <option key={t} value={t}>{t}</option>)}
                          </select>
                        </div>
                      </div>
                      <p className="text-[8px] font-bold text-blue-600 uppercase">Consulta el calendario a la izquierda antes de confirmar</p>
                    </div>
                    <div className="col-span-1 sm:col-span-2 flex flex-col sm:flex-row gap-2 sm:gap-3">
                      <button onClick={() => setIsRescheduling(false)} className="flex-1 bg-white border border-slate-300 font-black py-3 rounded-xl uppercase text-[10px] hover:bg-slate-50 transition">Cancelar</button>
                      <button onClick={handleRescheduleSubmit} className="flex-1 bg-blue-600 text-white font-black py-3 rounded-xl uppercase text-[10px] shadow-lg hover:bg-blue-700 transition">Confirmar cambios</button>
                    </div>
                  </>
                ) : (
                  <>
                    <div
                      role={canRescheduleAppointment ? 'button' : undefined}
                      tabIndex={canRescheduleAppointment ? 0 : undefined}
                      onClick={() => canRescheduleAppointment && startReschedule()}
                      onKeyDown={(e) => { if (canRescheduleAppointment && (e.key === 'Enter' || e.key === ' ')) startReschedule(); }}
                      className={`bg-slate-50 p-3 rounded-xl border border-slate-200 ${canRescheduleAppointment ? 'cursor-pointer hover:border-blue-400 hover:bg-blue-50/60 transition' : ''}`}
                      title={canRescheduleAppointment ? 'Clic para reprogramar fecha' : undefined}
                    >
                      <span className="block text-[8px] font-black text-slate-400 uppercase">Fecha</span>
                      <span className="text-base font-black text-slate-700 block">{selectedSlot.full_date || selectedSlot.fullDate}</span>
                    </div>
                    <div
                      role={canRescheduleAppointment ? 'button' : undefined}
                      tabIndex={canRescheduleAppointment ? 0 : undefined}
                      onClick={() => canRescheduleAppointment && startReschedule()}
                      onKeyDown={(e) => { if (canRescheduleAppointment && (e.key === 'Enter' || e.key === ' ')) startReschedule(); }}
                      className={`bg-slate-50 p-3 rounded-xl border border-slate-200 ${canRescheduleAppointment ? 'cursor-pointer hover:border-blue-400 hover:bg-blue-50/60 transition' : ''}`}
                      title={canRescheduleAppointment ? 'Clic para reprogramar hora' : undefined}
                    >
                      <span className="block text-[8px] font-black text-slate-400 uppercase">Hora de Inicio</span>
                      <span className="text-base font-black text-slate-700 block">{selectedSlot.time}</span>
                    </div>
                    <div className="col-span-1 sm:col-span-2 bg-slate-50 p-3 rounded-xl border border-slate-200">
                      <span className="block text-[8px] font-black text-slate-400 uppercase">
                        {getPresetFromTimes(selectedSlot.duration, selectedSlot.buffer).shortLabel} · {selectedSlot.equipment}
                      </span>
                      <span className="text-base font-black text-blue-600">
                        {calculateEndTime(selectedSlot.time, selectedSlot.duration)}
                        <span className="text-[9px] font-bold text-slate-400 ml-1">
                          (bloque {(Number(selectedSlot.duration) || 60) + (Number(selectedSlot.buffer) || 0)} min)
                        </span>
                      </span>
                    </div>
                  </>
                )}
              </div>

              {!isRescheduling && (
              <>
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
                      if(!selectedSlot.attendant || selectedSlot.attendant === 'Por Asignar') return alert(a('selectAttendant'));
                      setShowBitacora(true);
                   }} className="flex-1 bg-blue-600 text-white py-4 rounded-2xl font-black uppercase text-[10px] shadow-lg hover:bg-blue-700 transition">Bitácora Médica</button>
                )}
                <button onClick={() => printPatientBitacora(selectedSlot.patient)} className="w-full bg-slate-800 text-white py-3 rounded-2xl font-black uppercase text-[10px] hover:bg-slate-700 transition mt-2">🖨️ Imprimir Historial Completo (Firmas)</button>
              </div>
              
              <button onClick={() => loadAuditLogs(selectedSlot.id)} className="w-full text-slate-400 py-2 rounded-2xl font-black uppercase text-[9px] hover:text-slate-600 transition mt-1 underline">👁️ Ver Caja Negra (Auditoría)</button>

              <button
                type="button"
                onClick={() => notifyPatientFromSlot(selectedSlot, { showSuccess: true })}
                className="w-full bg-indigo-50 text-indigo-800 border border-indigo-200 py-3 rounded-2xl font-black uppercase text-[10px] hover:bg-indigo-100 transition mt-2"
              >
                {L.p.appt.sendInstructions}
              </button>
              </>
              )}
            </div>
          </div>
        </>
      )}
      
      {/* CREAR NUEVA CITA FORMULARIO */}
      {showNewAppointment && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 z-50" style={{ zIndex: 9999 }}>
          <div className="bg-white rounded-t-2xl sm:rounded-3xl max-w-md w-full max-h-[92dvh] sm:max-h-[85vh] flex flex-col shadow-2xl border overflow-hidden text-slate-900">
            <div className="bg-slate-50 px-4 sm:px-8 py-3 sm:py-5 border-b shrink-0 flex justify-between items-center gap-2">
               <div className="min-w-0">
                 <h3 className="text-base sm:text-xl font-black uppercase text-emerald-600 truncate">{selectedSlot?.status === 'booked' ? 'Editar Cita' : 'Registrar Cita'}</h3>
                 <p className="text-[8px] font-bold uppercase text-slate-400 mt-0.5">v{buildSha}</p>
               </div>
               <button onClick={() => {setShowNewAppointment(false); setSelectedSlot(null);}} className="text-slate-400 hover:text-slate-800 text-2xl font-black transition">&times;</button>
            </div>

            <div className="shrink-0 px-4 sm:px-8 py-3 border-b bg-white space-y-2">
              <div className="min-w-0">
                <label className="text-[10px] font-black uppercase text-slate-500">Paciente</label>
                <PatientSearchInput
                  patients={dbPatients}
                  value={selectedSlot?.patient || ''}
                  selectedPatientId={selectedSlot?.patientId || null}
                  placeholder={L.p.appt.searchPatient}
                  selectedLabel={L.p.appt.patientSelected}
                  pickHint={L.p.appt.pickPatientHint}
                  className="w-full p-3 border border-slate-300 rounded-xl font-bold uppercase outline-none focus:border-emerald-500 text-slate-900 bg-white mt-1"
                  onQueryChange={(pName) => {
                    const exact = dbPatients.find(x => normalizeStr(x.patient) === normalizeStr(pName));
                    setSelectedSlot({
                      ...(selectedSlot || createEmptyAppointmentDraft()),
                      patient: pName,
                      patientId: exact?.id || null,
                      phone: exact ? exact.phone : (selectedSlot?.phone || ''),
                      email: exact ? exact.email : (selectedSlot?.email || ''),
                      protocol: exact ? exact.protocol : (selectedSlot?.protocol || ''),
                      patientNotes: exact ? exact.notes : (selectedSlot?.patientNotes || ''),
                      prefers_email: exact ? exact.prefers_email !== false : selectedSlot?.prefers_email !== false,
                      prefers_sms: exact ? exact.prefers_sms !== false : selectedSlot?.prefers_sms !== false,
                    });
                  }}
                  onSelectPatient={(p) => {
                    setSelectedSlot({
                      ...(selectedSlot || createEmptyAppointmentDraft()),
                      patient: p.patient,
                      patientId: p.id,
                      phone: p.phone || '',
                      email: p.email || '',
                      protocol: p.protocol || '',
                      patientNotes: p.notes || '',
                      prefers_email: p.prefers_email !== false,
                      prefers_sms: p.prefers_sms !== false,
                    });
                  }}
                />
              </div>
              {!selectedSlot?.patient?.trim() && (
                <p className="text-[10px] font-bold uppercase text-slate-500">{L.p.appt.pickPatientHint}</p>
              )}
            </div>
            
            <div className="p-4 sm:p-8 overflow-y-auto flex-1 space-y-3 sm:space-y-4 min-h-0">
              {selectedSlot?.patient?.trim() ? (
                <div className="rounded-xl border-2 border-indigo-500 bg-indigo-50/90 p-3 space-y-3 shadow-sm">
                  <p className="text-[10px] font-black uppercase text-indigo-900">{L.p.appt.notifyPrefsTitle}</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <div>
                      <label className="text-[9px] font-black uppercase text-slate-500">{L.p.appt.phone}</label>
                      <input type="tel" value={selectedSlot?.phone || ''} onChange={e => setSelectedSlot({...selectedSlot, phone: e.target.value})} placeholder="7135913379" className="w-full p-2 border border-slate-200 rounded-lg font-bold text-xs outline-none text-slate-900 bg-white mt-0.5" />
                    </div>
                    <div>
                      <label className="text-[9px] font-black uppercase text-slate-500">{L.p.appt.email}</label>
                      <input type="email" value={selectedSlot?.email || ''} onChange={e => setSelectedSlot({...selectedSlot, email: e.target.value})} placeholder="correo@ejemplo.com" className="w-full p-2 border border-slate-200 rounded-lg font-bold text-xs outline-none text-slate-900 bg-white mt-0.5" />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <label className="flex items-center gap-2 rounded-lg border-2 border-indigo-300 bg-white px-3 py-2 text-[10px] font-black uppercase text-indigo-900">
                      <input type="checkbox" checked={selectedSlot?.prefers_sms !== false} onChange={e => setSelectedSlot({...selectedSlot, prefers_sms: e.target.checked})} className="w-4 h-4 shrink-0" />
                      {L.modals.patient.receiveSms}
                    </label>
                    <label className="flex items-center gap-2 rounded-lg border-2 border-indigo-300 bg-white px-3 py-2 text-[10px] font-black uppercase text-indigo-900">
                      <input type="checkbox" checked={selectedSlot?.prefers_email !== false} onChange={e => setSelectedSlot({...selectedSlot, prefers_email: e.target.checked})} className="w-4 h-4 shrink-0" />
                      {L.modals.patient.receiveEmail}
                    </label>
                  </div>
                </div>
              ) : null}
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
              
              {!isNewPatientInline && selectedSlot?.patient && (
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
                  if(srv) {
                    const extended = !!selectedSlot?.extended_session;
                    if (extended) {
                      setSelectedSlot({
                        ...(selectedSlot || createEmptyAppointmentDraft()),
                        serviceId: sid,
                        equipment: srv.name,
                        time: '',
                      });
                    } else {
                      const dur = Number(srv.duration) || 60;
                      const buf = Number(srv.buffer ?? 30);
                      setSelectedSlot({
                        ...(selectedSlot || createEmptyAppointmentDraft()),
                        serviceId: sid,
                        equipment: srv.name,
                        duration: dur,
                        buffer: buf,
                        sessionPreset: getPresetFromTimes(dur, buf).id,
                        time: '',
                      });
                    }
                  }
                }} className="w-full min-w-0 p-2.5 sm:p-3 border rounded-xl font-bold outline-none focus:border-emerald-500 text-slate-900 bg-white text-sm">
                  <option value="">Selecciona un servicio...</option>
                  {(dbServices || []).filter(s => s.is_active).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>

              <StaffBookingOverrides
                slot={selectedSlot}
                labels={L.p.appt}
                blockMins={selectedBlockMins}
                onOutsideHoursChange={(checked) => setSelectedSlot(applyOutsideHours(selectedSlot, checked))}
                onExtendedChange={(checked) => setSelectedSlot(applyExtendedSession(selectedSlot, checked))}
              />

              <div>
                <label className="text-[10px] font-black uppercase text-slate-400">Instrucciones para la sesión de hoy</label>
                <textarea 
                    value={selectedSlot?.notes || ''} 
                    onChange={e => setSelectedSlot({...selectedSlot, notes: e.target.value})} 
                    placeholder="Ej. Subir presión despacio, dolor de oído reciente..."
                    className="w-full p-2.5 sm:p-3 border rounded-xl font-bold text-sm outline-none focus:border-emerald-500 mt-1 bg-blue-50 text-blue-900 border-blue-200"
                    rows="2"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pb-2">
                <div className="min-w-0">
                  <label className="text-[10px] font-black uppercase text-slate-400">Fecha</label>
                  <input type="date" value={selectedSlot?.fullDate || currentFullDate} onChange={e => { 
                    const d = new Date(e.target.value + 'T12:00:00'); 
                    setSelectedSlot({
                      ...(selectedSlot || {}), 
                      fullDate: e.target.value, 
                      day: getDayNameFromDate(locale, d)
                    }); 
                  }} className="w-full min-w-0 max-w-full p-2.5 sm:p-3 border rounded-xl font-bold outline-none text-slate-900 bg-white text-sm box-border" />
                </div>
                <div className="min-w-0">
                  <label className="text-[10px] font-black uppercase text-slate-400">Hora</label>
                  <select value={selectedSlot?.time || ''} onChange={e => { 
                    setSelectedSlot({
                      ...(selectedSlot || {}), 
                      time: e.target.value
                    });
                  }} className="w-full min-w-0 p-2.5 sm:p-3 border rounded-xl font-bold outline-none text-slate-900 bg-white text-sm">
                    <option value="">Hora...</option>
                    {appointmentTimeOptions.map(t => <option key={t} value={t}>{t}</option>)}
                    {appointmentTimeOptions.length === 0 && <option value="" disabled>Sin horario para este equipo</option>}
                  </select>
                </div>
              </div>
            </div>

            <div className="bg-slate-50 px-4 sm:px-8 py-3 sm:py-5 border-t shrink-0 flex flex-col sm:flex-row gap-2 sm:gap-3 text-slate-900">
              <button onClick={() => {setShowNewAppointment(false); setSelectedSlot(null);}} className="w-full sm:w-1/3 bg-white border border-slate-300 font-black py-3 sm:py-4 rounded-xl uppercase text-xs hover:bg-slate-50 transition">Cancelar</button>
              <button onClick={async () => {
                try {
                  if(!selectedSlot?.patient || !selectedSlot?.equipment || !selectedSlot?.time) return alert(staffAlert(locale, 'missingData'));
                  const apptDate = selectedSlot.fullDate || selectedSlot.full_date || currentFullDate;
                  if (isPastTime(apptDate, selectedSlot.time) && selectedSlot.status !== 'booked') return alert(staffAlert(locale, 'pastSchedule'));
                  const existingP = dbPatients.find(x => normalizeStr(x.patient) === normalizeStr(selectedSlot.patient));
                  if (existingP && existingP.is_blocked) return alert(staffAlert(locale, 'patientBlockedShort'));
                  if (checkOverlap(
                    selectedSlot.equipment,
                    apptDate,
                    selectedSlot.time,
                    resolveSessionTimes(selectedSlot).duration,
                    resolveSessionTimes(selectedSlot).buffer,
                    selectedSlot.id
                  )) return alert(staffAlert(locale, 'overlap'));

                  let canonicalPatient = selectedSlot.patient.trim();
                  const resolvedContact = resolveSlotContact(selectedSlot);
                  let canonicalPhone = resolvedContact.phone;
                  let canonicalEmail = resolvedContact.email;
                  let isNewForAppointment = !!(selectedSlot.is_new_patient || isNewPatientInline);

                  const phoneDigits = digitsOnly(canonicalPhone).slice(-10);
                  if (phoneDigits.length === 10) {
                    const ensured = await ensurePatient(activeSupabase, {
                      name: canonicalPatient,
                      phone: canonicalPhone,
                      email: canonicalEmail,
                      protocol: selectedSlot.protocol || 'Wellness',
                      notes: selectedSlot.patientNotes || '',
                      prefers_email: selectedSlot.prefers_email !== false,
                      prefers_sms: selectedSlot.prefers_sms !== false,
                    });
                    if (ensured.error) return alert(staffAlert(locale, 'patientFileError', ensured.error.message));
                    canonicalPatient = ensured.displayName;
                    canonicalPhone = ensured.phone;
                    canonicalEmail = ensured.email;
                    if (ensured.isNew) isNewForAppointment = true;
                  } else if (isNewPatientInline && !selectedSlot.id) {
                    return alert(staffAlert(locale, 'phoneRequired'));
                  } else if (!isNewPatientInline) {
                    const contactResult = await persistPatientContactFromSlot(selectedSlot);
                    if (contactResult.error) return alert(staffAlert(locale, 'patientFileError', contactResult.error.message));
                    if (contactResult.phone) canonicalPhone = contactResult.phone;
                    if (contactResult.email) canonicalEmail = contactResult.email;
                    if (contactResult.patient) canonicalPatient = contactResult.patient;
                  }

                  const sessionTimes = resolveSessionTimes(selectedSlot);
                  const payload = {
                    patient: canonicalPatient,
                    phone: canonicalPhone,
                    email: canonicalEmail,
                    protocol: selectedSlot.protocol || 'Wellness',
                    equipment: selectedSlot.equipment,
                    duration: sessionTimes.duration,
                    buffer: sessionTimes.buffer,
                    full_date: apptDate,
                    appointment_date: apptDate,
                    day: selectedSlot.day || currentDayInfo.name,
                    time: selectedSlot.time,
                    appointment_time: selectedSlot.time,
                    attendant: selectedSlot.attendant || 'Por Asignar',
                    check_in_status: selectedSlot.check_in_status || 'Agendado',
                    is_new_patient: isNewForAppointment,
                    notes: selectedSlot.notes || '',
                    outside_normal_hours: !!selectedSlot.outside_normal_hours,
                    is_extended_block: isExtendedSession(selectedSlot),
                  };
                  const { data: na, error } = await insertStaffAppointment(activeSupabase, payload);
                  if (error) return alert(a('genericError', error.message));
                  if (na && na[0]) {
                    const flags = [
                      selectedSlot.outside_normal_hours ? L.p.appt.badgeOutsideHours : '',
                      isExtendedSession(selectedSlot) ? L.p.appt.badgeExtended : '',
                    ].filter(Boolean).join(' · ');
                    await logAudit(na[0].id, payload.patient, 'CREACIÓN', `${payload.time}${flags ? ` (${flags})` : ''}`);
                    const patientNotifyResult = await notifyPatientFromSlot({
                      ...payload,
                      id: na[0].id,
                      full_date: apptDate,
                      fullDate: apptDate,
                      phone: canonicalPhone,
                      email: canonicalEmail,
                      prefers_email: selectedSlot.prefers_email ?? resolvedContact.prefers_email,
                      prefers_sms: selectedSlot.prefers_sms ?? resolvedContact.prefers_sms,
                      is_new_patient: isNewForAppointment,
                    }, { reportResult: true, forceNotify: true });
                    const staffNotifyResult = await alertStaffNewBooking({
                      ...payload,
                      full_date: apptDate,
                      fullDate: apptDate,
                      phone: canonicalPhone,
                      email: canonicalEmail,
                    }, { source: 'staff' });
                    const notifySummary = formatBookingNotifyFeedback({
                      patientResult: patientNotifyResult,
                      staffResult: staffNotifyResult,
                      locale,
                    });
                    alert(notifyHadFailure(patientNotifyResult?.report)
                      ? a('notifyFailed', notifySummary || (locale === 'en' ? 'Appointment saved.' : 'Cita guardada.'))
                      : a('notifySent', notifySummary || (locale === 'en' ? 'Appointment saved.' : 'Cita guardada.')));
                  }
                  setShowNewAppointment(false);
                  setSelectedSlot(null);
                  fetchAllData();
                } catch (e) { alert(a('connectionErrorMsg', e?.message || String(e))); }
              }} className="w-full sm:flex-1 bg-emerald-600 text-white font-black py-3 sm:py-4 rounded-xl uppercase text-xs shadow-lg hover:bg-emerald-700 transition">Agendar Espacio</button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL ALTA RÁPIDA (SOLO GUARDAR CLIENTE) */}
      {showNewPatientModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 z-50" style={{ zIndex: 9999 }}>
          <div className="bg-white rounded-t-2xl sm:rounded-3xl max-w-sm w-full max-h-[92dvh] sm:max-h-[85vh] flex flex-col shadow-2xl border overflow-hidden">
            <div className="bg-slate-50 px-4 sm:px-8 py-3 sm:py-5 border-b shrink-0 flex justify-between items-center">
               <h3 className="text-base sm:text-xl font-black uppercase text-emerald-600">Alta Rápida</h3>
               <button onClick={() => setShowNewPatientModal(false)} className="text-slate-400 hover:text-slate-800 text-2xl font-black transition">&times;</button>
            </div>
            
            <div className="p-4 sm:p-8 overflow-y-auto flex-1 space-y-3 sm:space-y-4 min-h-0">
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
              <div className="flex flex-col sm:flex-row gap-3 sm:gap-4">
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

            <div className="bg-slate-50 px-4 sm:px-8 py-3 sm:py-5 border-t shrink-0 flex flex-col sm:flex-row gap-2 sm:gap-2">
              <button onClick={async () => {
                const trimmedName = newPatientData.name.trim();
                if (!trimmedName) return alert(a('nameRequired'));
                
                const { error } = await savePatientToDB(activeSupabase, {
                    name: trimmedName,
                    phone: newPatientData.phone.trim(),
                    email: newPatientData.email.trim(),
                    protocol: newPatientData.protocol,
                    notes: newPatientData.notes,
                    prefers_email: newPatientData.prefers_email,
                    prefers_sms: newPatientData.prefers_sms
                });
                
                if (error && error.message === "CLON_DETECTADO") return alert(a('cloneDetected'));
                if (error) return alert(a('saveClientError', error.message)); 
                
                setShowNewPatientModal(false); 
                setNewPatientData({ name: '', phone: '', email: '', protocol: 'Wellness', notes: '', prefers_email: true, prefers_sms: true }); 
                await fetchAllData(); 
              }} className="w-full sm:w-1/2 bg-white border border-slate-300 text-slate-700 font-black py-3 sm:py-4 rounded-xl uppercase text-[10px] shadow-sm hover:bg-slate-50">Solo Guardar</button>
              
              <button onClick={async () => {
                const trimmedName = newPatientData.name.trim();
                if (!trimmedName) return alert(a('nameRequired'));
                
                const { error } = await savePatientToDB(activeSupabase, {
                    name: trimmedName,
                    phone: newPatientData.phone.trim(),
                    email: newPatientData.email.trim(),
                    protocol: newPatientData.protocol,
                    notes: newPatientData.notes,
                    prefers_email: newPatientData.prefers_email,
                    prefers_sms: newPatientData.prefers_sms
                });
                
                if (error && error.message === "CLON_DETECTADO") return alert(a('cloneDetected'));
                if (error) return alert(a('saveClientError', error.message)); 
                
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
              }} className="w-full sm:w-1/2 bg-emerald-600 text-white font-black py-3 sm:py-4 rounded-xl uppercase text-[10px] shadow-lg hover:bg-emerald-700">Guardar y Agendar</button>
            </div>
          </div>
        </div>
      )}

      {showOOOModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 z-50" style={{ zIndex: 9999 }}>
          <div className="bg-white rounded-t-2xl sm:rounded-3xl max-w-sm w-full max-h-[92dvh] sm:max-h-[85vh] flex flex-col border-t-8 border-red-500 shadow-2xl overflow-hidden text-slate-900">
            <div className="bg-slate-50 px-4 sm:px-8 py-3 sm:py-5 border-b shrink-0 flex justify-between items-center">
              <h3 className="text-base sm:text-xl font-black uppercase text-red-600">🚫 Bloquear Agenda</h3>
              <button onClick={() => setShowOOOModal(false)} className="text-slate-400 hover:text-slate-800 text-2xl font-black transition">&times;</button>
            </div>
            
            <div className="p-4 sm:p-8 overflow-y-auto flex-1 space-y-3 sm:space-y-4 min-h-0">
              <div>
                <label className="text-[10px] font-black uppercase text-slate-400 ml-1">Fecha a bloquear</label>
                <input type="date" value={oooData.date} onChange={e => setOOOData({...oooData, date: e.target.value})} className="w-full p-3 border rounded-xl font-bold text-sm outline-none text-slate-900 bg-white" />
              </div>
              <div className="flex flex-col sm:flex-row gap-3">
                <div className="flex-1 min-w-0">
                  <label className="text-[10px] font-black text-slate-400 uppercase ml-1">Desde</label>
                  <input type="time" value={oooData.start_time} onChange={e => setOOOData({...oooData, start_time: e.target.value})} className="w-full min-w-0 p-2.5 sm:p-3 border rounded-xl font-bold outline-none text-slate-900 bg-white text-sm" />
                </div>
                <div className="flex-1 min-w-0">
                  <label className="text-[10px] font-black text-slate-400 uppercase ml-1">Hasta</label>
                  <input type="time" value={oooData.end_time} onChange={e => setOOOData({...oooData, end_time: e.target.value})} className="w-full min-w-0 p-2.5 sm:p-3 border rounded-xl font-bold outline-none text-slate-900 bg-white text-sm" />
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
            
            <div className="bg-slate-50 px-4 sm:px-8 py-3 sm:py-5 border-t shrink-0 flex flex-col sm:flex-row gap-2 sm:gap-3">
              <button onClick={() => setShowOOOModal(false)} className="w-full sm:w-1/3 bg-white border border-slate-300 font-black py-3 sm:py-4 rounded-xl uppercase text-xs hover:bg-slate-50">Cancelar</button>
              <button onClick={async () => {
                if (!oooData.date) return alert(a('selectDate'));
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
              }} className="w-full sm:flex-1 bg-red-600 text-white font-black py-3 sm:py-4 rounded-xl uppercase text-xs shadow-lg hover:bg-red-700">Aplicar Bloqueo</button>
            </div>
          </div>
        </div>
      )}

      {moveConfirmation && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 z-[10000]">
          <div className="bg-white rounded-t-2xl sm:rounded-3xl max-w-md w-full p-4 sm:p-8 shadow-2xl text-slate-900 max-h-[92dvh] overflow-y-auto">
            <h3 className="text-lg sm:text-xl font-black mb-4 uppercase text-center">⚠️ Confirmar Reprogramación</h3>
            <p className="text-sm font-bold text-slate-500 mb-4 text-center">
              Reubicar a <span className="text-slate-800 uppercase">{moveConfirmation.app.patient}</span>
            </p>
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 mb-6 space-y-3 text-left">
              <div>
                <span className="text-[9px] font-black uppercase text-slate-400 block mb-1">Actual</span>
                <p className="text-sm font-bold text-slate-700">{moveConfirmation.app.full_date} • {moveConfirmation.app.time}</p>
                <p className="text-xs font-black text-slate-500 uppercase">{moveConfirmation.app.equipment}</p>
              </div>
              <div className="text-center text-slate-400 font-black text-lg">↓</div>
              <div>
                <span className="text-[9px] font-black uppercase text-blue-600 block mb-1">Nuevo</span>
                <p className="text-sm font-bold text-blue-800">{moveConfirmation.newFullDate} • {moveConfirmation.newTime}</p>
                <p className="text-xs font-black text-blue-600 uppercase">{moveConfirmation.newEquipment}</p>
              </div>
            </div>
            <div className="flex flex-col sm:flex-row gap-2 sm:space-x-3 sm:gap-0">
              <button onClick={() => setMoveConfirmation(null)} className="w-full sm:flex-1 bg-slate-100 font-black py-3 sm:py-4 rounded-2xl uppercase text-xs hover:bg-slate-200">Cancelar</button>
              <button onClick={confirmMove} className="w-full sm:flex-1 bg-blue-600 text-white font-black py-3 sm:py-4 rounded-2xl uppercase text-xs shadow-lg hover:bg-blue-700">Confirmar</button>
            </div>
          </div>
        </div>
      )}

      {showPatientProfile && selectedSlot && (
        <div className="relative z-50" style={{ zIndex: 9999 }}>
          <PatientProfileModal 
            initialData={(() => {
              const profilePatient = dbPatients.find((x) => normalizeStr(x.patient) === normalizeStr(selectedSlot.patient));
              return {
                ...selectedSlot,
                ...profilePatient,
                id: profilePatient?.id || selectedSlot.patientId || null,
                patientId: profilePatient?.id || selectedSlot.patientId || null,
                patient: profilePatient?.patient || selectedSlot.patient,
                phone: profilePatient?.phone || selectedSlot.phone || '',
                email: profilePatient?.email || selectedSlot.email || '',
                patientNotes: profilePatient?.notes || selectedSlot.patientNotes || '',
                prefers_email: profilePatient?.prefers_email !== false && selectedSlot.prefers_email !== false,
                prefers_sms: profilePatient?.prefers_sms !== false && selectedSlot.prefers_sms !== false,
              };
            })()}
            servicios={dbServices} 
            companyConfig={dbCompanyConfig}
            currentUserLevel={currentUserLevel}
            onClose={() => setShowPatientProfile(false)} 
            onSave={async (ud) => {
              const activeSupabase = activeClinic === 'Shenandoah' ? supabaseShenandoah : supabaseGdl;
              const patientDbId = ud.id || selectedSlot.patientId;
              if (patientDbId) {
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
                let res = await activeSupabase.from('patients').update(p).eq('id', patientDbId);

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
                  }).eq('id', patientDbId);
                }
              } else if (digitsOnly(ud.phone).slice(-10).length === 10) {
                await ensurePatient(activeSupabase, {
                  name: ud.patient,
                  phone: ud.phone,
                  email: ud.email || '',
                  protocol: ud.protocol,
                  notes: ud.notes || '',
                  prefers_email: ud.prefers_email,
                  prefers_sms: ud.prefers_sms,
                });
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

      {/* Navegación inferior móvil — iconos */}
      {currentUser && (
        <>
          {mobileMoreOpen && (
            <div className="lg:hidden fixed inset-0 z-[60] bg-slate-900/50" onClick={() => setMobileMoreOpen(false)} />
          )}
          {mobileMoreOpen && mobileAdminTabs.length > 0 && (
            <div className="lg:hidden fixed bottom-[calc(3.5rem+env(safe-area-inset-bottom))] inset-x-2 z-[70] bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl p-2">
              {mobileAdminTabs.map(tab => (
                <button
                  key={tab.id}
                  onClick={() => selectTab(tab.id)}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold ${activeTab === tab.id ? 'bg-blue-600/30 text-blue-300' : 'text-slate-300'}`}
                >
                  <span className="text-lg">{tab.icon}</span>
                  {tab.label}
                </button>
              ))}
            </div>
          )}
          <nav className="lg:hidden fixed bottom-0 inset-x-0 z-[65] bg-slate-950 border-t border-slate-800 pb-[env(safe-area-inset-bottom)]">
            <div className="flex items-stretch justify-around h-14">
              {mobilePrimaryTabs.map(tab => (
                <button
                  key={tab.id}
                  onClick={() => selectTab(tab.id)}
                  className={`flex-1 flex flex-col items-center justify-center gap-0.5 min-w-0 px-1 ${activeTab === tab.id ? 'text-blue-400' : 'text-slate-500'}`}
                >
                  <span className="text-base leading-none">{tab.icon}</span>
                  <span className="text-[8px] font-black uppercase truncate max-w-full">{tab.label}</span>
                </button>
              ))}
              {mobileAdminTabs.length > 0 && (
                <button
                  onClick={() => setMobileMoreOpen(v => !v)}
                  className={`flex-1 flex flex-col items-center justify-center gap-0.5 min-w-0 px-1 ${mobileMoreActive || mobileMoreOpen ? 'text-blue-400' : 'text-slate-500'}`}
                >
                  <span className="text-base leading-none">⋯</span>
                  <span className="text-[8px] font-black uppercase">{L.more}</span>
                </button>
              )}
            </div>
          </nav>
        </>
      )}
    </div>
    </StaffLocaleProvider>
  );
}
