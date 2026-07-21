"use client";
import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { createStaffDb } from '../lib/staffDbClient';
import { SESSION_PRESETS, getPresetFromTimes } from '../lib/sessionPresets';
import {
  canAccessClinic,
  getAllowedClinics,
  getStaffProfileForClinic,
  normalizeStaffSessionUser,
  resolveStaffRoleLevel,
  CLINIC_OXYGENDGL,
  CLINIC_OXYGENDGL2,
  CLINIC_SHENANDOAH,
} from '../lib/clinicAccess';
import {
  currencyForClinic,
  filterRowsByClinic,
  getClinicDefaultName,
  getClinicMeta,
  getClinicShortLabel,
  getClinicTheme,
  isMissingClinicColumnError,
  isShenandoah,
  normalizeClinicId,
  shouldScopeTableByClinic,
  staffDbSelectByClinic,
  CLINIC_SELECTOR_ORDER,
} from '../lib/clinicRegistry';
import {
  chooseDuplicatePhoneAction,
  ensurePatient,
  digitsOnly,
  resolvePatientForAppointment,
  resolveDisplayContact,
  updatePatientContact,
} from '../lib/ensurePatient';
import {
  buildCalendarWeek,
  getDayNameFromDate,
  localeForClinic,
  staffAlert,
  staffStrings,
} from '../lib/i18n';
import BitacoraModal from '../components/BitacoraModal';
import PatientProfileModal from '../components/PatientProfileModal';
import PatientSessionHistory from '../components/PatientSessionHistory';
import AppointmentSavingOverlay from '../components/AppointmentSavingOverlay';
import StaffSaveToast from '../components/StaffSaveToast';
import ScreenshotAppointmentModal from '../components/ScreenshotAppointmentModal';
import StaffAgentChat from '../components/StaffAgentChat';
import RepeatDatesCalendar from '../components/RepeatDatesCalendar';
import GFEManager from '../components/GFEManager';
import { InstallGuideLink } from '../components/InstallGuide';
import PatientSearchInput from '../components/PatientSearchInput';
import { StaffLocaleProvider } from '../components/StaffLocaleContext';
import StaffBookingOverrides from '../components/StaffBookingOverrides';
import DemoOccupancyPanel from '../components/DemoOccupancyPanel';
import AppSymbolLegend from '../components/AppSymbolLegend';
import PosReceiptModal from '../components/PosReceiptModal';
import StaffTabErrorBoundary from '../components/StaffTabErrorBoundary';
import CalendarAppointmentBlock from '../components/CalendarAppointmentBlock';
import CalendarAssessmentBand from '../components/CalendarAssessmentBand';

const STAFF_TAB_PANEL = 'flex-1 min-h-0 overflow-y-auto overscroll-y-contain flex flex-col z-10 p-3 pb-20 lg:p-6 lg:pb-6';
import { getServiceScheduleBounds, buildAvailabilitySlotTimes, buildStaffAppointmentTimeOptions, normalizeTimeInput } from '../lib/serviceSchedule';
import {
  buildDefaultWeeklySchedule,
  getClinicCalendarGridBounds,
  getDaySchedule,
  getWeekdayLabels,
  normalizeWeeklySchedule,
  WEEKDAY_KEYS,
} from '../lib/clinicWeeklySchedule';
import { insertStaffAppointment, updateStaffAppointment, updateAppointmentNotesAndContact } from '../lib/staffAppointmentSave';
import { sortOccurrenceDates } from '../lib/appointmentRecurrence';
import { getRepeatDateAvailability } from '../lib/repeatDateAvailability';
import { resolveStaffActiveClinic, saveStaffActiveClinic } from '../lib/staffClinicPrefs';
import {
  applyEquipmentRepairsToAppointments,
  autoRepairOrphanEquipmentNames,
  buildCalendarEquipmentColumns,
  countAppointmentsForServiceResolved,
  hasServiceScheduleChange,
  renameEquipmentAcrossClinic,
  resolveAppointmentEquipment,
} from '../lib/serviceEquipmentSync';
import {
  isStaleAppointmentPatientName,
  renamePatientAcrossClinic,
  repairStaleAppointmentNames,
  syncAppointmentPatientName,
  withCanonicalPatientName,
} from '../lib/patientNameSync';
import { downloadCsv } from '../lib/reportCsvExport';
import {
  sanitizeAppointmentNotesForDisplay,
  sanitizePatientNotesForDisplay,
} from '../lib/patientNotes';
import { saveCompanyConfigRow } from '../lib/companyConfigSave';
import { formatClinicField, formatClinicPhone } from '../lib/clinicText';
import { getSessionPresetLabels, translateCheckInStatus } from '../lib/i18n';
import {
  computeDefaultZoomScale,
  getEquipmentShortLabel,
  isCompactColumn,
  weekDayColumnWidths,
  WEEK_STICKY_HEADER_PX,
  ASSESSMENT_BAND_HEIGHT_PX,
  CALENDAR_PIXELS_PER_MINUTE,
} from '../lib/calendarDisplay';
import { getWeekScrollLeftForToday } from '../lib/calendarScroll';
import { defaultEquipmentForClinic } from '../lib/screenshotEquipment';
import { getMissingAppointmentFields, resolveAppointmentDraft } from '../lib/appointmentFormValidation';
import { normalizeAppointmentTime } from '../lib/screenshotAppointmentParse';
import { loadCalendarPrefs, saveCalendarPrefs } from '../lib/calendarPrefs';
import { formatClinicDateIso, getClinicNow } from '../lib/clinicClock';
import { isAssessmentService } from '../lib/assessmentService';
import {
  buildCalendarFeedUrl,
  buildGoogleCalendarSubscribeUrl,
  buildWebcalFeedUrl,
  generateCalendarFeedToken,
} from '../lib/calendarFeed';
import { buildPromoterBookingUrl, normalizePromoCode, resolvePromoterContext } from '../lib/promoters';
import { resolveNextTicketNumber } from '../lib/ticketNumber';
import { formatSaleAuditDetail, formatSaleCancelAuditDetail } from '../lib/saleAudit';
import {
  adjustWalletSessions,
  applyPurchaseSessions,
  consumeSessionFromWallet,
  creditSessionToWallet,
  hasPaidSessionBalance,
  persistWalletAfterConsume,
  repairLegacyWalletKeys,
  resolveWalletContext,
  reverseNoShowWalletImpact,
  reversePurchaseSessions,
} from '../lib/sessionWallet';
import {
  addSessionGroupMember,
  createSessionGroup,
  enrichGroupForDisplay,
  findGroupForPatient,
  normalizeGroup,
  removeSessionGroupMember,
  reverseGroupPurchase,
} from '../lib/sessionGroup';
import { buildSessionSummary, getServicePrice } from '../lib/sessionSummary';
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
  resolveEffectiveNotifyType,
  isFirstSessionAppointment,
} from '../lib/emailTemplates';
import {
  defaultNotifySettings,
  getAutoNotifyBlockReason,
  getSessionInstructionsLabel,
  getSessionInstructionsUrl,
  isAutoNotifyEnabled,
  NOTIFY_SETTING_FIELDS,
  resolveNotifyChannels,
  resolveNotifyChannelsForPatient,
  resolveSessionInstructions,
} from '../lib/notifySettings';
import {
  notifyStaffNewBooking,
  STAFF_ALERT_FIELDS,
} from '../lib/staffBookingAlert';
import { broadcastLiveDataUpdated } from '../lib/liveSyncBroadcast';
import { useLiveSyncPoll } from '../lib/useLiveSyncPoll';
import { liveSyncDateRange } from '../lib/liveSyncToken';
import {
  CONFIRMATION_STATUS,
  confirmationStatusClass,
  confirmationStatusLabel,
  explainConfirmationState,
} from '../lib/appointmentConfirmation';
import {
  CANCEL_REQUEST_STATUS,
  isCancelRequestPending,
} from '../lib/appointmentManage';

export default function AppLayout() {
  // --- SEGURIDAD Y JERARQUÍA ---
  const [currentUser, setCurrentUser] = useState(null);
  const [loginPin, setLoginPin] = useState('');
  const [loginEmail, setLoginEmail] = useState('');
  const [rememberDevice, setRememberDevice] = useState(true);
  const [trustedDevice, setTrustedDevice] = useState(null);
  const [loginModeTrusted, setLoginModeTrusted] = useState(false);
  const [authBootstrapping, setAuthBootstrapping] = useState(true);
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
  const [activeClinic, setActiveClinic] = useState(CLINIC_OXYGENDGL); 
  const [activeTab, setActiveTab] = useState('Agenda');
  const [viewMode, setViewMode] = useState('Semana'); 
  const [equipmentFilter, setEquipmentFilter] = useState('Todos');
  const [zoomScale, setZoomScale] = useState(80);
  const [zoomManual, setZoomManual] = useState(false);
  const [isMobileViewport, setIsMobileViewport] = useState(false);
  const [liveSyncAt, setLiveSyncAt] = useState(null);
  const [, setLiveSyncTick] = useState(0);
  const [weekFilterHintDismissed, setWeekFilterHintDismissed] = useState(false);
  const [showCalendarLegend, setShowCalendarLegend] = useState(false);
  const [showSymbolLegend, setShowSymbolLegend] = useState(false);
  const [currentDate, setCurrentDate] = useState(() => (
    typeof window !== 'undefined' ? getClinicNow(CLINIC_OXYGENDGL).date : new Date()
  ));
  const prefsHydratedRef = useRef(false);
  const skipAutoZoomRef = useRef(false);
  const calendarScrollRef = useRef(null);
  const pendingScrollToNowRef = useRef(false);
  const [calendarHScroll, setCalendarHScroll] = useState({ left: 0, max: 0 });
  const prevActiveTabRef = useRef(null);
  const lastAgendaFocusRef = useRef('');
  
  // --- RELOJ MULTIHUSO HORARIO ---
  const [clinicNow, setClinicNow] = useState({ mins: 0, dateStr: '' });

  // Moneda Dinámica
  const currencyStr = currencyForClinic(activeClinic);

  // --- MODALES Y SELECCIÓN ---
  const [showBitacora, setShowBitacora] = useState(false);
  const [showPatientProfile, setShowPatientProfile] = useState(false);
  const [showNewAppointment, setShowNewAppointment] = useState(false);
  const [showScreenshotIntake, setShowScreenshotIntake] = useState(false);
  const [showAgentChat, setShowAgentChat] = useState(false);
  const [isSavingAppointment, setIsSavingAppointment] = useState(false);
  const [appointmentSaveFeedback, setAppointmentSaveFeedback] = useState(null);
  const [saveToast, setSaveToast] = useState('');
  const saveToastTimerRef = useRef(null);
  const [repeatBooking, setRepeatBooking] = useState({ enabled: false, dates: [] });
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancelDeductSession, setCancelDeductSession] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState(null);
  const [confirmationSending, setConfirmationSending] = useState(false);
  const [staffSmsPreset, setStaffSmsPreset] = useState('waiting');
  const [staffSmsNote, setStaffSmsNote] = useState('');
  const [staffSmsSending, setStaffSmsSending] = useState(false);
  const [draggedApp, setDraggedApp] = useState(null);
  const [moveConfirmation, setMoveConfirmation] = useState(null);
  const [isRescheduling, setIsRescheduling] = useState(false);
  const [showAudit, setShowAudit] = useState(false);
  const [auditLogs, setAuditLogs] = useState([]);
  const [globalAuditLogs, setGlobalAuditLogs] = useState([]); 

  // --- BASE DE DATOS ---
  const [dbPatients, setDbPatients] = useState([]);
  const [dbSessionGroups, setDbSessionGroups] = useState([]);
  const [sessionGroupsEnabled, setSessionGroupsEnabled] = useState(false);
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
    maps_url: '',
    phone: '', 
    ticket_message: 'Gracias por su preferencia', 
    start_time: '07:00', 
    end_time: '20:00', 
    interval_mins: 30,
    weekly_schedule: buildDefaultWeeklySchedule({ start_time: '07:00', end_time: '20:00' }),
    booking_limit_hours: 2,
    cancel_limit_hours: 24,
    master_pin: '000000',
    financial_pin: '123456',
    notify_on_booking: true,
    reminder_hours: 24,
    calendar_feed_enabled: false,
    calendar_feed_token: '',
    google_calendar_enabled: false,
    google_calendar_email: '',
    google_calendar_id: 'primary',
    google_calendar_connected: false,
    ticket_counter: 793,
    ...defaultNotifySettings('es'),
    ...emptyEmailTemplateState('es'),
  });
  
  const [emailTemplateTab, setEmailTemplateTab] = useState('first');
  const [emailPreview, setEmailPreview] = useState(null);
  const [googleCalendarApiStatus, setGoogleCalendarApiStatus] = useState({
    configured: false,
    connected: false,
    sqlRequired: false,
    email: '',
  });
  const [adminSubTab, setAdminSubTab] = useState('general');

  const [searchQuery, setSearchQuery] = useState('');
  const [dbStatus, setDbStatus] = useState('cargando');
  const [dbErrorMessage, setDbErrorMessage] = useState('');
  const fetchGenRef = useRef(0);
  const fetchAllDataRef = useRef(async () => {});
  const slotNotesDirtyRef = useRef(false);

  // --- FORMULARIOS GLOBALES ---
  const [newSrv, setNewSrv] = useState({ id: null, name: '', duration: 60, buffer: 30, price: 100, color: 'blue', is_active: true, equipment: 'Cámara 1', start_time: '', end_time: '', first_session_notes: '', use_custom_notes: false });
  const [isEditingSrv, setIsEditingSrv] = useState(false);
  const [editingSrvOriginalName, setEditingSrvOriginalName] = useState('');
  const [editingSrvOriginalSchedule, setEditingSrvOriginalSchedule] = useState({ duration: 60, buffer: 30 });
  
  const [newProtocol, setNewProtocol] = useState({ id: null, name: '', is_active: true });
  const [isEditingProtocol, setIsEditingProtocol] = useState(false);

  const [dbPromoters, setDbPromoters] = useState([]);
  const [promotersLoadError, setPromotersLoadError] = useState('');
  const [newPromoter, setNewPromoter] = useState({ id: null, code: '', name: '', email: '', notes: '', is_active: true });
  const [isEditingPromoter, setIsEditingPromoter] = useState(false);

  const [newRole, setNewRole] = useState({ id: null, name: '', level: 3 });
  const [isEditingRole, setIsEditingRole] = useState(false);

  const [newUser, setNewUser] = useState({ id: null, name: '', email: '', phone: '', notify_on_booking: false, role: 'Técnico Certificado IBUM', cert: '', is_active: true, pin: '' });
  const [isEditingUser, setIsEditingUser] = useState(false);

  const [showNewPatientModal, setShowNewPatientModal] = useState(false);
  const [newPatientData, setNewPatientData] = useState({ name: '', phone: '', email: '', protocol: 'Wellness', notes: '', prefers_email: true, prefers_sms: true });
  
  const [showOOOModal, setShowOOOModal] = useState(false);
  const [oooData, setOOOData] = useState({
    id: null,
    date: '',
    start_time: '07:00',
    end_time: '19:00',
    is_global: true,
    equipment: '',
    reason: 'Festivo / Mantenimiento',
  });

  // --- REPORTES Y SEGURIDAD ---
  const [isReportsUnlocked, setIsReportsUnlocked] = useState(false);
  const [pinInput, setPinInput] = useState('');
  const [reportFilter, setReportFilter] = useState('Citas');
  const [reportDate, setReportDate] = useState(new Date().toISOString().split('T')[0]);
  const [reportStartDate, setReportStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [reportEndDate, setReportEndDate] = useState(new Date().toISOString().split('T')[0]);
  const [reportIncludeCancelled, setReportIncludeCancelled] = useState(false);
  const [selectedPatientReport, setSelectedPatientReport] = useState('');
  const [reportReceipt, setReportReceipt] = useState(null);
  const [reportReceiptPhone, setReportReceiptPhone] = useState('');

  const locale = localeForClinic(activeClinic);
  const L = useMemo(() => staffStrings(locale), [locale]);
  const presetLabels = useMemo(() => getSessionPresetLabels(locale), [locale]);
  const a = (key, ...args) => staffAlert(locale, key, ...args);

  const formatAppointmentSaveError = (err) => {
    const msg = err?.message || String(err || '');
    if (err?.sessionExpired || /unauthorized/i.test(msg)) return L.dbErrorUnauthorized;
    if (/access denied/i.test(msg)) {
      return locale === 'en' ? 'You do not have access to this clinic.' : 'No tienes acceso a esta clínica.';
    }
    return a('connectionErrorMsg', msg);
  };

  const refreshStaffSessionForSave = async () => {
    try {
      const res = await fetch('/api/auth/me', { credentials: 'include' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.user) return false;
      const user = normalizeStaffSessionUser(data.user, { roleLevel: data.user?.accessLevel });
      setCurrentUser(user);
      return true;
    } catch {
      return false;
    }
  };

  const emailTemplateTabLabels = {
    first: locale === 'en' ? 'First appointment' : 'Primera cita',
    booking: locale === 'en' ? 'New booking' : 'Cita nueva',
    reschedule: locale === 'en' ? 'Reschedule' : 'Cambio de horario',
    cancel: locale === 'en' ? 'Cancellation' : 'Cancelación',
    reminder: locale === 'en' ? 'Reminder before visit' : 'Recordatorio antes de la cita',
  };

  const messageTypeCards = [
    {
      id: 'first',
      title: locale === 'en' ? '1. First visit' : '1. Primera visita',
      when: locale === 'en'
        ? 'Sent when a new patient books (first time at the clinic). Always email + SMS.'
        : 'Se envía cuando un paciente nuevo agenda (primera vez en la clínica). Siempre correo + SMS.',
      autoKey: 'notify_auto_first',
      defaultOn: true,
    },
    {
      id: 'booking',
      title: locale === 'en' ? '2. New appointment' : '2. Cita nueva',
      when: locale === 'en'
        ? 'Sent when an existing patient books another appointment.'
        : 'Se envía cuando un paciente que ya conoce la clínica agenda otra cita.',
      autoKey: 'notify_auto_booking',
      defaultOn: true,
    },
    {
      id: 'reschedule',
      title: locale === 'en' ? '3. Time change' : '3. Cambio de horario',
      when: locale === 'en'
        ? 'Sent when the appointment is moved to another day or time.'
        : 'Se envía cuando la cita se mueve a otro día u hora.',
      autoKey: 'notify_auto_reschedule',
      defaultOn: true,
    },
    {
      id: 'cancel',
      title: locale === 'en' ? '4. Cancellation' : '4. Cancelación',
      when: locale === 'en'
        ? 'Sent when the appointment is cancelled.'
        : 'Se envía cuando la cita se cancela.',
      autoKey: 'notify_auto_cancel',
      defaultOn: true,
    },
    {
      id: 'reminder',
      title: locale === 'en' ? '5. Reminder before the visit' : '5. Recordatorio antes de la cita',
      when: locale === 'en'
        ? `Sent automatically about ${dbCompanyConfig.reminder_hours || 24} hours before the appointment (once per day check).`
        : `Se envía solo, unas ${dbCompanyConfig.reminder_hours || 24} horas antes de la cita (revisión una vez al día).`,
      autoKey: 'notify_auto_reminder',
      defaultOn: false,
    },
  ];

  const isMessageTypeOn = (card) => (
    card.defaultOn
      ? dbCompanyConfig[card.autoKey] !== false
      : dbCompanyConfig[card.autoKey] === true
  );
  const pickEmailTemplates = (config = dbCompanyConfig) => ({
    notify_subject_first: config.notify_subject_first,
    notify_body_first: config.notify_body_first,
    notify_subject_booking: config.notify_subject_booking,
    notify_body_booking: config.notify_body_booking,
    notify_subject_reschedule: config.notify_subject_reschedule,
    notify_body_reschedule: config.notify_body_reschedule,
    notify_subject_cancel: config.notify_subject_cancel,
    notify_body_cancel: config.notify_body_cancel,
    notify_subject_reminder: config.notify_subject_reminder,
    notify_body_reminder: config.notify_body_reminder,
    notify_extra_info: config.notify_extra_info,
  });

  const pickStaffAlertSettings = (config = dbCompanyConfig) => {
    const picked = {};
    for (const key of STAFF_ALERT_FIELDS) {
      picked[key] = config[key];
    }
    return picked;
  };

  const alertStaffNewBooking = async (slot, { source = 'staff', promoterCode = '', isFirstSession } = {}) => {
    if (dbCompanyConfig.notify_staff_on_booking !== true) {
      return { skipped: true, reason: 'disabled' };
    }
    const firstSession = isFirstSession ?? isFirstSessionAppointment({
      isNewPatient: slot.is_new_patient,
      patientName: slot.patient,
      equipment: slot.equipment,
      appointments: dbAppointments,
      excludeAppointmentId: slot.id,
      normalize: normalizeStr,
    });
    try {
      return await notifyStaffNewBooking({
        companyConfig: { ...pickStaffAlertSettings(), notify_staff_on_booking: true },
        staffRoster: (dbUsers || []).filter((u) => u.is_active),
        clinicName: activeClinic,
        clinicDisplayName: dbCompanyConfig.name,
        patientName: slot.patient,
        patientPhone: slot.phone || slot.patient_phone || '',
        patientEmail: slot.email || slot.patient_email || '',
        date: slot.full_date || slot.fullDate,
        time: slot.time,
        equipment: slot.equipment,
        locale,
        source,
        promoterCode,
        isFirstSession: firstSession,
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

  const pickSmsIntros = (config = dbCompanyConfig) => ({
    first: config.notify_sms_first,
    booking: config.notify_sms_booking,
    reschedule: config.notify_sms_reschedule,
    cancel: config.notify_sms_cancel,
    reminder: config.notify_sms_reminder,
  });

  const pickGoogleCalendarSettings = (config = dbCompanyConfig) => {
    // Solo incluimos columnas de Google Calendar si la función ya está en uso
    // (conectada o activada). Evita el aviso de "faltan columnas" cuando aún
    // no se ha corrido el SQL de Google Calendar (feature opcional).
    const inUse = config.google_calendar_enabled === true
      || config.google_calendar_connected === true;
    if (!inUse) return {};
    return {
      google_calendar_enabled: config.google_calendar_enabled === true,
      google_calendar_id: String(config.google_calendar_id || 'primary').trim() || 'primary',
    };
  };

  const buildNotifyPreviewForType = (notifyType) => {
    const type = notifyType || emailTemplateTab || 'booking';
    const sampleDate = new Date();
    sampleDate.setDate(sampleDate.getDate() + 3);
    const dateStr = sampleDate.toISOString().split('T')[0];
    const sampleService = dbServices.find((s) => s.is_active)?.name
      || (locale === 'en' ? 'Hyperbaric Chamber' : 'Cámara Hiperbárica');
    const previewInstructions = resolveSessionInstructions(dbCompanyConfig, locale, {
      equipment: sampleService,
      services: dbServices,
      isFirstSession: type === 'first',
    });
    const previewTimes = resolveSessionTimes({ duration: 60, buffer: 30 });
    return buildNotifyContent({
      locale,
      notifyType: type,
      patientName: locale === 'en' ? 'John Smith' : 'María González',
      clinicName: activeClinic,
      clinicDisplayName: dbCompanyConfig.name,
      date: dateStr,
      time: '10:00',
      equipment: sampleService,
      instructions: previewInstructions,
      instructionsLabel: getSessionInstructionsLabel(dbCompanyConfig, locale),
      sessionInstructionsUrl: getSessionInstructionsUrl(dbCompanyConfig, activeClinic),
      address: dbCompanyConfig.address || (locale === 'en' ? '123 Medical Center Dr, Houston TX' : 'Av. Patria 123, Guadalajara'),
      mapsUrl: dbCompanyConfig.maps_url || '',
      clinicPhone: dbCompanyConfig.phone || (locale === 'en' ? '7135913379' : '3321664083'),
      ticketMessage: dbCompanyConfig.ticket_message,
      emailTemplates: pickEmailTemplates(),
      smsIntros: pickSmsIntros(),
      durationMins: previewTimes.duration,
      bufferMins: previewTimes.buffer,
      appointmentId: 'preview-sample',
      cancelLimitHours: Number(dbCompanyConfig.cancel_limit_hours) || 24,
    });
  };

  const openEmailPreview = () => {
    setEmailPreview(buildNotifyPreviewForType(emailTemplateTab));
  };

  const buildCompanyConfigPayload = () => ({
    name: formatClinicField(dbCompanyConfig.name),
    address: formatClinicField(dbCompanyConfig.address),
    maps_url: String(dbCompanyConfig.maps_url || '').trim(),
    phone: formatClinicPhone(dbCompanyConfig.phone),
    ticket_message: formatClinicField(dbCompanyConfig.ticket_message),
    start_time: normalizeTimeInput(dbCompanyConfig.start_time) || '07:00',
    end_time: normalizeTimeInput(dbCompanyConfig.end_time) || '20:00',
    interval_mins: dbCompanyConfig.interval_mins,
    weekly_schedule: normalizeWeeklySchedule(dbCompanyConfig.weekly_schedule, {
      start_time: normalizeTimeInput(dbCompanyConfig.start_time) || '07:00',
      end_time: normalizeTimeInput(dbCompanyConfig.end_time) || '20:00',
    }),
    booking_limit_hours: dbCompanyConfig.booking_limit_hours,
    cancel_limit_hours: dbCompanyConfig.cancel_limit_hours,
    master_pin: dbCompanyConfig.master_pin,
    financial_pin: dbCompanyConfig.financial_pin,
    notify_on_booking: dbCompanyConfig.notify_on_booking,
    reminder_hours: dbCompanyConfig.reminder_hours,
    // Houston-only confirmation SMS columns — omit on GDL so save does not warn.
    ...(isShenandoah(activeClinic) ? {
      confirmation_sms_enabled: dbCompanyConfig.confirmation_sms_enabled === true,
      confirmation_hours_before: Number(dbCompanyConfig.confirmation_hours_before) || 6,
      confirmation_no_reply_hours: Number(dbCompanyConfig.confirmation_no_reply_hours) || 1,
    } : {}),
    calendar_feed_enabled: dbCompanyConfig.calendar_feed_enabled === true,
    calendar_feed_token: String(dbCompanyConfig.calendar_feed_token || '').trim(),
    ...pickEmailTemplates(),
    ...pickNotifySettings(),
    ...pickGoogleCalendarSettings(),
    ...pickStaffAlertSettings(),
  });

  const flashSaveToast = (message) => {
    const text = String(message || '').trim();
    if (!text) return;
    setSaveToast(text);
    if (saveToastTimerRef.current) window.clearTimeout(saveToastTimerRef.current);
    saveToastTimerRef.current = window.setTimeout(() => setSaveToast(''), 2200);
  };

  const closeAppointmentSaveFeedback = () => {
    setAppointmentSaveFeedback((current) => {
      const onDone = current?.onDone;
      const closeForm = current?.closeForm;
      window.setTimeout(() => {
        if (typeof onDone === 'function') {
          try { onDone(); } catch { /* ignore */ }
        } else if (closeForm) {
          setShowNewAppointment(false);
          setSelectedSlot(null);
          fetchAllData();
        }
      }, 0);
      return null;
    });
  };

  /**
   * Full-screen working → success/error feedback for create/save/change actions.
   * Returns the action result, or undefined if blocked / cancelled.
   */
  const runBusyAction = async ({
    workingTitle,
    workingDetail,
    successTitle,
    successDetail = '',
    autoCloseMs = 1200,
    onDone,
    action,
  }) => {
    if (isSavingAppointment) return undefined;
    setIsSavingAppointment(true);
    setAppointmentSaveFeedback({
      phase: 'creating',
      title: workingTitle || L.p.common.working,
      detail: workingDetail || L.p.common.pleaseWait,
    });
    try {
      const result = await action();
      if (result?.cancelled) {
        setAppointmentSaveFeedback(null);
        return result;
      }
      if (result?.error) {
        setAppointmentSaveFeedback({
          phase: 'error',
          title: locale === 'en' ? 'Error' : 'Error',
          detail: String(result.error),
          closeForm: false,
        });
        return result;
      }
      setAppointmentSaveFeedback({
        phase: 'success',
        title: result?.successTitle || successTitle || L.p.common.doneTitle,
        detail: result?.detail ?? successDetail,
        autoCloseMs: result?.autoCloseMs ?? autoCloseMs,
        onDone: result?.onDone || onDone,
        closeForm: false,
      });
      return result;
    } catch (e) {
      setAppointmentSaveFeedback({
        phase: 'error',
        title: locale === 'en' ? 'Error' : 'Error',
        detail: e?.message || String(e),
        closeForm: false,
      });
      return { error: e?.message || String(e) };
    } finally {
      setIsSavingAppointment(false);
    }
  };

  const saveCompanyConfig = async () => {
    await runBusyAction({
      workingTitle: locale === 'en' ? 'Saving settings…' : 'Guardando configuración…',
      workingDetail: L.p.common.pleaseWait,
      successTitle: L.p.common.savedOk,
      autoCloseMs: 1100,
      action: async () => {
        const { error, warning } = await saveCompanyConfigRow(activeSupabase, {
          id: dbCompanyConfig.id,
          clinic: activeClinic,
          payload: buildCompanyConfigPayload(),
          locale,
        });
        if (error) return { error: error.message };
        if (warning) {
          window.alert(warning);
          return {
            detail: locale === 'en' ? 'Saved partially — see alert' : 'Guardado parcial — ver aviso',
            autoCloseMs: 1800,
          };
        }
        await fetchAllData({ silent: true });
        return { detail: L.p.admin.configSaved };
      },
    });
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

  const activeSupabase = useMemo(() => createStaffDb(activeClinic), [activeClinic]);

  const activeStaffProfile = getStaffProfileForClinic(currentUser, activeClinic) || currentUser;

  const currentUserLevel = resolveStaffRoleLevel(currentUser, dbRoles, activeClinic);

  const allowedClinics = getAllowedClinics(currentUser, {
    roleLevel: currentUserLevel,
    dbRoles,
    activeClinic,
  });
  const visibleClinics = useMemo(
    () => CLINIC_SELECTOR_ORDER.filter((clinicKey) => allowedClinics.includes(clinicKey)),
    [allowedClinics],
  );

  // Actualizador de Reloj por Clínica
  useEffect(() => {
    const updateTime = () => {
      const now = getClinicNow(activeClinic);
      setClinicNow({ mins: now.mins, dateStr: now.dateStr });
    };
    updateTime();
    const interval = setInterval(updateTime, 60000);
    return () => clearInterval(interval);
  }, [activeClinic]);

  useEffect(() => {
    const enteredAgenda = activeTab === 'Agenda' && prevActiveTabRef.current !== 'Agenda';
    prevActiveTabRef.current = activeTab;

    if (!currentUser || activeTab !== 'Agenda' || dbStatus !== 'listo') return;

    const focusKey = `${activeClinic}:Agenda`;
    const shouldFocus = enteredAgenda || lastAgendaFocusRef.current !== focusKey;
    if (!shouldFocus) return;

    lastAgendaFocusRef.current = focusKey;

    const mobile = window.matchMedia('(max-width: 1023px)').matches;
    const now = getClinicNow(activeClinic);
    if (mobile) setViewMode('Día');
    setCurrentDate(now.date);
    pendingScrollToNowRef.current = true;
  }, [currentUser, activeTab, activeClinic, dbStatus]);

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
    const duration = Number(slot?.duration ?? srv?.duration) || 60;
    let buffer;
    if (slot?.buffer != null && slot?.buffer !== '') {
      buffer = Number(slot.buffer);
    } else if (srv?.buffer != null && srv?.buffer !== '') {
      buffer = Number(srv.buffer);
    } else {
      buffer = 30;
    }
    return { duration, buffer: Math.max(0, buffer) };
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
      if (resolveAppointmentEquipment(a.equipment, dbServices) !== equipment || a.full_date !== targetDate) return false;
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
    const last10 = digitsOnly(pData.phone).slice(-10);
    const existingByPhone = last10.length === 10
      ? dbPatients.find((p) => digitsOnly(p.phone).slice(-10) === last10)
      : null;

    let forceCreate = false;
    let namePolicy = 'prefer_incoming';
    let nameForSave = pData.name;

    if (existingByPhone) {
      const action = chooseDuplicatePhoneAction({
        existingName: existingByPhone.patient,
        typedName: pData.name,
        locale,
      });
      if (action === 'abort') {
        return { error: { message: 'CANCELADO' }, cancelled: true };
      }
      if (action === 'use_existing') {
        forceCreate = false;
        namePolicy = 'keep_existing';
        nameForSave = existingByPhone.patient;
      } else {
        forceCreate = true;
        namePolicy = 'prefer_incoming';
      }
    }

    const result = await ensurePatient(db, {
      name: nameForSave,
      phone: pData.phone,
      email: pData.email,
      protocol: pData.protocol,
      notes: pData.notes,
      prefers_email: pData.prefers_email,
      prefers_sms: pData.prefers_sms,
      namePolicy,
      forceCreate,
    });
    if (result.error) {
      const duplicateInMemory = dbPatients.some(
        (p) => digitsOnly(p.phone).slice(-10) === last10 && last10.length === 10
      );
      if (duplicateInMemory && !forceCreate) return { error: { message: 'CLON_DETECTADO' } };
      return { error: result.error };
    }
    return {
      data: [{ id: result.id, patient: result.displayName }],
      error: null,
      linkedExisting: result.linkedExisting,
      forceCreated: result.forceCreated,
    };
  };

  const persistPatientContactFromSlot = async (slot) => {
    const targetPatient = (slot.patientId
      ? dbPatients.find((p) => String(p.id) === String(slot.patientId))
      : null) || resolvePatientForAppointment(
      { patient: slot.patient, phone: slot.phone },
      dbPatients,
    );
    const canonicalPhone = (slot.phone || '').trim();
    const canonicalEmail = (slot.email || '').trim();
    const phoneDigits = digitsOnly(canonicalPhone).slice(-10);

    const applyPatientContactPatch = async (pat) => {
      const upRes = await updatePatientContact(activeSupabase, pat.id, {
        phone: canonicalPhone,
        email: canonicalEmail,
        notes: slot.patientNotes ?? sanitizePatientNotesForDisplay(pat.notes ?? ''),
        prefers_email: slot.prefers_email,
        prefers_sms: slot.prefers_sms,
      });
      if (upRes.error) return { error: upRes.error };
      return {
        error: null,
        phone: canonicalPhone || pat.phone,
        email: canonicalEmail || pat.email,
        patient: pat.patient,
        patientId: pat.id,
      };
    };

    // Expediente ya vinculado: actualizar por ID (permite corregir teléfono mal capturado).
    if (targetPatient?.id) {
      return applyPatientContactPatch(targetPatient);
    }

    if (phoneDigits.length === 10) {
      const ensured = await ensurePatient(activeSupabase, {
        name: slot.patient,
        phone: canonicalPhone,
        email: canonicalEmail,
        protocol: slot.protocol || targetPatient?.protocol || 'Wellness',
        notes: slot.patientNotes ?? sanitizePatientNotesForDisplay(targetPatient?.notes ?? ''),
        prefers_email: slot.prefers_email !== false,
        prefers_sms: slot.prefers_sms !== false,
      });
      if (ensured.error) return ensured;
      return {
        error: null,
        phone: ensured.phone,
        email: ensured.email,
        patient: ensured.displayName,
        patientId: ensured.id,
      };
    }

    for (const pat of dbPatients.filter(
      (x) => normalizeStr(x.patient) === normalizeStr(slot.patient),
    )) {
      const result = await applyPatientContactPatch(pat);
      if (result.error) return result;
    }

    return {
      error: null,
      phone: canonicalPhone,
      email: canonicalEmail,
      patient: slot.patient,
      patientId: targetPatient?.id || null,
    };
  };

  // --- SINCRONIZACIÓN CON PAGINACIÓN INTELIGENTE ---
  const fetchAllData = async ({ silent = false, liveOnly = false } = {}) => {
    if (!currentUser) {
      setDbStatus('sin_sesion');
      return;
    }

    const fetchGen = ++fetchGenRef.current;
    const clinicDb = createStaffDb(activeClinic);
    const clinicId = normalizeClinicId(activeClinic);

    const assertDbResult = (label, result) => {
      if (result?.error) {
        const message = result.error.message || String(result.error);
        throw new Error(`${label}: ${message}`);
      }
      return result;
    };

    try {
      if (!silent) {
        setDbStatus('cargando');
        setDbErrorMessage('');
      }

      // Motor de Paginación para evadir el límite de 1000 de Supabase
      const fetchPaginated = async (table, {
        clinicScoped = false,
        dateCol = null,
        dateFrom = null,
        dateTo = null,
      } = {}) => {
        let allData = [];
        let from = 0;
        const step = 1000;
        let useClinicFilter = clinicScoped && shouldScopeTableByClinic(clinicId);
        while (true) {
          let query = clinicDb.from(table).select('*');
          if (useClinicFilter) query = query.eq('clinic', clinicId);
          if (dateCol && dateFrom) query = query.gte(dateCol, dateFrom);
          if (dateCol && dateTo) query = query.lte(dateCol, dateTo);
          let result = await query.range(from, from + step - 1);
          if (result?.error && useClinicFilter && isMissingClinicColumnError(result.error)) {
            useClinicFilter = false;
            from = 0;
            allData = [];
            continue;
          }
          result = assertDbResult(table, result);
          let data = result.data;
          if (clinicScoped && data?.length) {
            data = filterRowsByClinic(data, clinicId);
          }
          if (!data || data.length === 0) break;
          allData = [...allData, ...data];
          if (data.length < step) break;
          from += step;
        }
        return allData;
      };

      if (liveOnly) {
        const { from: liveFrom, to: liveTo } = liveSyncDateRange(activeClinic);
        const [appointmentsData, resS, resB, resC] = await Promise.all([
          fetchPaginated('appointments', {
            clinicScoped: shouldScopeTableByClinic(clinicId),
            dateCol: 'full_date',
            dateFrom: liveFrom,
            dateTo: liveTo,
          }),
          shouldScopeTableByClinic(clinicId)
            ? staffDbSelectByClinic(clinicDb, 'services', clinicId, (q) => q)
            : clinicDb.from('services').select('*'),
          shouldScopeTableByClinic(clinicId)
            ? staffDbSelectByClinic(clinicDb, 'blocked_slots', clinicId, (q) => q)
            : clinicDb.from('blocked_slots').select('*'),
          clinicDb.from('company_config').select('*').eq('clinic', clinicId).maybeSingle(),
        ]);

        if (fetchGen !== fetchGenRef.current) return;

        assertDbResult('services', resS);
        assertDbResult('blocked_slots', resB);

        setDbServices((resS.data || []).sort((a, b) => (a.name || '').localeCompare(b.name || '')));
        setDbBlockedSlots(resB.data || []);
        setDbAppointments((prev) => {
          const fresh = appointmentsData || [];
          const freshIds = new Set(fresh.map((a) => a.id));
          const keptOutside = (prev || []).filter((a) => {
            const d = a.full_date || '';
            return d && (d < liveFrom || d > liveTo);
          });
          const merged = new Map();
          for (const row of keptOutside) merged.set(row.id, row);
          for (const row of fresh) merged.set(row.id, row);
          // Drop in-window rows that disappeared (cancelled deleted from active set, etc.)
          for (const [id, row] of [...merged.entries()]) {
            const d = row.full_date || '';
            if (d >= liveFrom && d <= liveTo && !freshIds.has(id)) merged.delete(id);
          }
          return [...merged.values()];
        });
        if (resC.data) {
          const clinicLocale = localeForClinic(activeClinic);
          setDbCompanyConfig((prev) => ({
            ...prev,
            ...resC.data,
            name: formatClinicField(resC.data.name),
            address: formatClinicField(resC.data.address),
            maps_url: String(resC.data.maps_url || '').trim(),
            phone: formatClinicPhone(resC.data.phone),
            ticket_message: formatClinicField(resC.data.ticket_message),
            notify_session_label: resC.data.notify_session_label || prev.notify_session_label || defaultNotifySettings(clinicLocale).notify_session_label,
            notify_session_default: resC.data.notify_session_default ?? prev.notify_session_default ?? defaultNotifySettings(clinicLocale).notify_session_default,
            notify_session_url: resC.data.notify_session_url || prev.notify_session_url || defaultNotifySettings(clinicLocale).notify_session_url,
            notify_sms_first: resC.data.notify_sms_first || prev.notify_sms_first || defaultNotifySettings(clinicLocale).notify_sms_first,
            notify_sms_booking: resC.data.notify_sms_booking || prev.notify_sms_booking || defaultNotifySettings(clinicLocale).notify_sms_booking,
            notify_sms_reschedule: resC.data.notify_sms_reschedule || prev.notify_sms_reschedule || defaultNotifySettings(clinicLocale).notify_sms_reschedule,
            notify_sms_cancel: resC.data.notify_sms_cancel || prev.notify_sms_cancel || defaultNotifySettings(clinicLocale).notify_sms_cancel,
            notify_sms_reminder: resC.data.notify_sms_reminder || prev.notify_sms_reminder || defaultNotifySettings(clinicLocale).notify_sms_reminder,
          }));
        }
        if (dbStatus === 'error') {
          setDbStatus('listo');
          setDbErrorMessage('');
        }
        return;
      }

      const fetchPromotersWithFallback = async () => {
        let res = await clinicDb
          .from('promoters')
          .select('id, code, name, email, notes, calendar_feed_token, is_active, created_at')
          .order('code');
        if (res.error && /notes|calendar_feed_token|email|column|schema cache/i.test(res.error.message || '')) {
          res = await clinicDb
            .from('promoters')
            .select('id, code, name, is_active, created_at')
            .order('code');
        }
        return res;
      };

      const [patientsData, appointmentsData, resS, resU, resB, resC, resProt, resRoles, resPromo] = await Promise.all([
        fetchPaginated('patients'),
        fetchPaginated('appointments', { clinicScoped: shouldScopeTableByClinic(clinicId) }),
        shouldScopeTableByClinic(clinicId)
          ? staffDbSelectByClinic(clinicDb, 'services', clinicId, (q) => q)
          : clinicDb.from('services').select('*'),
        clinicDb.from('users_staff').select('*'),
        shouldScopeTableByClinic(clinicId)
          ? staffDbSelectByClinic(clinicDb, 'blocked_slots', clinicId, (q) => q)
          : clinicDb.from('blocked_slots').select('*'),
        clinicDb.from('company_config').select('*').eq('clinic', clinicId).maybeSingle(),
        clinicDb.from('protocols').select('*'),
        clinicDb.from('user_roles').select('*'),
        fetchPromotersWithFallback(),
      ]);

      if (fetchGen !== fetchGenRef.current) return;

      assertDbResult('services', resS);
      assertDbResult('users_staff', resU);
      assertDbResult('blocked_slots', resB);
      assertDbResult('company_config', resC);
      assertDbResult('protocols', resProt);
      assertDbResult('user_roles', resRoles);

      const safePatients = (patientsData || []).map(p => {
        const packageHistory = p.package_history || [];
        const repaired = repairLegacyWalletKeys(p.wallets || {}, packageHistory);
        return {
        id: p.id,
        patient: String(p.Name || p.name || p.Nombre || 'Sin Nombre'),
        phone: String(p.Phone || p.phone || ''),
        email: String(p.Email || p.email || ''),
        protocol: String(p.protocol || ''),
        notes: sanitizePatientNotesForDisplay(p.notes || p.Notes || ''),
        is_blocked: p.is_blocked || false,
        prefers_email: p.prefers_email !== false,
        prefers_sms: p.prefers_sms !== false,
        wallets: repaired.wallets,
        packageHistory,
        historicoSesiones: p.historico_sesiones || 0,
        adeudo: Number(p.adeudo) || 0,
        sessionGroupId: p.session_group_id || null,
        _walletRepairPending: repaired.changed,
      };
      });

      setDbPatients(safePatients.sort((a, b) => a.patient.localeCompare(b.patient)));

      const walletRepairs = safePatients.filter((p) => p._walletRepairPending);
      if (walletRepairs.length && clinicDb) {
        await Promise.all(walletRepairs.map((p) => clinicDb.from('patients').update({ wallets: p.wallets }).eq('id', p.id)));
      }

      try {
        const resGroups = await clinicDb.from('session_groups').select('*');
        if (!resGroups.error) {
          const safeGroups = (resGroups.data || []).map(normalizeGroup);
          setDbSessionGroups(safeGroups);
          const groupRepairs = safeGroups.filter((g) => g._walletRepairPending);
          if (groupRepairs.length && clinicDb) {
            await Promise.all(groupRepairs.map((g) => clinicDb.from('session_groups').update({ wallets: g.wallets }).eq('id', g.id)));
          }
          setSessionGroupsEnabled(true);
        } else {
          setDbSessionGroups([]);
          setSessionGroupsEnabled(false);
        }
      } catch {
        setDbSessionGroups([]);
        setSessionGroupsEnabled(false);
      }
      
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
          maps_url: String(resC.data.maps_url || '').trim(),
          phone: formatClinicPhone(resC.data.phone),
          ticket_message: formatClinicField(resC.data.ticket_message),
          notify_session_label: resC.data.notify_session_label || defaultNotifySettings(clinicLocale).notify_session_label,
          notify_session_default: resC.data.notify_session_default ?? defaultNotifySettings(clinicLocale).notify_session_default,
          notify_session_url: resC.data.notify_session_url || defaultNotifySettings(clinicLocale).notify_session_url,
          notify_sms_first: resC.data.notify_sms_first || defaultNotifySettings(clinicLocale).notify_sms_first,
          notify_sms_booking: resC.data.notify_sms_booking || defaultNotifySettings(clinicLocale).notify_sms_booking,
          notify_sms_reschedule: resC.data.notify_sms_reschedule || defaultNotifySettings(clinicLocale).notify_sms_reschedule,
          notify_sms_cancel: resC.data.notify_sms_cancel || defaultNotifySettings(clinicLocale).notify_sms_cancel,
          notify_sms_reminder: resC.data.notify_sms_reminder || defaultNotifySettings(clinicLocale).notify_sms_reminder,
          notify_auto_first: resC.data.notify_auto_first !== false,
          notify_auto_booking: resC.data.notify_auto_booking !== false,
          notify_auto_reschedule: resC.data.notify_auto_reschedule !== false,
          notify_auto_cancel: resC.data.notify_auto_cancel !== false,
          notify_auto_reminder: resC.data.notify_auto_reminder === true,
          notify_channel_email: resC.data.notify_channel_email !== false,
          notify_channel_sms: resC.data.notify_channel_sms !== false,
          notify_on_booking: resC.data.notify_on_booking !== false,
          notify_staff_on_booking: resC.data.notify_staff_on_booking === true,
          staff_alert_first_sessions_only: resC.data.staff_alert_first_sessions_only === true,
          staff_alert_phones: resC.data.staff_alert_phones || '',
          staff_alert_emails: resC.data.staff_alert_emails || '',
          start_time: normalizeTimeInput(resC.data.start_time) || '07:00',
          end_time: normalizeTimeInput(resC.data.end_time) || '20:00',
          weekly_schedule: normalizeWeeklySchedule(resC.data.weekly_schedule, {
            start_time: normalizeTimeInput(resC.data.start_time) || '07:00',
            end_time: normalizeTimeInput(resC.data.end_time) || '20:00',
          }),
          calendar_feed_enabled: resC.data.calendar_feed_enabled === true,
          calendar_feed_token: String(resC.data.calendar_feed_token || '').trim(),
          google_calendar_enabled: resC.data.google_calendar_enabled === true,
          google_calendar_email: resC.data.google_calendar_email || '',
          google_calendar_id: resC.data.google_calendar_id || 'primary',
          google_calendar_connected: Boolean(resC.data.google_calendar_refresh_token),
          ticket_counter: Number(resC.data.ticket_counter) || 793,
        });
      } else {
        const clinicLocale = localeForClinic(activeClinic);
        const defaultCfg = { 
          clinic: clinicId, 
          name: getClinicDefaultName(clinicId), 
          address: '', 
          phone: '', 
          ticket_message: isShenandoah(clinicId) ? 'Thank you for choosing us' : 'Gracias por su preferencia', 
          start_time: '07:00', 
          end_time: '20:00', 
          interval_mins: 30,
          weekly_schedule: buildDefaultWeeklySchedule({ start_time: '07:00', end_time: '20:00' }),
          booking_limit_hours: 2,
          cancel_limit_hours: 24,
          master_pin: '000000',
          financial_pin: '123456',
          notify_on_booking: true,
          reminder_hours: 24,
          ...defaultNotifySettings(clinicLocale),
          ...emptyEmailTemplateState(clinicLocale),
        };
        await clinicDb.from('company_config').insert([defaultCfg]);
        setDbCompanyConfig(defaultCfg);
      }

      if (fetchGen !== fetchGenRef.current) return;

      let appointmentsReady = appointmentsData || [];
      if (currentUserLevel <= 2 && safeServices.length && appointmentsReady.length) {
        try {
          const repairs = await autoRepairOrphanEquipmentNames(clinicDb, safeServices, appointmentsReady);
          if (repairs.length > 0) {
            appointmentsReady = applyEquipmentRepairsToAppointments(appointmentsReady, repairs);
            await logAudit(
              null,
              'Sistema',
              'REPARAR EQUIPOS',
              repairs.map((r) => `«${r.from}» → «${r.to}»`).join('; '),
            );
          }
        } catch (repairErr) {
          console.warn('Auto-repair equipment names failed', repairErr);
        }
      }

      setDbAppointments(appointmentsReady);
      setDbStatus('listo');
      setDbErrorMessage('');
      if (!silent) pendingScrollToNowRef.current = true;
      broadcastLiveDataUpdated(activeClinic);

      if (clinicDb && safePatients.length && appointmentsReady.length) {
        repairStaleAppointmentNames(clinicDb, appointmentsReady, safePatients)
          .then((repaired) => {
            if (repaired > 0 && fetchGen === fetchGenRef.current) {
              fetchAllDataRef.current({ silent: true, liveOnly: true });
            }
          })
          .catch(() => {});
      }
    } catch (err) {
      if (fetchGen !== fetchGenRef.current) return;
      console.error(err);
      const raw = err?.message || String(err);
      setDbErrorMessage(raw);
      setDbStatus('error');
    }
  };

  fetchAllDataRef.current = fetchAllData;

  const syncCalendarLive = useCallback(async () => {
    await fetchAllDataRef.current({ silent: true, liveOnly: true });
    setLiveSyncAt(Date.now());
  }, []);

  const notifyCalendarChanged = useCallback(async () => {
    await syncCalendarLive();
    broadcastLiveDataUpdated(activeClinic);
  }, [activeClinic, syncCalendarLive]);

  useLiveSyncPoll({
    enabled: Boolean(currentUser),
    clinic: activeClinic,
    endpoint: '/api/staff/live-sync',
    visibleIntervalMs: 3000,
    hiddenIntervalMs: 12000,
    onChange: syncCalendarLive,
  });

  useEffect(() => {
    const id = window.setInterval(() => setLiveSyncTick((n) => n + 1), 5000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    slotNotesDirtyRef.current = false;
  }, [selectedSlot?.id]);

  useEffect(() => {
    if (!selectedSlot?.id) return;
    const fresh = dbAppointments.find((a) => a.id === selectedSlot.id);
    if (!fresh) return;
    const patInfo = resolvePatientForAppointment(fresh, dbPatients);
    setSelectedSlot((prev) => {
      if (!prev || prev.id !== fresh.id) return prev;
      const canonicalPatient = patInfo?.patient || fresh.patient;
      const dirty = slotNotesDirtyRef.current;
      return {
        ...prev,
        ...fresh,
        ...appointmentFlagsFromApp(fresh),
        patient: canonicalPatient,
        patientId: patInfo?.id || prev.patientId,
        phone: patInfo?.phone || prev.phone || fresh.phone,
        email: patInfo?.email || prev.email || fresh.email,
        notes: dirty ? prev.notes : sanitizeAppointmentNotesForDisplay(fresh.notes),
        patientNotes: dirty
          ? prev.patientNotes
          : (prev.patientNotes ?? sanitizePatientNotesForDisplay(patInfo?.notes)),
        wallets: prev.wallets,
        adeudo: prev.adeudo,
        packageHistory: prev.packageHistory,
        sessionGroup: prev.sessionGroup,
        groupMembers: prev.groupMembers,
      };
    });
  }, [dbAppointments, dbPatients, selectedSlot?.id]);

  const dbErrorHint = useMemo(() => {
    if (!dbErrorMessage) return L.dbErrorHint;
    if (/unauthorized|sesión|session/i.test(dbErrorMessage)) return L.dbErrorUnauthorized;
    if (/missing supabase|staff_session_secret|database request failed/i.test(dbErrorMessage)) {
      return L.dbErrorServer;
    }
    return L.dbErrorHint;
  }, [dbErrorMessage, L]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const meRes = await fetch('/api/auth/me', { credentials: 'include' });
        const meData = await meRes.json().catch(() => ({}));
        if (cancelled) return;

        if (meData?.user) {
          const user = normalizeStaffSessionUser(meData.user, { roleLevel: meData.user?.accessLevel });
          setCurrentUser(user);
          setActiveClinic(resolveStaffActiveClinic(user));
          return;
        }

        const tdRes = await fetch('/api/auth/trusted-device', { credentials: 'include' });
        const tdData = await tdRes.json().catch(() => ({}));
        if (cancelled) return;

        if (tdData?.trusted && tdData?.emailMasked) {
          setTrustedDevice(tdData);
          setLoginModeTrusted(true);

          if (tdData.pinFresh) {
            const autoRes = await fetch('/api/auth/auto-login', {
              method: 'POST',
              credentials: 'include',
            });
            const autoData = await autoRes.json().catch(() => ({}));
            if (cancelled) return;
            if (autoData?.user) {
              const user = normalizeStaffSessionUser(autoData.user);
              setCurrentUser(user);
              setActiveClinic(resolveStaffActiveClinic(user));
            }
          }
        } else {
          setTrustedDevice(null);
          setLoginModeTrusted(false);
        }
      } catch {
        /* ignore */
      } finally {
        if (!cancelled) setAuthBootstrapping(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (currentUser) fetchAllData();
  }, [activeClinic, currentUser]);

  useEffect(() => {
    if (!currentUser) return;
    const level = resolveStaffRoleLevel(currentUser, dbRoles, activeClinic);
    const allowed = getAllowedClinics(currentUser, { roleLevel: level, dbRoles, activeClinic });
    if (allowed.length && !allowed.includes(activeClinic)) {
      setActiveClinic(allowed[0]);
    }
  }, [currentUser, activeClinic, dbRoles]);

  useEffect(() => {
    if (!currentUser || currentUser.id === 'admin' || !dbRoles.length) return;
    const level = resolveStaffRoleLevel(currentUser, dbRoles, activeClinic);
    const expanded = normalizeStaffSessionUser(currentUser, { roleLevel: level });
    const prev = (currentUser.allowedClinics || []).join('|');
    const next = (expanded?.allowedClinics || []).join('|');
    if (expanded && prev !== next) {
      setCurrentUser(expanded);
    }
  }, [currentUser, dbRoles, activeClinic]);

  // --- MOTORES DE ACCESO Y SEGURIDAD ---
  const handleForgetDevice = async () => {
    try {
      await fetch('/api/auth/forget-device', { method: 'POST', credentials: 'include' });
    } catch {
      /* ignore */
    }
    setTrustedDevice(null);
    setLoginModeTrusted(false);
    setLoginEmail('');
    setLoginPin('');
  };

  const handleLoginSubmit = async () => {
    if (isLoggingIn) return;
    if (!loginModeTrusted && !loginEmail.trim()) {
      alert(staffAlert(locale, 'emailRequired'));
      return;
    }
    setIsLoggingIn(true);
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pin: loginPin,
          email: loginModeTrusted ? '' : loginEmail.trim(),
          rememberDevice: loginModeTrusted ? true : rememberDevice,
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.user) {
        if (result.error === 'locked' && result.lockedMinutes) {
          alert(staffAlert(locale, 'loginLocked', result.lockedMinutes));
        } else if (result.error === 'email_required') {
          alert(staffAlert(locale, 'emailRequired'));
        } else if (result.error === 'email_invalid') {
          alert(staffAlert(locale, 'emailInvalid'));
        } else {
          alert(staffAlert(locale, 'pinInvalid'));
        }
        setLoginPin('');
        return;
      }
      setCurrentUser(normalizeStaffSessionUser(result.user, { roleLevel: result.user?.accessLevel }));
      setActiveClinic(resolveStaffActiveClinic(normalizeStaffSessionUser(result.user, { roleLevel: result.user?.accessLevel })));
      setLoginPin('');
    } catch {
      alert(staffAlert(locale, 'loginFailed'));
      setLoginPin('');
    } finally {
      setIsLoggingIn(false);
    }
  };

  const switchClinic = (clinic) => {
    if (!canAccessClinic(currentUser, clinic, {
      roleLevel: currentUserLevel,
      dbRoles,
      activeClinic,
    })) {
      alert(staffAlert(locale, 'noClinicAccess'));
      return;
    }
    setActiveClinic(normalizeClinicId(clinic));
    saveStaffActiveClinic(clinic);
  };

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
    } catch {
      // ignore
    }
    setCurrentUser(null);
    setLoginPin('');
    setActiveTab('Agenda');
    setIsReportsUnlocked(false);
    setActiveClinic(CLINIC_OXYGENDGL);
    setDbStatus('sin_sesion');
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
  const currentDateISO = formatClinicDateIso(currentDate, activeClinic);
  const currentFullDate = currentDateISO;

  const weekDays = useMemo(
    () => buildCalendarWeek(locale, currentDate, activeClinic),
    [locale, currentDate, activeClinic],
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

  const PIXELS_PER_MINUTE = CALENDAR_PIXELS_PER_MINUTE;
  const CALENDAR_PAD_MINS = 30;
  const CALENDAR_END_PAD_MINS = 60;
  const clinicGridBounds = useMemo(
    () => getClinicCalendarGridBounds(dbCompanyConfig),
    [dbCompanyConfig],
  );
  const startMins = clinicGridBounds.startMins;
  const endMins = clinicGridBounds.endMins;
  const calendarEndMins = endMins + CALENDAR_END_PAD_MINS;
  const calendarStartMins = startMins - CALENDAR_PAD_MINS;
  const intervalMins = Number(dbCompanyConfig.interval_mins) || 30;
  const weekdayLabels = useMemo(() => getWeekdayLabels(locale), [locale]);

  const updateWeeklyDay = (key, patch) => {
    setDbCompanyConfig((prev) => {
      const defaults = {
        start_time: normalizeTimeInput(prev.start_time) || '07:00',
        end_time: normalizeTimeInput(prev.end_time) || '20:00',
      };
      const schedule = normalizeWeeklySchedule(prev.weekly_schedule, defaults);
      return {
        ...prev,
        weekly_schedule: {
          ...schedule,
          [key]: {
            ...schedule[key],
            ...patch,
          },
        },
      };
    });
  };

  const CALENDAR_HEIGHT = (calendarEndMins - calendarStartMins) * PIXELS_PER_MINUTE;
  const currentColWidth = (160 * zoomScale) / 100;
  const isCompact = isCompactColumn(currentColWidth);
  const fitAllEquipOnScreen = isMobileViewport && viewMode === 'Día';

  const timeToPixels = (timeStr) => {
    return (getMinutes(timeStr) - calendarStartMins) * PIXELS_PER_MINUTE;
  };

  const activeServices = dbServices.filter(s => s.is_active);
  const { columns: calendarEquipmentColumns, assessmentService } = useMemo(
    () => buildCalendarEquipmentColumns(dbServices),
    [dbServices],
  );
  const dynamicColumns = calendarEquipmentColumns;
  const appointmentEquipment = useCallback(
    (equipment) => resolveAppointmentEquipment(equipment, dbServices),
    [dbServices],
  );
  const assessmentOnlyMode = Boolean(
    assessmentService && equipmentFilter === assessmentService,
  );
  const showAssessmentBand = Boolean(
    assessmentService && equipmentFilter === 'Todos',
  );
  const weekStickyHeaderPx = showAssessmentBand
    ? WEEK_STICKY_HEADER_PX + ASSESSMENT_BAND_HEIGHT_PX
    : WEEK_STICKY_HEADER_PX;
  const displayedEquipments = assessmentOnlyMode
    ? [assessmentService]
    : (equipmentFilter === 'Todos' ? dynamicColumns : [equipmentFilter]);
  const filterChipEquipments = assessmentService
    ? [...dynamicColumns, assessmentService]
    : dynamicColumns;

  const calendarAppointments = useMemo(
    () => dbAppointments.map((app) => withCanonicalPatientName(app, dbPatients)),
    [dbAppointments, dbPatients],
  );

  const getAssessmentAppsForDay = useCallback((fullDate) => {
    if (!assessmentService) return [];
    return calendarAppointments.filter(
      (app) => app.full_date === fullDate
        && app.check_in_status !== 'Cancelado'
        && appointmentEquipment(app.equipment) === assessmentService,
    );
  }, [assessmentService, calendarAppointments, appointmentEquipment]);

  const weekDayLayouts = useMemo(() => {
    if (viewMode !== 'Semana') return {};
    const layouts = {};
    const names = equipmentFilter === 'Todos'
      ? dynamicColumns
      : dynamicColumns.filter((eq) => eq === equipmentFilter);
    const equipNames = assessmentOnlyMode
      ? [assessmentService]
      : (names.length ? names : dynamicColumns);
    for (const day of weekDays) {
      layouts[day.fullDate] = weekDayColumnWidths({
        equipmentNames: equipNames,
        colWidth: currentColWidth,
      });
    }
    return layouts;
  }, [
    viewMode,
    weekDays,
    equipmentFilter,
    dynamicColumns,
    assessmentOnlyMode,
    assessmentService,
    currentColWidth,
  ]);

  const activeClinicTheme = useMemo(() => getClinicTheme(activeClinic), [activeClinic]);
  const activeClinicShort = getClinicShortLabel(activeClinic);
  const activeClinicDisplayName = useMemo(() => {
    const configured = formatClinicField(dbCompanyConfig?.name);
    if (configured) return configured;
    return getClinicDefaultName(activeClinic);
  }, [dbCompanyConfig?.name, activeClinic]);

  const getRepeatDateStatusForSlot = useCallback((isoDate) => {
    const service = dbServices.find((s) => s.name === selectedSlot?.equipment);
    const sessionTimes = resolveSessionTimes(selectedSlot || {});
    return getRepeatDateAvailability({
      isoDate,
      companyConfig: dbCompanyConfig,
      service,
      equipment: selectedSlot?.equipment,
      time: selectedSlot?.time,
      duration: sessionTimes.duration,
      buffer: sessionTimes.buffer,
      appointments: dbAppointments,
      blockedSlots: dbBlockedSlots,
      outsideNormalHours: !!selectedSlot?.outside_normal_hours,
    });
  }, [selectedSlot, dbCompanyConfig, dbServices, dbAppointments, dbBlockedSlots]);

  const calendarFeedUrl = useMemo(() => {
    if (!dbCompanyConfig.calendar_feed_enabled || !dbCompanyConfig.calendar_feed_token) return '';
    return buildCalendarFeedUrl({
      clinic: activeClinic,
      token: dbCompanyConfig.calendar_feed_token,
      baseUrl: typeof window !== 'undefined' ? window.location.origin : undefined,
    });
  }, [activeClinic, dbCompanyConfig.calendar_feed_enabled, dbCompanyConfig.calendar_feed_token]);

  const copyCalendarFeedUrl = async (webcal = false) => {
    if (!calendarFeedUrl) {
      alert(L.p.admin.calendarFeedSaveFirst);
      return;
    }
    if (!dbCompanyConfig.id) {
      alert(L.p.admin.promoterCalendarSaveConfigFirst);
      return;
    }
    try {
      const probe = await fetch(calendarFeedUrl, { method: 'GET', cache: 'no-store' });
      if (!probe.ok) {
        alert(L.p.admin.promoterCalendarFeedBroken);
        return;
      }
    } catch {
      alert(L.p.admin.promoterCalendarFeedBroken);
      return;
    }
    const value = webcal ? buildWebcalFeedUrl(calendarFeedUrl) : calendarFeedUrl;
    try {
      await navigator.clipboard.writeText(value);
      alert(L.p.admin.calendarFeedCopied);
    } catch {
      window.prompt(L.p.admin.calendarFeedClinicUrl, value);
    }
  };

  const openGoogleCalendarSubscribe = () => {
    if (!calendarFeedUrl) {
      alert(L.p.admin.calendarFeedSaveFirst);
      return;
    }
    window.open(buildGoogleCalendarSubscribeUrl(calendarFeedUrl), '_blank', 'noopener,noreferrer');
  };

  const fetchGoogleCalendarApiStatus = async () => {
    try {
      const res = await fetch(`/api/staff/google-calendar/status?clinic=${encodeURIComponent(activeClinic)}`, {
        credentials: 'include',
        cache: 'no-store',
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return;
      setGoogleCalendarApiStatus({
        configured: data.configured === true,
        connected: data.connected === true,
        sqlRequired: data.sqlRequired === true,
        email: data.email || '',
      });
      setDbCompanyConfig((prev) => ({
        ...prev,
        google_calendar_connected: data.connected === true,
        google_calendar_email: data.email || prev.google_calendar_email,
        google_calendar_enabled: data.enabled === true,
      }));
    } catch {
      /* ignore */
    }
  };

  const pushGoogleCalendarSync = (appointmentId, action = 'upsert') => {
    if (!appointmentId) return;
    fetch('/api/staff/google-calendar/sync-appointment', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clinic: activeClinic, appointmentId, action }),
    }).catch(() => {});
  };

  const connectGoogleCalendar = () => {
    window.location.href = `/api/staff/google-calendar/auth?clinic=${encodeURIComponent(activeClinic)}`;
  };

  const disconnectGoogleCalendar = async () => {
    if (!window.confirm(locale === 'en' ? 'Disconnect Google Calendar for this clinic?' : '¿Desconectar Google Calendar de esta clínica?')) return;
    try {
      const res = await fetch('/api/staff/google-calendar/disconnect', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clinic: activeClinic }),
      });
      if (!res.ok) throw new Error('disconnect_failed');
      setDbCompanyConfig((prev) => ({
        ...prev,
        google_calendar_enabled: false,
        google_calendar_connected: false,
        google_calendar_email: '',
      }));
      await fetchGoogleCalendarApiStatus();
    } catch {
      alert(L.p.admin.googleCalendarConnectError);
    }
  };

  const bulkSyncGoogleCalendar = async () => {
    try {
      const res = await fetch('/api/staff/google-calendar/sync-appointment', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clinic: activeClinic, bulkSync: true }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'sync_failed');
      alert(L.p.admin.googleCalendarBulkDone(data.synced || 0));
    } catch {
      alert(L.p.admin.googleCalendarConnectError);
    }
  };

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const gc = params.get('googleCalendar');
    if (!gc) return;
    if (gc === 'connected') {
      alert(L.p.admin.googleCalendarConnectedOk);
      fetchGoogleCalendarApiStatus();
    } else if (gc === 'error') {
      const reason = params.get('reason') || '';
      if (reason === 'sql_required') alert(L.p.admin.googleCalendarSqlRequired);
      else alert(L.p.admin.googleCalendarConnectError);
    }
    params.delete('googleCalendar');
    params.delete('reason');
    params.delete('clinic');
    const qs = params.toString();
    const next = `${window.location.pathname}${qs ? `?${qs}` : ''}`;
    window.history.replaceState({}, '', next);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (activeTab === 'Admin' && currentUserLevel <= 2) {
      fetchGoogleCalendarApiStatus();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, activeClinic, currentUserLevel]);

  const buildPromoterCalendarFeedUrl = (promoter) => {
    const token = String(promoter?.calendar_feed_token || '').trim();
    if (!dbCompanyConfig.calendar_feed_enabled || !token) return '';
    return buildCalendarFeedUrl({
      clinic: activeClinic,
      token,
      baseUrl: typeof window !== 'undefined' ? window.location.origin : undefined,
    });
  };

  const copyPromoterCalendarFeed = async (promoter) => {
    if (!dbCompanyConfig.calendar_feed_enabled) {
      alert(L.p.admin.promoterCalendarDisabled);
      return;
    }
    if (!dbCompanyConfig.id || !String(dbCompanyConfig.calendar_feed_token || '').trim()) {
      alert(L.p.admin.promoterCalendarSaveConfigFirst);
      return;
    }
    const url = buildPromoterCalendarFeedUrl(promoter);
    if (!url) {
      alert(L.p.admin.promoterCalendarTokenMissing);
      return;
    }
    try {
      const probe = await fetch(url, { method: 'GET', cache: 'no-store' });
      if (!probe.ok) {
        alert(L.p.admin.promoterCalendarFeedBroken);
        return;
      }
    } catch {
      alert(L.p.admin.promoterCalendarFeedBroken);
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
      alert(L.p.admin.promoterCalendarCopied);
    } catch {
      window.prompt(L.p.admin.promoterCalendarLink, url);
    }
  };

  const regeneratePromoterCalendarToken = async (promoter) => {
    const hasToken = Boolean(String(promoter?.calendar_feed_token || '').trim());
    if (hasToken && !window.confirm(L.p.admin.promoterCalendarRegenerateConfirm)) return;
    const clinicDb = createStaffDb(activeClinic);
    const nextToken = generateCalendarFeedToken();
    let res = await clinicDb
      .from('promoters')
      .update({ calendar_feed_token: nextToken })
      .eq('id', promoter.id)
      .select('*');
    if (res.error && /calendar_feed_token|column|schema cache/i.test(res.error.message || '')) {
      alert(L.p.admin.promoterTableMissing);
      return;
    }
    if (res.error) {
      alert(`${L.p.admin.promoterSaveError}: ${res.error.message}`);
      return;
    }
    fetchAllData();
  };

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

  const scrollCalendarToNow = useCallback((behavior = 'auto') => {
    const el = calendarScrollRef.current;
    if (!el || !clinicNow.dateStr) return false;

    const topPx = (clinicNow.mins - calendarStartMins) * PIXELS_PER_MINUTE;
    const verticalOffset = Math.max(0, topPx - el.clientHeight * 0.15);

    let horizontalOffset = el.scrollLeft;
    if (viewMode === 'Semana') {
      const weekLeft = getWeekScrollLeftForToday(el, clinicNow.dateStr);
      if (weekLeft === null) return false;
      horizontalOffset = weekLeft;
    }

    el.scrollTo({ top: verticalOffset, left: horizontalOffset, behavior });
    window.requestAnimationFrame(() => {
      setCalendarHScroll({
        left: el.scrollLeft,
        max: Math.max(0, el.scrollWidth - el.clientWidth),
      });
    });
    return true;
  }, [clinicNow.dateStr, clinicNow.mins, calendarStartMins, viewMode]);

  const syncCalendarHScroll = useCallback(() => {
    const el = calendarScrollRef.current;
    if (!el) return;
    setCalendarHScroll({
      left: el.scrollLeft,
      max: Math.max(0, el.scrollWidth - el.clientWidth),
    });
  }, []);

  const scrollCalendarHorizontal = useCallback((delta, behavior = 'smooth') => {
    const el = calendarScrollRef.current;
    if (!el) return;
    const max = Math.max(0, el.scrollWidth - el.clientWidth);
    const next = Math.max(0, Math.min(el.scrollLeft + delta, max));
    el.scrollTo({ left: next, behavior });
  }, []);

  const setCalendarScrollLeft = useCallback((left, behavior = 'auto') => {
    const el = calendarScrollRef.current;
    if (!el) return;
    const max = Math.max(0, el.scrollWidth - el.clientWidth);
    el.scrollTo({ left: Math.max(0, Math.min(left, max)), behavior });
  }, []);

  useEffect(() => {
    const el = calendarScrollRef.current;
    if (!el || activeTab !== 'Agenda') return undefined;

    const onScroll = () => syncCalendarHScroll();
    el.addEventListener('scroll', onScroll, { passive: true });
    const ro = typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver(() => syncCalendarHScroll())
      : null;
    ro?.observe(el);
    syncCalendarHScroll();
    const t = window.setTimeout(syncCalendarHScroll, 400);

    return () => {
      el.removeEventListener('scroll', onScroll);
      ro?.disconnect();
      window.clearTimeout(t);
    };
  }, [
    activeTab,
    syncCalendarHScroll,
    viewMode,
    dbAppointments.length,
    weekDayLayouts,
    zoomScale,
    displayedEquipments.length,
  ]);

  useEffect(() => {
    if (!pendingScrollToNowRef.current) return;
    if (activeTab !== 'Agenda' || dbStatus !== 'listo' || !clinicNow.dateStr) return;
    if (viewMode === 'Semana' && displayedEquipments.length === 0) return;

    let attempts = 0;
    let timerId = null;
    let cancelled = false;
    const maxAttempts = 12;
    const el = calendarScrollRef.current;

    const cancelAutoScroll = () => {
      cancelled = true;
      pendingScrollToNowRef.current = false;
      if (timerId) window.clearTimeout(timerId);
    };

    // Si el usuario toca o hace scroll, no pelear con el auto-scroll a "ahora".
    el?.addEventListener('touchstart', cancelAutoScroll, { passive: true, once: true });
    el?.addEventListener('wheel', cancelAutoScroll, { passive: true, once: true });
    el?.addEventListener('pointerdown', cancelAutoScroll, { passive: true, once: true });

    const tryScroll = () => {
      if (cancelled || !pendingScrollToNowRef.current) return;
      attempts += 1;
      const scrollEl = calendarScrollRef.current;
      const hasTodayCol = viewMode === 'Día' || Boolean(
        scrollEl?.querySelector(`[data-cal-day="${clinicNow.dateStr}"]`),
      );
      if (!hasTodayCol) {
        if (attempts < maxAttempts) timerId = window.setTimeout(tryScroll, 120);
        else pendingScrollToNowRef.current = false;
        return;
      }

      const topPx = (clinicNow.mins - calendarStartMins) * PIXELS_PER_MINUTE;
      const targetTop = Math.max(0, topPx - (scrollEl?.clientHeight || 0) * 0.15);
      const targetLeft = viewMode === 'Semana' ? getWeekScrollLeftForToday(scrollEl, clinicNow.dateStr) : null;

      const scrolled = scrollCalendarToNow('auto');
      const topOk = !scrollEl || Math.abs(scrollEl.scrollTop - targetTop) < 12;
      const leftOk = viewMode === 'Día' || targetLeft === null || Math.abs(scrollEl.scrollLeft - targetLeft) < 12;

      if ((scrolled && topOk && leftOk) || attempts >= maxAttempts) {
        pendingScrollToNowRef.current = false;
        return;
      }
      timerId = window.setTimeout(tryScroll, 120);
    };

    timerId = window.setTimeout(tryScroll, 100);
    return () => {
      cancelled = true;
      if (timerId) window.clearTimeout(timerId);
      el?.removeEventListener('touchstart', cancelAutoScroll);
      el?.removeEventListener('wheel', cancelAutoScroll);
      el?.removeEventListener('pointerdown', cancelAutoScroll);
    };
  }, [
    activeTab,
    dbStatus,
    clinicNow.dateStr,
    scrollCalendarToNow,
    viewMode,
    currentDateISO,
    CALENDAR_HEIGHT,
    displayedEquipments.length,
    zoomScale,
  ]);

  useEffect(() => {
    const onPageShow = (event) => {
      if (!currentUser || activeTab !== 'Agenda') return;
      if (!event.persisted) return;
      const now = getClinicNow(activeClinic);
      setCurrentDate(now.date);
      pendingScrollToNowRef.current = true;
    };
    window.addEventListener('pageshow', onPageShow);
    return () => window.removeEventListener('pageshow', onPageShow);
  }, [currentUser, activeTab, activeClinic]);

  useEffect(() => {
    prefsHydratedRef.current = false;
    skipAutoZoomRef.current = true;
    const prefs = loadCalendarPrefs(activeClinic);
    const mobile = window.matchMedia('(max-width: 1023px)').matches;
    if (!mobile && (prefs?.viewMode === 'Día' || prefs?.viewMode === 'Semana')) {
      setViewMode(prefs.viewMode);
    }
    if (prefs?.equipmentFilter) {
      setEquipmentFilter(prefs.equipmentFilter);
    }
    if (typeof prefs?.zoomScale === 'number') setZoomScale(prefs.zoomScale);
    if (prefs?.zoomManual) setZoomManual(true);
    if (prefs?.weekFilterHintDismissed) setWeekFilterHintDismissed(true);
    prefsHydratedRef.current = true;
    if (activeTab === 'Agenda') pendingScrollToNowRef.current = true;
    const t = setTimeout(() => { skipAutoZoomRef.current = false; }, 0);
    return () => clearTimeout(t);
  }, [activeClinic, activeTab]);

  useEffect(() => {
    if (filterChipEquipments.length === 0) return;
    if (equipmentFilter !== 'Todos' && !filterChipEquipments.includes(equipmentFilter)) {
      setEquipmentFilter('Todos');
      setZoomManual(false);
    }
  }, [filterChipEquipments, equipmentFilter]);

  useEffect(() => {
    if (!prefsHydratedRef.current || displayedEquipments.length === 0 || skipAutoZoomRef.current) return;
    if (zoomManual) return;
    setZoomScale(computeDefaultZoomScale({
      viewMode,
      equipmentCount: displayedEquipments.length,
      isMobile: isMobileViewport,
    }));
  }, [viewMode, equipmentFilter, displayedEquipments.length, isMobileViewport, zoomManual, activeTab]);

  // Solo forzar scroll a "ahora" al cambiar vista/filtro, no en cada recálculo de zoom.
  useEffect(() => {
    if (!prefsHydratedRef.current || activeTab !== 'Agenda') return;
    pendingScrollToNowRef.current = true;
  }, [viewMode, equipmentFilter, activeTab]);

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
    for (let m = calendarStartMins; m < calendarEndMins; m += intervalMins) {
      const h = Math.floor(m / 60); 
      const mins = m % 60; 
      const ampm = h >= 12 ? 'PM' : 'AM'; 
      const displayH = h > 12 ? h - 12 : h === 0 ? 12 : h;
      slots.push(`${displayH.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')} ${ampm}`);
    }
    return slots;
  }, [calendarStartMins, calendarEndMins, intervalMins]);

  const normalizeTimeInputValue = (value, fallback = '07:00') => {
    const raw = String(value || '').trim();
    const match = raw.match(/^(\d{1,2}):(\d{2})/);
    if (!match) return fallback;
    return `${String(match[1]).padStart(2, '0')}:${match[2]}`;
  };

  const openBlockSlotModal = () => {
    const defaultEquip = dynamicColumns[0] || dbServices.find((s) => s.is_active)?.name || '';
    setOOOData({
      id: null,
      date: clinicNow.dateStr || formatClinicDateIso(currentDate, activeClinic),
      start_time: '07:00',
      end_time: '19:00',
      is_global: true,
      equipment: defaultEquip,
      reason: locale === 'en' ? 'Holiday / Maintenance' : 'Festivo / Mantenimiento',
    });
    setShowOOOModal(true);
  };

  const openBlockedSlotEditor = (block) => {
    if (!block?.id) return;
    const defaultEquip = dynamicColumns[0] || dbServices.find((s) => s.is_active)?.name || '';
    setOOOData({
      id: block.id,
      date: block.date || clinicNow.dateStr || formatClinicDateIso(currentDate, activeClinic),
      start_time: normalizeTimeInputValue(block.start_time, '07:00'),
      end_time: normalizeTimeInputValue(block.end_time, '19:00'),
      is_global: block.is_global !== false && !block.equipment,
      equipment: block.equipment || defaultEquip,
      reason: block.reason || (locale === 'en' ? 'Blocked' : 'Bloqueo'),
    });
    setShowOOOModal(true);
  };

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
      promoter_code: '',
    };
  };

  const openNewAppointment = (draft = {}) => {
    setRepeatBooking({ enabled: false, dates: [] });
    const base = createEmptyAppointmentDraft();
    const firstSrv = dbServices.find((s) => s.is_active);
    const merged = { ...base, ...draft };
    if (firstSrv && (!merged.serviceId || !merged.equipment)) {
      const dur = Number(firstSrv.duration) || 60;
      const buf = Number(firstSrv.buffer ?? 30);
      merged.serviceId = merged.serviceId || firstSrv.id;
      merged.equipment = merged.equipment || firstSrv.name;
      merged.duration = merged.duration || dur;
      merged.buffer = merged.buffer ?? buf;
      merged.sessionPreset = merged.sessionPreset || getPresetFromTimes(dur, buf).id;
    }
    setSelectedSlot(merged);
    setShowNewAppointment(true);
  };

  const buildDraftFromScreenshot = (form) => {
    const equipmentFallback = defaultEquipmentForClinic(activeClinic, dbServices);
    const srv = dbServices.find((s) => s.name === form.equipment && s.is_active)
      || dbServices.find((s) => s.is_active);
    const duration = Number(srv?.duration) || 60;
    const buffer = Number(srv?.buffer ?? 30);
    const exact = dbPatients.find((x) => normalizeStr(x.patient) === normalizeStr(form.patient));
    const fullDate = form.fullDate;
    const time = normalizeAppointmentTime(form.time) || String(form.time || '').trim();
    const equipment = form.equipment || equipmentFallback || srv?.name || '';
    return {
      ...createEmptyAppointmentDraft(),
      patient: String(form.patient || '').trim(),
      patientId: exact?.id || null,
      phone: form.phone || '',
      email: form.email || exact?.email || '',
      protocol: exact?.protocol || 'Wellness',
      patientNotes: exact?.notes || '',
      fullDate,
      full_date: fullDate,
      day: fullDate ? getDayNameFromDate(locale, new Date(`${fullDate}T12:00:00`)) : currentDayInfo.name,
      time,
      notes: form.notes || '',
      equipment,
      serviceId: srv?.id ?? '',
      duration,
      buffer,
      sessionPreset: getPresetFromTimes(duration, buffer).id,
      is_new_patient: !exact,
      prefers_email: exact ? exact.prefers_email !== false : true,
      prefers_sms: exact ? exact.prefers_sms !== false : true,
    };
  };

  const screenshotIntakeLabels = useMemo(() => ({
    title: L.p.appt.screenshotTitle,
    subtitle: L.p.appt.screenshotSubtitle,
    pickImage: L.p.appt.screenshotPick,
    pickImageHint: L.p.appt.screenshotPickHint,
    analyze: L.p.appt.screenshotAnalyze,
    analyzing: L.p.appt.screenshotAnalyzing,
    recognizedTitle: L.p.appt.screenshotRecognized,
    confirmHint: L.p.appt.screenshotConfirmHint,
    confirmSchedule: L.p.appt.screenshotConfirm,
    back: L.p.appt.screenshotBack,
    cancel: L.p.common.cancel,
    notConfigured: L.p.appt.screenshotNotConfigured,
    processingHint: L.p.appt.screenshotProcessingHint,
    analyzeError: L.p.appt.screenshotAnalyzeError,
    scheduleError: L.p.appt.screenshotScheduleError,
    missingFields: L.p.appt.screenshotMissingFields,
    invalidImage: L.p.appt.screenshotInvalidImage,
    imageTooLarge: L.p.appt.screenshotTooLarge,
    readError: L.p.appt.screenshotReadError,
    confidenceLabel: L.p.appt.screenshotConfidence,
    confidenceHigh: L.p.appt.screenshotConfidenceHigh,
    confidenceMedium: L.p.appt.screenshotConfidenceMedium,
    confidenceLow: L.p.appt.screenshotConfidenceLow,
    patient: L.p.appt.patientName,
    date: L.p.appt.date,
    time: L.p.appt.time,
    phone: L.p.appt.phone,
    equipment: L.p.appt.equipment,
    notes: L.p.appt.noteToday,
  }), [L]);

  const screenshotDefaultEquipment = useMemo(
    () => defaultEquipmentForClinic(activeClinic, dbServices),
    [activeClinic, dbServices],
  );

  const agentChatLabels = useMemo(() => ({
    title: locale === 'en' ? 'Assistant' : 'Asistente',
    subtitle: locale === 'en' ? 'By your access level' : 'Según tu nivel de acceso',
  }), [locale]);

  const newAppointmentMissing = useMemo(() => {
    if (!showNewAppointment || !selectedSlot) return [];
    return getMissingAppointmentFields(selectedSlot, locale);
  }, [showNewAppointment, selectedSlot, locale]);

  const newAppointmentPatientBlocked = useMemo(() => {
    if (!showNewAppointment || !selectedSlot?.patient) return false;
    if (selectedSlot.is_blocked) return true;
    if (selectedSlot.patientId) {
      return !!dbPatients.find((p) => String(p.id) === String(selectedSlot.patientId) && p.is_blocked);
    }
    return !!dbPatients.find(
      (p) => normalizeStr(p.patient) === normalizeStr(selectedSlot.patient) && p.is_blocked,
    );
  }, [showNewAppointment, selectedSlot, dbPatients]);

  const formatAppointmentDateWithWeekday = (isoDate) => {
    const iso = String(isoDate || '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso || '—';
    const dayName = getDayNameFromDate(locale, new Date(`${iso}T12:00:00`));
    return `${dayName} · ${iso}`;
  };

  useEffect(() => {
    if (!showNewAppointment || !repeatBooking.enabled) return;
    const d = selectedSlot?.fullDate || selectedSlot?.full_date;
    if (!d) return;
    setRepeatBooking((prev) => {
      if (!prev.enabled || prev.dates.includes(d)) return prev;
      if (!selectedSlot?.time) return { ...prev, dates: prev.dates };
      const status = getRepeatDateAvailability({
        isoDate: d,
        companyConfig: dbCompanyConfig,
        service: dbServices.find((s) => s.name === selectedSlot?.equipment),
        equipment: selectedSlot?.equipment,
        time: selectedSlot?.time,
        duration: resolveSessionTimes(selectedSlot).duration,
        buffer: resolveSessionTimes(selectedSlot).buffer,
        appointments: dbAppointments,
        blockedSlots: dbBlockedSlots,
        outsideNormalHours: !!selectedSlot?.outside_normal_hours,
      });
      if (!status.selectable) return prev;
      return { ...prev, dates: sortOccurrenceDates([...prev.dates, d]) };
    });
  }, [
    showNewAppointment,
    repeatBooking.enabled,
    selectedSlot?.fullDate,
    selectedSlot?.full_date,
    selectedSlot?.time,
    selectedSlot?.equipment,
    selectedSlot?.outside_normal_hours,
    dbCompanyConfig,
    dbServices,
    dbAppointments,
    dbBlockedSlots,
  ]);

  useEffect(() => {
    if (!showNewAppointment || !repeatBooking.enabled || !selectedSlot?.time) return;
    const filtered = repeatBooking.dates.filter((iso) => getRepeatDateStatusForSlot(iso).selectable);
    if (filtered.length !== repeatBooking.dates.length) {
      setRepeatBooking((prev) => ({ ...prev, dates: filtered }));
    }
  }, [
    showNewAppointment,
    repeatBooking.enabled,
    repeatBooking.dates,
    selectedSlot?.time,
    selectedSlot?.equipment,
    selectedSlot?.outside_normal_hours,
    getRepeatDateStatusForSlot,
  ]);

  const selectedSlotSessionSummary = useMemo(() => {
    if (!selectedSlot) return null;
    return buildSessionSummary({
      historicoSesiones: selectedSlot.historicoSesiones,
      adeudo: selectedSlot.adeudo,
      wallets: selectedSlot.wallets,
      packageHistory: selectedSlot.packageHistory,
      equipment: selectedSlot.equipment,
      servicePrice: selectedSlot.servicePrice || getServicePrice(dbServices, selectedSlot.equipment),
      sessionGroup: selectedSlot.sessionGroup,
      groupMembers: selectedSlot.groupMembers,
      patientName: selectedSlot.patient,
    });
  }, [selectedSlot, dbServices]);

  const selectedSlotConfirmationInfo = useMemo(() => {
    if (!selectedSlot || !isShenandoah(activeClinic)) return null;
    return explainConfirmationState({
      appointment: selectedSlot,
      allAppointments: dbAppointments,
      companyConfig: dbCompanyConfig,
      clinicName: activeClinic,
    });
  }, [selectedSlot, activeClinic, dbAppointments, dbCompanyConfig]);

  const selectedSlotWalletBalance = useMemo(() => {
    if (!selectedSlot) return 0;
    const ctx = resolveWalletContext({
      patient: selectedSlot,
      sessionGroup: selectedSlot.sessionGroup,
      equipment: selectedSlot.equipment,
      servicePrice: selectedSlot.servicePrice || getServicePrice(dbServices, selectedSlot.equipment),
    });
    return hasPaidSessionBalance(
      ctx.wallets,
      selectedSlot.equipment,
      selectedSlot.servicePrice || getServicePrice(dbServices, selectedSlot.equipment),
    );
  }, [selectedSlot, dbServices]);

  const selectedPromoterContext = useMemo(() => {
    if (!selectedSlot) return null;
    return resolvePromoterContext({
      promoterCode: selectedSlot.promoter_code,
      notes: selectedSlot.notes,
      promoterList: dbPromoters,
    });
  }, [selectedSlot, dbPromoters]);

  const getPatientSessionGroup = useCallback((patient) => {
    if (!patient) return null;
    const group = findGroupForPatient(patient, dbSessionGroups);
    return enrichGroupForDisplay(group, dbPatients);
  }, [dbSessionGroups, dbPatients]);

  const attachSessionContext = useCallback((slot, patInfo) => {
    const group = patInfo ? getPatientSessionGroup(patInfo) : null;
    const servicePrice = getServicePrice(dbServices, slot?.equipment);
    return {
      ...slot,
      sessionGroupId: patInfo?.sessionGroupId || null,
      sessionGroup: group,
      groupMembers: group?.members || [],
      servicePrice,
    };
  }, [dbServices, getPatientSessionGroup]);

  const applySessionDataToSelectedSlot = useCallback((patch = {}) => {
    setSelectedSlot((prev) => {
      if (!prev) return prev;
      const { patientId, wallets, adeudo, packageHistory, sessionGroup } = patch;
      const pat = patientId
        ? dbPatients.find((p) => String(p.id) === String(patientId))
        : null;
      const prevPatientId = prev.patientId || prev.id;
      const matchesPatient =
        (patientId && prevPatientId && String(prevPatientId) === String(patientId))
        || (pat && normalizeStr(pat.patient) === normalizeStr(prev.patient))
        || (pat && prev.phone && digitsOnly(pat.phone).slice(-10) === digitsOnly(prev.phone).slice(-10));
      const matchesGroup =
        sessionGroup?.id && prev.sessionGroup?.id === sessionGroup.id;

      if (!matchesPatient && !matchesGroup) return prev;

      const next = { ...prev };

      if (matchesPatient && (wallets != null || packageHistory != null || adeudo != null)) {
        const repaired = repairLegacyWalletKeys(
          wallets ?? prev.wallets ?? {},
          packageHistory ?? prev.packageHistory ?? [],
        );
        next.wallets = repaired.wallets;
        next.adeudo = adeudo ?? next.adeudo ?? 0;
        next.packageHistory = packageHistory ?? next.packageHistory ?? [];
      }

      if (matchesGroup && sessionGroup) {
        const enriched = enrichGroupForDisplay(sessionGroup, dbPatients);
        next.sessionGroup = enriched;
        next.groupMembers = enriched?.members || [];
        next.sessionGroupId = sessionGroup.id;
      }

      return next;
    });
  }, [dbPatients]);

  const processSessionDeduction = async (patient, equipment, servicePrice) => {
    if (!patient?.id) return { deducted: false, nextAdeudo: 0, walletContext: null };
    const sessionGroup = getPatientSessionGroup(patient);
    const walletContext = resolveWalletContext({
      patient,
      sessionGroup,
      equipment,
      servicePrice,
    });
    if (isAssessmentService(equipment)) {
      return {
        deducted: false,
        nextAdeudo: walletContext.adeudo,
        walletContext,
        consumed: { deducted: false, walletKey: null },
        skippedAssessment: true,
      };
    }
    const consumed = consumeSessionFromWallet(walletContext.wallets, equipment, servicePrice);
    let nextAdeudo = walletContext.adeudo;
    if (!consumed.deducted) nextAdeudo += 1;

    await persistWalletAfterConsume({
      supabase: activeSupabase,
      walletContext,
      consumed,
      nextAdeudo,
      patientId: patient.id,
      historicoSesiones: (patient.historicoSesiones || 0) + 1,
    });

    return { deducted: consumed.deducted, nextAdeudo, walletContext, consumed };
  };

  const resolveDefaultAttendant = useCallback((appAttendant) => {
    const saved = String(appAttendant || '').trim();
    if (saved && saved !== 'Por Asignar') return saved;
    return currentUser?.name || saved || '';
  }, [currentUser?.name]);

  const openAppointmentDetails = (app) => {
    const patInfo = resolvePatientForAppointment(app, dbPatients);
    const contact = resolveDisplayContact(app, patInfo);
    if (
      patInfo?.id
      && isStaleAppointmentPatientName(app, patInfo)
      && activeSupabase
    ) {
      syncAppointmentPatientName(activeSupabase, app.id, patInfo.patient).catch((err) => {
        console.error('No se pudo sincronizar nombre en cita', err);
      });
      setDbAppointments((prev) => prev.map((row) => (
        row.id === app.id ? { ...row, patient: patInfo.patient } : row
      )));
    }
    let repairedWallets = {};
    if (patInfo) {
      const repaired = repairLegacyWalletKeys(patInfo.wallets || {}, patInfo.packageHistory || []);
      repairedWallets = repaired.wallets;
      if (repaired.changed && patInfo.id && activeSupabase) {
        activeSupabase.from('patients').update({ wallets: repaired.wallets }).eq('id', patInfo.id);
        setDbPatients((prev) => prev.map((p) => (
          String(p.id) === String(patInfo.id) ? { ...p, wallets: repaired.wallets } : p
        )));
      }
    }
    setSelectedSlot(attachSessionContext({
      ...app,
      status: 'booked',
      patient: patInfo?.patient || app.patient,
      patientId: patInfo?.id,
      patientNotes: sanitizePatientNotesForDisplay(patInfo?.notes),
      phone: contact.phone,
      email: contact.email,
      protocol: patInfo?.protocol || app.protocol,
      notes: sanitizeAppointmentNotesForDisplay(app.notes),
      wallets: patInfo ? repairedWallets : {},
      historicoSesiones: patInfo?.historicoSesiones || 0,
      adeudo: patInfo?.adeudo || 0,
      packageHistory: patInfo?.packageHistory || [],
      sessionPreset: getPresetFromTimes(app.duration, app.buffer).id,
      prefers_email: patInfo?.prefers_email !== false,
      prefers_sms: patInfo?.prefers_sms !== false,
      attendant: resolveDefaultAttendant(app.attendant),
      ...appointmentFlagsFromApp(app),
    }, patInfo));
  };

  const handleSendConfirmationNow = async () => {
    if (!selectedSlot?.id || confirmationSending) return;
    setConfirmationSending(true);
    try {
      const res = await fetch('/api/staff/send-confirmation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ appointmentId: selectedSlot.id, clinic: activeClinic }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        alert(data.message || data.error || (locale === 'en' ? 'Could not send confirmation SMS.' : 'No se pudo enviar la confirmación SMS.'));
        return;
      }
      const sentAt = data.sentAt || new Date().toISOString();
      setSelectedSlot((prev) => (prev ? {
        ...prev,
        confirmation_status: CONFIRMATION_STATUS.PENDING,
        confirmation_sent_at: sentAt,
      } : prev));
      setDbAppointments((prev) => prev.map((row) => (
        row.id === selectedSlot.id
          ? { ...row, confirmation_status: CONFIRMATION_STATUS.PENDING, confirmation_sent_at: sentAt }
          : row
      )));
      broadcastLiveDataUpdated(activeClinic);
    } catch (err) {
      alert(err?.message || (locale === 'en' ? 'Could not send confirmation SMS.' : 'No se pudo enviar la confirmación SMS.'));
    } finally {
      setConfirmationSending(false);
    }
  };

  const handleSendStaffSms = async () => {
    if (!selectedSlot?.id || staffSmsSending) return;
    if (staffSmsPreset === 'custom' && !String(staffSmsNote || '').trim()) {
      return alert(locale === 'en' ? 'Write a short note for the custom SMS.' : 'Escribe una nota corta para el SMS personalizado.');
    }
    setStaffSmsSending(true);
    try {
      const res = await fetch('/api/staff/patient-sms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          appointmentId: selectedSlot.id,
          clinic: activeClinic,
          preset: staffSmsPreset,
          customNote: staffSmsNote,
          locale,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        alert(data.message || data.error || (locale === 'en' ? 'Could not send SMS.' : 'No se pudo enviar el SMS.'));
        return;
      }
      alert(locale === 'en'
        ? `SMS sent.\n\n${data.body || ''}`
        : `SMS enviado.\n\n${data.body || ''}`);
      setStaffSmsNote('');
      await logAudit(selectedSlot.id, selectedSlot.patient, locale === 'en' ? 'Staff SMS' : 'SMS staff', data.body || staffSmsPreset);
    } catch (err) {
      alert(err?.message || (locale === 'en' ? 'Could not send SMS.' : 'No se pudo enviar el SMS.'));
    } finally {
      setStaffSmsSending(false);
    }
  };

  const resolveSlotContact = (slot) => {
    const pat = slot?.patientId
      ? dbPatients.find((p) => String(p.id) === String(slot.patientId))
      : resolvePatientForAppointment(slot, dbPatients);
    const contact = resolveDisplayContact(slot, pat);
    return {
      phone: contact.phone,
      email: contact.email,
      prefers_email: slot?.prefers_email ?? pat?.prefers_email,
      prefers_sms: slot?.prefers_sms ?? pat?.prefers_sms,
    };
  };

  const notifyPatientFromSlot = async (slot, { showSuccess = false, notifyReason, notifyType: notifyTypeOverride, reportResult = false, forceNotify = false } = {}) => {
    const contact = resolveSlotContact(slot);
    const email = contact.email;
    const phone = contact.phone;

    const notifyType = notifyTypeOverride || resolveEffectiveNotifyType({
      notifyReason,
      isNewPatient: slot.is_new_patient,
      patientName: slot.patient,
      equipment: slot.equipment,
      appointments: dbAppointments,
      excludeAppointmentId: slot.id,
      normalize: normalizeStr,
    });

    // Notas de primera sesión: solo paciente nuevo en la clínica (no por cámara/equipo).
    // Reprogramaciones y cancelaciones nunca llevan notas.
    const includeFirstSessionNotes = notifyType === 'first';

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

    const prefersEmail = contact.prefers_email;
    const prefersSms = contact.prefers_sms;
    // Patient prefs dominate Admin → Messages per-event Correo/SMS.
    const { sendEmail, sendSms } = resolveNotifyChannelsForPatient(dbCompanyConfig, notifyType, {
      prefers_email: prefersEmail,
      prefers_sms: prefersSms,
    });
    if (!sendEmail && !sendSms) {
      const reason = locale === 'en'
        ? 'Patient opted out of SMS and email (or clinic-wide channels are off).'
        : 'El paciente desactivó SMS y correo (o los canales de clínica están apagados).';
      if (showSuccess) alert(reason);
      return reportResult ? { skipped: true, reason } : null;
    }

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
        instructions: resolveSessionInstructions(dbCompanyConfig, locale, {
          equipment: slot.equipment,
          services: dbServices,
          isFirstSession: includeFirstSessionNotes,
        }),
        instructionsLabel: getSessionInstructionsLabel(dbCompanyConfig, locale),
        sessionInstructionsUrl: getSessionInstructionsUrl(dbCompanyConfig, activeClinic),
        address: dbCompanyConfig.address,
        mapsUrl: dbCompanyConfig.maps_url,
        clinicPhone: dbCompanyConfig.phone,
        ticketMessage: dbCompanyConfig.ticket_message,
        locale,
        durationMins: resolveSessionTimes(slot).duration,
        bufferMins: resolveSessionTimes(slot).buffer,
        prefers_email: sendEmail,
        prefers_sms: sendSms,
        notifyEnabled: true,
        notifyType,
        emailTemplates: pickEmailTemplates(),
        smsIntros: pickSmsIntros(),
        appointmentId: slot.id || '',
        cancelLimitHours: Number(dbCompanyConfig.cancel_limit_hours) || 24,
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
        const now = getClinicNow(activeClinic);
        setCurrentDate(now.date);
        pendingScrollToNowRef.current = true;
        scrollCalendarToNow('smooth');
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
  }, [currentUser, activeTab, dbServices, currentFullDate, currentDayInfo, activeClinic, scrollCalendarToNow]);

  const appointmentTimeOptions = useMemo(() => {
    const srv = getServiceForSlot(selectedSlot);
    const { duration, buffer } = resolveSessionTimes(selectedSlot || {});
    return buildStaffAppointmentTimeOptions({
      service: srv,
      companyConfig: dbCompanyConfig,
      isoDate: selectedSlot?.full_date || selectedSlot?.fullDate || currentDateISO,
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
    selectedSlot?.full_date,
    selectedSlot?.fullDate,
    currentDateISO,
    dbServices,
    dbCompanyConfig,
  ]);

  const selectedBlockMins = useMemo(() => {
    const { duration, buffer } = resolveSessionTimes(selectedSlot || {});
    return duration + buffer;
  }, [selectedSlot]);

  const getEquipmentColors = (color) => {
    const map = {
      blue: 'bg-blue-50/90 border-blue-300 text-blue-800',
      rose: 'bg-rose-50/90 border-rose-300 text-rose-800',
      emerald: 'bg-emerald-50/90 border-emerald-300 text-emerald-800',
      purple: 'bg-purple-50/90 border-purple-300 text-purple-800',
      amber: 'bg-amber-50/90 border-amber-300 text-amber-800',
      cyan: 'bg-cyan-50/90 border-cyan-300 text-cyan-800',
      indigo: 'bg-indigo-50/90 border-indigo-300 text-indigo-800',
      fuchsia: 'bg-fuchsia-50/90 border-fuchsia-300 text-fuchsia-800',
      pink: 'bg-pink-50/90 border-pink-300 text-pink-800',
      orange: 'bg-orange-50/90 border-orange-300 text-orange-800',
      teal: 'bg-teal-50/90 border-teal-300 text-teal-800',
      violet: 'bg-violet-50/90 border-violet-300 text-violet-800',
    };
    return map[color] || 'bg-slate-50/90 border-slate-300 text-slate-800';
  };

  const getEquipmentBgColor = (color) => {
    const map = {
      blue: 'bg-blue-50/35', rose: 'bg-rose-50/35', emerald: 'bg-emerald-50/35',
      purple: 'bg-purple-50/35', amber: 'bg-amber-50/35', cyan: 'bg-cyan-50/35',
      indigo: 'bg-indigo-50/35', fuchsia: 'bg-fuchsia-50/35', pink: 'bg-pink-50/35',
      orange: 'bg-orange-50/35', teal: 'bg-teal-50/35', violet: 'bg-violet-50/35',
    };
    return map[color] || 'bg-slate-50/35';
  };

  const getEquipmentHeaderColor = (color) => {
    const map = {
      blue: 'bg-blue-100 text-blue-800 border-b border-blue-200',
      rose: 'bg-rose-100 text-rose-800 border-b border-rose-200',
      emerald: 'bg-emerald-100 text-emerald-800 border-b border-emerald-200',
      purple: 'bg-purple-100 text-purple-800 border-b border-purple-200',
      amber: 'bg-amber-100 text-amber-800 border-b border-amber-200',
      cyan: 'bg-cyan-100 text-cyan-800 border-b border-cyan-200',
      indigo: 'bg-indigo-100 text-indigo-800 border-b border-indigo-200',
      fuchsia: 'bg-fuchsia-100 text-fuchsia-800 border-b border-fuchsia-200',
      pink: 'bg-pink-100 text-pink-800 border-b border-pink-200',
      orange: 'bg-orange-100 text-orange-800 border-b border-orange-200',
      teal: 'bg-teal-100 text-teal-800 border-b border-teal-200',
      violet: 'bg-violet-100 text-violet-800 border-b border-violet-200',
    };
    return map[color] || 'bg-slate-100 text-slate-800 border-b border-slate-200';
  };

  const getDynamicColorClass = (color) => {
    const map = {
      blue: 'bg-blue-300', rose: 'bg-rose-300', emerald: 'bg-emerald-300',
      purple: 'bg-purple-300', amber: 'bg-amber-300', cyan: 'bg-cyan-300',
      indigo: 'bg-indigo-300', fuchsia: 'bg-fuchsia-300', pink: 'bg-pink-300',
      orange: 'bg-orange-300', teal: 'bg-teal-300', violet: 'bg-violet-300',
    };
    return map[color] || 'bg-slate-300';
  };

  const getStatusBadge = (status) => {
    if (!status || status === 'Agendado') return null;
    let badgeClass = ''; let icon = '';
    if (status === 'Llegó') { badgeClass = 'bg-amber-200 text-amber-900'; icon = '🚶'; }
    if (status === 'En Sesión') { badgeClass = 'bg-emerald-200 text-emerald-900'; icon = '🟢'; }
    if (status === 'Finalizado') { badgeClass = 'bg-slate-300 text-slate-700'; icon = '✔️'; }
    if (status === 'No Asistió' || status === 'Cancelado') { badgeClass = 'bg-red-200 text-red-900'; icon = '❌'; }
    if (status === 'Pendiente cancelación') { badgeClass = 'bg-amber-200 text-amber-950'; icon = '⏳'; }
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

  const openSaleReceiptModal = (tx, patientName, patientPhone = '') => {
    setReportReceipt({ ...tx, patient: patientName || tx.patient });
    setReportReceiptPhone(patientPhone || '');
  };

  const handleCancelGlobalTransaction = async (tx, patientId, patientName) => {
    if (!window.confirm(a('cancelSaleConfirm', patientName, tx.price, tx.sessions, tx.serviceName))) {
      return;
    }

    try {
      const p = dbPatients.find(x => String(x.id) === String(patientId));
      if (!p) return alert(a('patientNotFound'));

      const reversed = reversePurchaseSessions(p.wallets, p.adeudo, tx, p.packageHistory);
      const newHistory = (p.packageHistory || []).filter(t => String(t.id) !== String(tx.id));

      let res = await activeSupabase.from('patients').update({
         wallets: reversed.wallets,
         adeudo: reversed.adeudo,
         package_history: newHistory
      }).eq('id', p.id);

      if (res.error && /column|adeudo/i.test(res.error.message || '')) {
        await activeSupabase.from('patients').update({
          wallets: reversed.wallets,
          package_history: newHistory,
        }).eq('id', p.id);
      }

      await logAudit(null, patientName, 'REVERSIÓN DE VENTA', formatSaleCancelAuditDetail(tx, currencyStr));
      setDbPatients((prev) => prev.map((p) => (
        String(p.id) === String(patientId)
          ? { ...p, wallets: reversed.wallets, adeudo: reversed.adeudo, packageHistory: newHistory }
          : p
      )));
      applySessionDataToSelectedSlot({
        patientId,
        wallets: reversed.wallets,
        adeudo: reversed.adeudo,
        packageHistory: newHistory,
      });
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

  const canRescheduleAppointment = selectedSlot?.id && !['Finalizado', 'Devuelto', 'No Asistió', 'Falta Justificada', CANCEL_REQUEST_STATUS].includes(selectedSlot.check_in_status);

  const tryRequestMove = (app, newTime, newEquipment, newDay, newFullDate, options = {}) => {
    // La cita original SIEMPRE proviene de la base de datos; `app` puede venir
    // del panel de reprogramación con la hora ya editada en pantalla.
    const original = (app?.id ? dbAppointments.find((x) => x.id === app.id) : null) || app;
    const originalDate = original?.full_date || original?.fullDate;

    const outsideNormalHours = options.outsideNormalHours ?? !!app?.outside_normal_hours;
    const extendedSession = options.extendedSession ?? isExtendedSession(app);

    const unchanged =
      originalDate === newFullDate &&
      getMinutes(original?.time) === getMinutes(newTime) &&
      original?.equipment === newEquipment &&
      !!original?.outside_normal_hours === !!outsideNormalHours;
    if (unchanged) {
      alert(a('alreadyAtTime'));
      return false;
    }

    let pastOverride = false;
    if (isPastTime(newFullDate, newTime)) {
      const code = window.prompt(a('pastMoveCodePrompt'));
      if (code == null) return false;
      if (String(code).trim() !== '0000') {
        alert(a('pastMoveCodeWrong'));
        return false;
      }
      pastOverride = true;
    }

    const pInfo = dbPatients.find(x => normalizeStr(x.patient) === normalizeStr(original.patient));
    if (pInfo && pInfo.is_blocked) {
      alert(a('patientBlockedMove'));
      return false;
    }

    const times = resolveSessionTimes({ ...original, extended_session: extendedSession, is_extended_block: extendedSession });
    const dur = times.duration;
    const buf = times.buffer;

    if (checkOverlap(newEquipment, newFullDate, newTime, dur, buf, original.id)) {
      alert(a('overlapLong'));
      return false;
    }

    setMoveConfirmation({
      app: original,
      newTime,
      newEquipment,
      newDay,
      newFullDate,
      outsideNormalHours,
      extendedSession,
      pastOverride,
    });
    return true;
  };

  const handleDrop = (e, newTime, newEquipment, newDay, newFullDate, outsideHours = false) => {
    e.preventDefault();
    if (!draggedApp) return;
    tryRequestMove(draggedApp, newTime, newEquipment, newDay, newFullDate, {
      outsideNormalHours: outsideHours,
    });
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

    if (tryRequestMove(selectedSlot, targetTime, targetEquipment, dayName, targetDate, {
      outsideNormalHours: !!selectedSlot.outside_normal_hours,
      extendedSession: isExtendedSession(selectedSlot),
    })) {
      setIsRescheduling(false);
    }
  };

  const confirmMove = async () => {
    if (!moveConfirmation || isSavingAppointment) return;
    const move = moveConfirmation;
    await runBusyAction({
      workingTitle: L.p.common.movingTitle,
      workingDetail: L.p.common.movingHint,
      successTitle: L.p.common.movedOk,
      autoCloseMs: 1200,
      onDone: () => {
        setMoveConfirmation(null);
        closeAppointmentPanel();
      },
      action: async () => {
        const extended = !!move.extendedSession;
        const outside = !!move.outsideNormalHours;
        const times = resolveSessionTimes({
          ...move.app,
          extended_session: extended,
          is_extended_block: extended,
        });
        const { error } = await updateStaffAppointment(activeSupabase, move.app.id, {
          time: move.newTime,
          appointment_time: move.newTime,
          equipment: move.newEquipment,
          day: move.newDay,
          full_date: move.newFullDate,
          appointment_date: move.newFullDate,
          duration: times.duration,
          buffer: times.buffer,
          outside_normal_hours: outside,
          is_extended_block: extended,
        });

        if (error) {
          if (error.message === 'SLOT_UNAVAILABLE') {
            return { error: a('overlapLong') };
          }
          return { error: a('moveError', error.message) };
        }

        await logAudit(
          move.app.id,
          move.app.patient,
          'REUBICACIÓN',
          `De ${move.app.full_date} ${move.app.time} (${move.app.equipment}) a ${move.newFullDate} ${move.newTime} (${move.newEquipment})${move.pastOverride ? ' [pasado autorizado 0000]' : ''}`,
        );
        await notifyPatientFromSlot({
          ...move.app,
          full_date: move.newFullDate,
          fullDate: move.newFullDate,
          time: move.newTime,
          equipment: move.newEquipment,
        }, { notifyReason: 'reschedule' });
        pushGoogleCalendarSync(move.app.id, 'upsert');
        await notifyCalendarChanged();
        return {
          detail: `${move.newFullDate} · ${move.newTime} · ${move.newEquipment}`,
        };
      },
    });
  };

  const updateAppStatus = async (id, status, patientName, equipment) => {
    if (isSavingAppointment) return;
    const app = dbAppointments.find((a) => a.id === id);
    if (!app) return alert(a('apptNotFound'));
    if (['Finalizado', 'Devuelto'].includes(app.check_in_status)) {
      return alert(a('statusLockedSealed'));
    }
    if (app.check_in_status === status) return;

    const prevStatus = app.check_in_status;
    const eq = equipment || app.equipment;

    if (status === 'No Asistió') {
      if (isAssessmentService(eq)) {
        if (!window.confirm(a('noShowAssessmentConfirm'))) return;
      } else if (!window.confirm(a('noShowConfirm'))) {
        return;
      }
    }

    await runBusyAction({
      workingTitle: L.p.common.statusUpdating,
      workingDetail: L.p.common.pleaseWait,
      successTitle: L.p.common.statusUpdatedOk,
      autoCloseMs: 1000,
      action: async () => {
        if (prevStatus === 'No Asistió' && status !== 'No Asistió') {
          await restoreNoShowSessionImpact(app, {
            nextStatus: null,
            auditLabel: status === 'Falta Justificada' ? 'JUSTIFICAR NO-SHOW' : 'CAMBIO DESDE NO-SHOW',
          });
        }

        if (status === 'No Asistió') {
          if (isAssessmentService(eq)) {
            await logAudit(id, patientName, 'NO ASISTIÓ', 'Valoración: no afecta cartera ni adeudo.');
          } else {
            const p = resolvePatientForAppointment(app, dbPatients)
              || dbPatients.find((x) => normalizeStr(x.patient) === normalizeStr(patientName));
            if (p) {
              const servicePrice = getServicePrice(dbServices, eq);
              const { deducted, nextAdeudo } = await processSessionDeduction(p, eq, servicePrice);

              await logAudit(id, patientName, 'NO ASISTIÓ', deducted
                ? `No asistió. Se descontó 1 sesión pagada de cartera (${eq}).`
                : `No asistió. Sin saldo pagado: adeudo +1 (total adeudo: ${nextAdeudo}).`);
            }
          }

          await activeSupabase.from('appointments').update({ check_in_status: 'No Asistió' }).eq('id', id);
          try {
            await fetch('/api/staff/promoter-no-show', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              credentials: 'include',
              body: JSON.stringify({ appointmentId: id, clinic: activeClinic }),
            });
          } catch {
            /* non-fatal */
          }
        } else if (status === 'Falta Justificada') {
          await activeSupabase.from('appointments').update({ check_in_status: 'Falta Justificada' }).eq('id', id);
          await logAudit(
            id,
            patientName,
            'FALTA JUSTIFICADA',
            prevStatus === 'No Asistió'
              ? 'Falta justificada (desde no-show). Sesión restaurada; no se cobra del paquete.'
              : 'Paciente no atendió (justificado). La sesión pagada se conserva en cartera.',
          );
        } else {
          await activeSupabase.from('appointments').update({ check_in_status: status }).eq('id', id);
          await logAudit(id, patientName, 'CAMBIO DE ESTATUS', `Estatus actualizado a: ${status}`);
        }

        setSelectedSlot((prev) => (prev && prev.id === id ? { ...prev, check_in_status: status } : prev));
        await fetchAllData({ silent: true, liveOnly: true });
        return { detail: status };
      },
    });
  };

  const handleRefund = async (app) => {
    if (window.confirm(a('refundConfirm'))) {
      const p = dbPatients.find(x => normalizeStr(x.patient) === normalizeStr(app.patient));
      if (p) {
        const servicePrice = getServicePrice(dbServices, app.equipment);
        const walletContext = resolveWalletContext({
          patient: p,
          sessionGroup: getPatientSessionGroup(p),
          equipment: app.equipment,
          servicePrice,
        });
        const nextWallets = creditSessionToWallet(walletContext.wallets, {
          equipment: app.equipment,
          servicePrice,
          packageHistory: walletContext.packageHistory,
        });
        if (walletContext.source === 'group' && walletContext.groupId) {
          await activeSupabase.from('session_groups').update({ wallets: nextWallets }).eq('id', walletContext.groupId);
        } else {
          await activeSupabase.from('patients').update({ wallets: nextWallets }).eq('id', p.id);
        }
      }
      await activeSupabase.from('appointments').update({ check_in_status: 'Devuelto' }).eq('id', app.id);
      await logAudit(app.id, app.patient, 'DEVOLUCIÓN DE SESIÓN', `Sesión devuelta a cartera por cancelación de cobro.`);
      fetchAllData();
    }
  };

  const restoreNoShowSessionImpact = async (app, { nextStatus = null, auditLabel = 'RESTAURAR SESIÓN NO-SHOW' } = {}) => {
    if (!app?.id || app.check_in_status !== 'No Asistió') return false;
    const patientName = app.patient;
    const eq = app.equipment;
    const p = resolvePatientForAppointment(app, dbPatients)
      || dbPatients.find((x) => normalizeStr(x.patient) === normalizeStr(patientName));

    if (p && !isAssessmentService(eq)) {
      const servicePrice = getServicePrice(dbServices, eq);
      const walletContext = resolveWalletContext({
        patient: p,
        sessionGroup: getPatientSessionGroup(p),
        equipment: eq,
        servicePrice,
      });
      const reversed = reverseNoShowWalletImpact(walletContext.wallets, walletContext.adeudo, {
        equipment: eq,
        servicePrice,
        packageHistory: walletContext.packageHistory,
      });
      const nextHistorico = Math.max(0, (p.historicoSesiones || 0) - 1);
      await persistWalletAfterConsume({
        supabase: activeSupabase,
        walletContext,
        consumed: { wallets: reversed.wallets, deducted: true },
        nextAdeudo: reversed.adeudo,
        patientId: p.id,
        historicoSesiones: nextHistorico,
      });
      await logAudit(
        app.id,
        patientName,
        auditLabel,
        reversed.restored === 'adeudo'
          ? `Sesión de no-show no cobrada. Adeudo −1 (ahora ${reversed.adeudo}).`
          : `Sesión de no-show no cobrada. +1 sesión a cartera (${eq}).`,
      );
    } else {
      await logAudit(app.id, patientName, auditLabel, 'Ajuste de no-show (valoración o sin expediente).');
    }

    if (nextStatus) {
      await activeSupabase.from('appointments').update({ check_in_status: nextStatus }).eq('id', app.id);
    }
    return true;
  };

  /** Keep no-show status; only undo the wallet/debt charge so another visit is not double-charged. */
  const restoreNoShowSession = async (app) => {
    if (!app?.id || app.check_in_status !== 'No Asistió') return;
    if (!window.confirm(a('undoNoShowConfirm'))) return;
    try {
      await restoreNoShowSessionImpact(app, { auditLabel: 'NO COBRAR NO-SHOW' });
      alert(a('undoNoShowOk'));
      setSelectedSlot(null);
      fetchAllData();
    } catch (e) {
      alert(a('statusUpdateError'));
    }
  };

  /** Convert unjustified no-show → excused; restore session (same as Falta Justificada going forward). */
  const excuseNoShow = async (app) => {
    if (!app?.id || app.check_in_status !== 'No Asistió') return;
    if (!window.confirm(a('excuseNoShowConfirm'))) return;
    try {
      await restoreNoShowSessionImpact(app, {
        nextStatus: 'Falta Justificada',
        auditLabel: 'JUSTIFICAR NO-SHOW',
      });
      alert(a('excuseNoShowOk'));
      setSelectedSlot(null);
      fetchAllData();
    } catch (e) {
      alert(a('statusUpdateError'));
    }
  };

  const deductPatientSession = async (patientName, equipment, appId) => {
    const p = dbPatients.find(x => normalizeStr(x.patient) === normalizeStr(patientName));
    if (!p) return { deducted: false, detail: 'Paciente no encontrado en expediente.' };

    const eq = equipment;
    if (isAssessmentService(eq)) {
      return { deducted: false, detail: 'Valoración: no afecta cartera ni adeudo.' };
    }
    const servicePrice = getServicePrice(dbServices, eq);
    const { deducted, nextAdeudo, consumed } = await processSessionDeduction(p, eq, servicePrice);

    return {
      deducted,
      detail: deducted
        ? `Se descontó 1 sesión pagada de cartera (${consumed?.walletKey || eq}).`
        : `Sin saldo pagado: se registró adeudo +1 (total adeudo: ${nextAdeudo}).`,
    };
  };

  const handleCancelAppointment = async () => {
    if (!selectedSlot?.id || !activeSupabase || isSavingAppointment) return;
    const app = selectedSlot;
    await runBusyAction({
      workingTitle: L.p.common.cancellingTitle,
      workingDetail: L.p.common.cancellingHint,
      successTitle: L.p.common.cancelledOk,
      autoCloseMs: 1200,
      onDone: () => {
        setShowCancelModal(false);
        setCancelDeductSession(false);
        closeAppointmentPanel();
      },
      action: async () => {
        const patientName = app.patient;
        let auditDetail = `Cancelada por ${currentUser?.name || 'staff'}. Descuento de sesión: ${cancelDeductSession ? 'Sí' : 'No'}.`;

        if (cancelDeductSession) {
          const result = await deductPatientSession(patientName, app.equipment, app.id);
          auditDetail += ` ${result.detail}`;
        }

        const cancelNote = `[CANCELADA ${new Date().toLocaleString()}] ${auditDetail}`;
        const newNotes = app.notes ? `${app.notes}\n${cancelNote}` : cancelNote;

        const { error } = await activeSupabase.from('appointments').update({
          check_in_status: 'Cancelado',
          notes: newNotes,
        }).eq('id', app.id);
        if (error) return { error: error.message };

        await logAudit(app.id, patientName, 'CITA CANCELADA', auditDetail);
        await notifyPatientFromSlot(app, { notifyReason: 'cancel' });
        pushGoogleCalendarSync(app.id, 'delete');
        await notifyCalendarChanged();
        return { detail: patientName };
      },
    });
  };

  const handleApproveCancelRequest = async () => {
    if (!selectedSlot?.id || !activeSupabase || !isCancelRequestPending(selectedSlot.check_in_status)) return;
    const app = selectedSlot;
    await runBusyAction({
      workingTitle: L.p.common.cancellingTitle,
      workingDetail: L.p.common.cancellingHint,
      successTitle: L.p.common.cancelledOk,
      autoCloseMs: 1200,
      onDone: () => closeAppointmentPanel(),
      action: async () => {
        const stamp = new Date().toLocaleString();
        const detail = `Cancelación online aprobada por ${currentUser?.name || 'staff'}.`;
        const note = `[APROBADA ${stamp}] ${detail}`;
        const newNotes = app.notes ? `${app.notes}\n${note}` : note;
        const { error } = await activeSupabase.from('appointments').update({
          check_in_status: 'Cancelado',
          notes: newNotes,
        }).eq('id', app.id);
        if (error) return { error: error.message };
        await logAudit(app.id, app.patient, 'CANCELACIÓN APROBADA', detail);
        await notifyPatientFromSlot(app, { notifyReason: 'cancel' });
        pushGoogleCalendarSync(app.id, 'delete');
        await notifyCalendarChanged();
        return { detail: app.patient };
      },
    });
  };

  const handleRejectCancelRequest = async () => {
    if (!selectedSlot?.id || !activeSupabase || !isCancelRequestPending(selectedSlot.check_in_status)) return;
    const app = selectedSlot;
    await runBusyAction({
      workingTitle: locale === 'en' ? 'Keeping appointment…' : 'Manteniendo cita…',
      workingDetail: locale === 'en' ? 'Rejecting cancel request' : 'Rechazando solicitud',
      successTitle: locale === 'en' ? 'Appointment kept' : 'Cita conservada',
      autoCloseMs: 1200,
      action: async () => {
        const stamp = new Date().toLocaleString();
        const detail = `Solicitud de cancelación rechazada por ${currentUser?.name || 'staff'}.`;
        const note = `[RECHAZADA ${stamp}] ${detail}`;
        const newNotes = app.notes ? `${app.notes}\n${note}` : note;
        const { error } = await activeSupabase.from('appointments').update({
          check_in_status: 'Agendado',
          notes: newNotes,
        }).eq('id', app.id);
        if (error) return { error: error.message };
        await logAudit(app.id, app.patient, 'CANCELACIÓN RECHAZADA', detail);
        setSelectedSlot((prev) => (prev && prev.id === app.id
          ? { ...prev, check_in_status: 'Agendado', notes: newNotes }
          : prev));
        await notifyCalendarChanged();
        return { detail: app.patient };
      },
    });
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

  const shiftReportIsoDate = (iso, days) => {
    const [y, m, d] = String(iso || '').split('-').map(Number);
    if (![y, m, d].every(Number.isFinite)) return iso;
    const dt = new Date(Date.UTC(y, m - 1, d));
    dt.setUTCDate(dt.getUTCDate() + days);
    return dt.toISOString().slice(0, 10);
  };

  const reportAppointments = useMemo(() => {
    const start = reportStartDate <= reportEndDate ? reportStartDate : reportEndDate;
    const end = reportStartDate <= reportEndDate ? reportEndDate : reportStartDate;
    return (dbAppointments || [])
      .filter((a) => {
        const d = a.full_date || '';
        if (!d || d < start || d > end) return false;
        if (!reportIncludeCancelled && a.check_in_status === 'Cancelado') return false;
        return true;
      })
      .sort((a, b) => {
        const byDate = String(a.full_date || '').localeCompare(String(b.full_date || ''));
        if (byDate !== 0) return byDate;
        return getMinutes(a.time) - getMinutes(b.time);
      });
  }, [dbAppointments, reportStartDate, reportEndDate, reportIncludeCancelled]);

  const reportApptStats = useMemo(() => {
    const stats = {
      total: reportAppointments.length,
      scheduled: 0,
      done: 0,
      cancelled: 0,
      noShow: 0,
      pendingCancel: 0,
    };
    for (const a of reportAppointments) {
      const s = a.check_in_status || 'Agendado';
      if (s === 'Finalizado') stats.done += 1;
      else if (s === 'Cancelado') stats.cancelled += 1;
      else if (s === 'No Asistió') stats.noShow += 1;
      else if (s === 'Pendiente cancelación') stats.pendingCancel += 1;
      else if (!['Devuelto', 'Falta Justificada'].includes(s)) stats.scheduled += 1;
    }
    return stats;
  }, [reportAppointments]);

  const setReportApptRangePreset = (preset) => {
    const today = clinicNow.dateStr || formatClinicDateIso(new Date(), activeClinic);
    if (preset === 'today') {
      setReportStartDate(today);
      setReportEndDate(today);
      setReportDate(today);
      return;
    }
    if (preset === 'next7') {
      setReportStartDate(today);
      setReportEndDate(shiftReportIsoDate(today, 7));
      return;
    }
    if (preset === 'prev7') {
      setReportStartDate(shiftReportIsoDate(today, -7));
      setReportEndDate(today);
    }
  };

  const printAppointmentsReport = () => {
    const R = L.p.reports;
    const start = reportStartDate <= reportEndDate ? reportStartDate : reportEndDate;
    const end = reportStartDate <= reportEndDate ? reportEndDate : reportStartDate;
    const rows = reportAppointments.map((a) => `
      <tr>
        <td style="border:1px solid #cbd5e1;padding:6px;font-size:11px;">${a.full_date || ''}</td>
        <td style="border:1px solid #cbd5e1;padding:6px;font-size:11px;">${a.time || ''}<br/><span style="color:#2563eb;font-size:10px;">${a.equipment || ''}</span></td>
        <td style="border:1px solid #cbd5e1;padding:6px;font-size:11px;text-transform:uppercase;">${a.patient || ''}</td>
        <td style="border:1px solid #cbd5e1;padding:6px;font-size:11px;">${a.phone || '—'}</td>
        <td style="border:1px solid #cbd5e1;padding:6px;font-size:11px;">${a.attendant || 'N/A'}</td>
        <td style="border:1px solid #cbd5e1;padding:6px;font-size:11px;">${translateCheckInStatus(locale, a.check_in_status || 'Agendado')}</td>
      </tr>
    `).join('');
    const html = `
      <div style="padding:32px;font-family:sans-serif;color:#0f172a;">
        <h1 style="margin:0 0 4px;font-size:20px;text-transform:uppercase;">${formatClinicField(dbCompanyConfig.name) || 'Oxygen'}</h1>
        <p style="margin:0 0 16px;font-size:12px;font-weight:700;text-transform:uppercase;color:#64748b;">
          ${R.apptsTitle} · ${start} → ${end} · ${reportApptStats.total} ${R.apptsTotal.toLowerCase()}
        </p>
        <table style="width:100%;border-collapse:collapse;">
          <thead>
            <tr style="background:#f1f5f9;text-align:left;font-size:10px;text-transform:uppercase;">
              <th style="border:1px solid #cbd5e1;padding:6px;">${R.apptsColDate}</th>
              <th style="border:1px solid #cbd5e1;padding:6px;">${R.apptsColTime}</th>
              <th style="border:1px solid #cbd5e1;padding:6px;">${R.apptsColPatient}</th>
              <th style="border:1px solid #cbd5e1;padding:6px;">${R.apptsColPhone}</th>
              <th style="border:1px solid #cbd5e1;padding:6px;">${R.apptsColAttendant}</th>
              <th style="border:1px solid #cbd5e1;padding:6px;">${R.apptsColStatus}</th>
            </tr>
          </thead>
          <tbody>${rows || `<tr><td colspan="6" style="padding:16px;text-align:center;">${R.noApptsDate}</td></tr>`}</tbody>
        </table>
      </div>
    `;
    printHTML(html, R.apptsTitle);
  };

  const clinicSlugForExport = () => String(activeClinic || 'clinica').replace(/\s+/g, '_');

  const downloadAppointmentsReportCsv = () => {
    const R = L.p.reports;
    if (!reportAppointments.length) return alert(R.downloadEmpty);
    const start = reportStartDate <= reportEndDate ? reportStartDate : reportEndDate;
    const end = reportStartDate <= reportEndDate ? reportEndDate : reportStartDate;
    downloadCsv({
      filename: `citas_${clinicSlugForExport()}_${start}_${end}.csv`,
      headers: [
        R.apptsColDate,
        locale === 'en' ? 'Time' : 'Hora',
        locale === 'en' ? 'Equipment' : 'Equipo',
        R.apptsColPatient,
        R.apptsColPhone,
        R.apptsColAttendant,
        R.apptsColStatus,
      ],
      rows: reportAppointments.map((a) => [
        a.full_date || '',
        a.time || '',
        a.equipment || '',
        a.patient || '',
        a.phone || '',
        a.attendant || '',
        translateCheckInStatus(locale, a.check_in_status || 'Agendado'),
      ]),
    });
  };

  const downloadPatientReportCsv = () => {
    const R = L.p.reports;
    if (String(selectedPatientReport || '').trim().length <= 2) return alert(R.searchMin3);
    const rows = (dbAppointments || [])
      .filter((a) => normalizeStr(a.patient).includes(normalizeStr(selectedPatientReport)))
      .sort((a, b) => String(b.full_date || '').localeCompare(String(a.full_date || '')));
    if (!rows.length) return alert(R.downloadEmpty);
    downloadCsv({
      filename: `paciente_${clinicSlugForExport()}_${String(selectedPatientReport).trim().slice(0, 24)}.csv`,
      headers: [
        R.apptsColDate,
        locale === 'en' ? 'Time' : 'Hora',
        locale === 'en' ? 'Equipment' : 'Equipo',
        R.apptsColPatient,
        R.apptsColPhone,
        R.apptsColStatus,
      ],
      rows: rows.map((a) => [
        a.full_date || '',
        a.time || '',
        a.equipment || '',
        a.patient || '',
        a.phone || '',
        translateCheckInStatus(locale, a.check_in_status || 'Agendado'),
      ]),
    });
  };

  const downloadAuditReportCsv = () => {
    const R = L.p.reports;
    if (!globalAuditLogs.length) return alert(R.downloadEmpty);
    downloadCsv({
      filename: `caja_negra_${clinicSlugForExport()}_${clinicNow.dateStr || 'hoy'}.csv`,
      headers: [
        locale === 'en' ? 'When' : 'Fecha/Hora',
        locale === 'en' ? 'Patient / person' : 'Paciente / persona',
        locale === 'en' ? 'Action' : 'Acción',
        locale === 'en' ? 'By' : 'Por',
        locale === 'en' ? 'Details' : 'Detalle',
      ],
      rows: globalAuditLogs.map((log) => [
        log.timestamp ? new Date(log.timestamp).toLocaleString(locale === 'en' ? 'en-US' : 'es-MX') : '',
        log.patient_name || '',
        log.action || '',
        log.changed_by || '',
        log.details || '',
      ]),
    });
  };

  const downloadSalesReportCsv = () => {
    const R = L.p.reports;
    const start = reportStartDate <= reportEndDate ? reportStartDate : reportEndDate;
    const end = reportStartDate <= reportEndDate ? reportEndDate : reportStartDate;
    const salesRows = dbPatients
      .flatMap((p) => (p.packageHistory || []).map((tx) => ({
        ...tx,
        patientId: p.id,
        patientName: p.patient,
      })))
      .filter((tx) => {
        const d = String(tx.date || '').slice(0, 10);
        if (!d) return true;
        return d >= start && d <= end;
      })
      .sort((a, b) => (Number(b.id) || 0) - (Number(a.id) || 0));
    if (!salesRows.length) return alert(R.downloadEmpty);
    downloadCsv({
      filename: `ventas_${clinicSlugForExport()}_${start}_${end}.csv`,
      headers: [
        locale === 'en' ? 'Ticket' : 'Ticket',
        locale === 'en' ? 'Date' : 'Fecha',
        R.apptsColPatient,
        locale === 'en' ? 'Package / service' : 'Paquete / servicio',
        locale === 'en' ? 'Sessions' : 'Sesiones',
        locale === 'en' ? 'Amount' : 'Monto',
        locale === 'en' ? 'Currency' : 'Moneda',
        locale === 'en' ? 'Payment method' : 'Método de pago',
      ],
      rows: salesRows.map((tx) => [
        tx.ticketNumber || tx.ticket_number || String(tx.id || '').slice(-6),
        tx.date || '',
        tx.patientName || '',
        tx.serviceName || '',
        tx.sessions ?? '',
        tx.price ?? '',
        currencyStr,
        tx.paymentMethod || '',
      ]),
    });
  };

  const printPatientBitacora = (patientName) => {
    const apps = dbAppointments.filter(a => String(a.patient) === String(patientName) && a.check_in_status === 'Finalizado').sort((a,b) => new Date(b.full_date) - new Date(a.full_date));
    if(apps.length === 0) return alert(a('noFinishedAppts'));

    const audit = L.p.audit;
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
            ${a.signature ? `<img src="${a.signature}" style="max-height: 40px;"/>` : `<span style="color:#ccc; font-style:italic;">${audit.physicalSig}</span>`}
          </td>
        </tr>
      `).join('');

      pagesHTML += `
        <div style="padding: 40px; font-family: sans-serif; page-break-after: always;">
          <div style="text-align: center; margin-bottom: 30px;">
            <h1 style="margin: 0; font-size: 24px; text-transform: uppercase;">${formatClinicField(dbCompanyConfig.name) || 'OXYHYPERBARIC'}</h1>
            <p style="margin: 0; font-size: 12px; text-transform: uppercase;">${formatClinicField(dbCompanyConfig.address)} | Tel: ${formatClinicPhone(dbCompanyConfig.phone)}</p>
            <h2 style="margin-top: 20px; font-size: 18px; border-bottom: 2px solid #000; display: inline-block; padding-bottom: 5px;">${audit.title}</h2>
          </div>
          <div style="margin-bottom: 20px;">
            <p style="margin: 0; font-weight: bold; font-size: 14px; text-transform: uppercase;">${audit.patientLabel}: ${patientName}</p>
            <p style="margin: 0; font-size: 12px; color: #555;">${audit.printDate}: ${new Date().toLocaleDateString()}</p>
          </div>
          <table style="width: 100%; border-collapse: collapse;">
            <thead>
              <tr style="background-color: #f1f5f9;">
                <th style="border: 1px solid #000; padding: 10px; text-align: left; font-size: 12px;">${audit.dateTimeCol.toUpperCase()}</th>
                <th style="border: 1px solid #000; padding: 10px; text-align: left; font-size: 12px;">${audit.service.toUpperCase()}</th>
                <th style="border: 1px solid #000; padding: 10px; text-align: left; font-size: 12px;">${audit.attendedBy.toUpperCase()}</th>
                <th style="border: 1px solid #000; padding: 10px; text-align: center; font-size: 12px;">${audit.patientSignatureCol.toUpperCase()}</th>
              </tr>
            </thead>
            <tbody>${rowsHTML}</tbody>
          </table>
        </div>
      `;
    }

    printHTML(pagesHTML, audit.fileTitle(patientName));
  };

  const renderBackgroundSlots = (equipment, day, fullDate) => {
    const daySchedule = getDaySchedule(dbCompanyConfig, fullDate);
    if (!daySchedule.open) {
      return (
        <div className="absolute inset-0 z-10 bg-slate-200/90 flex items-center justify-center pointer-events-none" style={{ backgroundImage: 'repeating-linear-gradient(135deg, transparent, transparent 12px, rgba(0,0,0,0.04) 12px, rgba(0,0,0,0.04) 24px)' }}>
          <span className="text-[10px] font-black uppercase text-slate-500 bg-white/90 px-2 py-1 rounded border border-slate-300">
            {L.p.admin.weeklyClosedDay}
          </span>
        </div>
      );
    }

    const srv = dbServices.find(s => s.name === equipment) || { duration: 60, buffer: 30, id: null };
    const duration = Number(srv.duration) || 60;
    const buffer = srv.buffer != null && srv.buffer !== '' ? Number(srv.buffer) : 30;
    const blockMins = duration + buffer;
    const { startMins: svcStart, endMins: svcEnd } = getServiceScheduleBounds(srv, dbCompanyConfig, fullDate);

    const slotTimes = buildAvailabilitySlotTimes({
      service: srv,
      companyConfig: dbCompanyConfig,
      isoDate: fullDate,
      duration,
      buffer,
      stepByBlock: true,
    });

    const serviceLineMinutes = [...new Set([
      ...slotTimes.map((t) => getMinutes(t)),
      svcEnd,
    ])].sort((a, b) => a - b);

    const offHourBands = [];
    for (let m = startMins; m < endMins; m += intervalMins) {
      if (m < svcStart || m >= svcEnd) {
        offHourBands.push(m);
      }
    }

    return (
      <>
        {serviceLineMinutes.map((m) => {
          const top = (m - calendarStartMins) * PIXELS_PER_MINUTE;
          const isBoundary = m === svcStart || m === svcEnd;
          return (
            <div
              key={`grid-svc-${m}`}
              className={`absolute left-0 right-0 pointer-events-none border-t box-border ${isBoundary ? 'border-slate-300/90' : 'border-slate-200/80'}`}
              style={{ top: `${top}px` }}
            />
          );
        })}
        {Array.from({ length: Math.ceil((calendarEndMins - calendarStartMins) / intervalMins) }, (_, i) => {
          const m = calendarStartMins + i * intervalMins;
          if (m >= svcStart && m <= svcEnd) return null;
          const top = (m - calendarStartMins) * PIXELS_PER_MINUTE;
          const isHour = m % 60 === 0;
          return (
            <div
              key={`grid-off-${m}`}
              className={`absolute left-0 right-0 pointer-events-none border-t box-border ${isHour ? 'border-slate-300/90' : 'border-slate-200/80'}`}
              style={{ top: `${top}px`, height: `${intervalMins * PIXELS_PER_MINUTE}px` }}
            />
          );
        })}
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
                if (isPastTime(fullDate, timeStr) && !(isRescheduling && selectedSlot?.id)) {
                  alert(a('pastScheduleAppt'));
                  return;
                }
                if (isRescheduling && selectedSlot?.id) {
                  setSelectedSlot({
                    ...selectedSlot,
                    time: timeStr,
                    equipment,
                    day,
                    fullDate,
                    full_date: fullDate,
                    serviceId: srv.id,
                    duration,
                    buffer,
                    sessionPreset: getPresetFromTimes(duration, buffer).id,
                    outside_normal_hours: true,
                  });
                  setCurrentDate(new Date(fullDate + 'T12:00:00'));
                  setViewMode('Día');
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
              onDragOver={handleDragOver}
              onDrop={(e) => handleDrop(e, timeStr, equipment, day, fullDate, true)}
              className="absolute left-0 right-0 bg-slate-200/60 hover:bg-amber-100/80 active:bg-amber-200/90 cursor-pointer border-t border-slate-200/80 box-border z-[1] transition-all hover:ring-1 hover:ring-inset hover:ring-amber-400/40"
              style={{ top: `${timeToPixels(timeStr)}px`, height: `${intervalMins * PIXELS_PER_MINUTE}px` }}
              title={`${L.clickToBook} · ${L.p.legendOutsideHours}`}
            />
          );
        })}
        {slotTimes.map((time) => (
          <div
            key={time}
            onClick={() => {
              if (isPastTime(fullDate, time) && !(isRescheduling && selectedSlot?.id)) {
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
            className="absolute left-0 right-0 hover:bg-white/50 hover:shadow-[inset_0_0_0_1px_rgba(148,163,184,0.28)] active:bg-slate-50/80 cursor-pointer transition-all box-border z-[1]"
            style={{ top: `${timeToPixels(time)}px`, height: `${blockMins * PIXELS_PER_MINUTE}px` }}
            title={`${L.clickToBook} · ${blockMins} min`}
          />
        ))}
      </>
    );
  };

  const isNewPatientInline = selectedSlot?.patient && selectedSlot.patient.length > 0 && !dbPatients.find(x => normalizeStr(x.patient) === normalizeStr(selectedSlot.patient));

  const handleSaveNewAppointment = async (slotOverride = null) => {
    if (isSavingAppointment) return;
    const slot = resolveAppointmentDraft(slotOverride, selectedSlot);
    const newPatientForSlot = slot?.patient
      && !dbPatients.find((x) => normalizeStr(x.patient) === normalizeStr(slot.patient));
    try {
      if (!slot?.patient || !slot?.equipment || !slot?.time) {
        const missing = getMissingAppointmentFields(slot, locale);
        setAppointmentSaveFeedback({
          phase: 'error',
          title: locale === 'en' ? 'Incomplete appointment' : 'Cita incompleta',
          detail: staffAlert(locale, 'missingAppointmentFields', missing),
          closeForm: false,
        });
        return;
      }

      const apptDate = slot.fullDate || slot.full_date || currentFullDate;
      if (isPastTime(apptDate, slot.time) && slot.status !== 'booked') {
        return alert(staffAlert(locale, 'pastSchedule'));
      }

      const existingP = (slot.patientId
        ? dbPatients.find((x) => String(x.id) === String(slot.patientId))
        : null)
        || dbPatients.find((x) => normalizeStr(x.patient) === normalizeStr(slot.patient));
      if (existingP?.is_blocked) return alert(staffAlert(locale, 'patientBlockedShort'));

      const sessionTimes = resolveSessionTimes(slot);
      const useRecurrence = repeatBooking.enabled && !slot.id;
      const occurrenceDates = useRecurrence
        ? sortOccurrenceDates(repeatBooking.dates)
        : [apptDate];

      if (useRecurrence && occurrenceDates.length === 0) {
        return alert(L.p.appt.repeatNeedDates);
      }

      if (!useRecurrence && checkOverlap(
        slot.equipment,
        apptDate,
        slot.time,
        sessionTimes.duration,
        sessionTimes.buffer,
        slot.id,
      )) {
        return alert(staffAlert(locale, 'overlap'));
      }

      const sessionFresh = await refreshStaffSessionForSave();
      if (!sessionFresh) {
        setAppointmentSaveFeedback({
          phase: 'error',
          title: locale === 'en' ? 'Session expired' : 'Sesión expirada',
          detail: L.dbErrorUnauthorized,
          closeForm: false,
        });
        return;
      }

      setIsSavingAppointment(true);
      setAppointmentSaveFeedback({
        phase: 'creating',
        title: L.p.appt.creatingTitle,
        detail: L.p.appt.creatingHint,
      });

      let canonicalPatient = slot.patient.trim();
      const resolvedContact = resolveSlotContact(slot);
      let canonicalPhone = resolvedContact.phone;
      let canonicalEmail = resolvedContact.email;
      let isNewForAppointment = !!(slot.is_new_patient || newPatientForSlot);

      const phoneDigits = digitsOnly(canonicalPhone).slice(-10);
      let namePolicy = 'keep_existing';
      let forceCreate = false;
      if (phoneDigits.length === 10) {
        const existingByPhone = dbPatients.find(
          (p) => digitsOnly(p.phone).slice(-10) === phoneDigits,
        );
        const alreadySelected = existingByPhone
          && slot.patientId
          && String(slot.patientId) === String(existingByPhone.id);

        if (existingByPhone && !alreadySelected) {
          const action = chooseDuplicatePhoneAction({
            existingName: existingByPhone.patient,
            typedName: canonicalPatient,
            locale,
          });
          if (action === 'abort') {
            setAppointmentSaveFeedback({
              phase: 'idle',
              title: '',
              detail: '',
              closeForm: false,
            });
            return;
          }
          if (action === 'use_existing') {
            forceCreate = false;
            namePolicy = 'keep_existing';
            canonicalPatient = existingByPhone.patient;
          } else {
            forceCreate = true;
            namePolicy = 'prefer_incoming';
          }
        } else if (alreadySelected) {
          namePolicy = 'keep_existing';
        }

        const ensured = await ensurePatient(activeSupabase, {
          name: canonicalPatient,
          phone: canonicalPhone,
          email: canonicalEmail,
          protocol: slot.protocol || 'Wellness',
          notes: slot.patientNotes || '',
          prefers_email: slot.prefers_email !== false,
          prefers_sms: slot.prefers_sms !== false,
          namePolicy,
          forceCreate,
        });
        if (ensured.error) {
          setAppointmentSaveFeedback({
            phase: 'error',
            title: locale === 'en' ? 'Could not save' : 'No se pudo guardar',
            detail: /unauthorized/i.test(ensured.error.message)
              ? L.dbErrorUnauthorized
              : staffAlert(locale, 'patientFileError', ensured.error.message),
            closeForm: false,
          });
          return;
        }
        canonicalPatient = ensured.displayName;
        canonicalPhone = ensured.phone;
        canonicalEmail = ensured.email;
        if (ensured.isNew || ensured.forceCreated) isNewForAppointment = true;
      } else if (newPatientForSlot && !slot.id) {
        setAppointmentSaveFeedback({
          phase: 'error',
          title: locale === 'en' ? 'Phone required' : 'Teléfono requerido',
          detail: staffAlert(locale, 'phoneRequired'),
          closeForm: false,
        });
        return;
      } else if (!newPatientForSlot) {
        const contactResult = await persistPatientContactFromSlot(slot);
        if (contactResult.error) {
          setAppointmentSaveFeedback({
            phase: 'error',
            title: locale === 'en' ? 'Could not save' : 'No se pudo guardar',
            detail: /unauthorized/i.test(contactResult.error.message)
              ? L.dbErrorUnauthorized
              : staffAlert(locale, 'patientFileError', contactResult.error.message),
            closeForm: false,
          });
          return;
        }
        if (contactResult.phone) canonicalPhone = contactResult.phone;
        if (contactResult.email) canonicalEmail = contactResult.email;
        if (contactResult.patient) canonicalPatient = contactResult.patient;
      }

      const basePayload = {
        patient: canonicalPatient,
        phone: canonicalPhone,
        email: canonicalEmail,
        protocol: slot.protocol || 'Wellness',
        equipment: slot.equipment,
        duration: sessionTimes.duration,
        buffer: sessionTimes.buffer,
        time: slot.time,
        appointment_time: slot.time,
        attendant: slot.attendant || 'Por Asignar',
        check_in_status: slot.check_in_status || 'Agendado',
        is_new_patient: isNewForAppointment,
        notes: slot.notes || '',
        outside_normal_hours: !!slot.outside_normal_hours,
        is_extended_block: isExtendedSession(slot),
        clinic: normalizeClinicId(activeClinic),
        promoter_code: normalizePromoCode(slot.promoter_code) || null,
      };

      let createdCount = 0;
      let skippedCount = 0;
      let firstCreated = null;

      for (const dateIso of occurrenceDates) {
        if (checkOverlap(
          slot.equipment,
          dateIso,
          slot.time,
          sessionTimes.duration,
          sessionTimes.buffer,
          slot.id,
        )) {
          skippedCount += 1;
          continue;
        }

        const dayName = getDayNameFromDate(locale, new Date(`${dateIso}T12:00:00`));
        const payload = {
          ...basePayload,
          full_date: dateIso,
          appointment_date: dateIso,
          day: dayName,
        };

        const { data: na, error } = await insertStaffAppointment(activeSupabase, payload);
        if (error) {
          if (error.message === 'SLOT_UNAVAILABLE') {
            skippedCount += 1;
            continue;
          }
          if (error.sessionExpired || /unauthorized/i.test(error.message)) {
            throw Object.assign(new Error(error.message || 'Unauthorized'), { sessionExpired: true });
          }
          throw error;
        }

        if (na?.[0]) {
          createdCount += 1;
          if (!firstCreated) firstCreated = na[0];
          const flags = [
            slot.outside_normal_hours ? L.p.appt.badgeOutsideHours : '',
            isExtendedSession(slot) ? L.p.appt.badgeExtended : '',
          ].filter(Boolean).join(' · ');
          await logAudit(na[0].id, payload.patient, 'CREACIÓN', `${payload.time} · ${dateIso}${flags ? ` (${flags})` : ''}`);
          pushGoogleCalendarSync(na[0].id, 'upsert');
        }
      }

      if (createdCount === 0) {
        setAppointmentSaveFeedback({
          phase: 'error',
          title: locale === 'en' ? 'No appointments created' : 'No se creó ninguna cita',
          detail: skippedCount > 0
            ? (locale === 'en' ? 'All selected times conflict with existing bookings.' : 'Todos los horarios chocan con citas existentes.')
            : a('genericError', ''),
          closeForm: false,
        });
        return;
      }

      let notifySummary = '';
      if (firstCreated) {
        const patientNotifyResult = await notifyPatientFromSlot({
          ...basePayload,
          id: firstCreated.id,
          full_date: firstCreated.full_date || apptDate,
          fullDate: firstCreated.full_date || apptDate,
          phone: canonicalPhone,
          email: canonicalEmail,
          prefers_email: slot.prefers_email ?? resolvedContact.prefers_email,
          prefers_sms: slot.prefers_sms ?? resolvedContact.prefers_sms,
          is_new_patient: isNewForAppointment,
        }, { reportResult: true });
        const staffNotifyResult = await alertStaffNewBooking({
          ...basePayload,
          full_date: firstCreated.full_date || apptDate,
          fullDate: firstCreated.full_date || apptDate,
          phone: canonicalPhone,
          email: canonicalEmail,
          is_new_patient: isNewForAppointment,
        }, { source: 'staff', isFirstSession: isFirstSessionAppointment({
          isNewPatient: isNewForAppointment,
          patientName: slot.patient,
          appointments: dbAppointments,
          excludeAppointmentId: firstCreated.id,
          normalize: normalizeStr,
        }) });
        notifySummary = formatBookingNotifyFeedback({
          patientResult: patientNotifyResult,
          staffResult: staffNotifyResult,
          locale,
        });
        if (notifyHadFailure(patientNotifyResult?.report)) {
          notifySummary = a('notifyFailed', notifySummary || '');
        } else {
          notifySummary = a('notifySent', notifySummary || '');
        }
      }

      const recurrenceLine = createdCount > 1
        ? `${L.p.appt.repeatCreated(createdCount, skippedCount)}\n`
        : (skippedCount > 0 ? `${L.p.appt.repeatCreated(createdCount, skippedCount)}\n` : '');

      await notifyCalendarChanged();

      setAppointmentSaveFeedback({
        phase: 'success',
        title: locale === 'en' ? 'Appointment saved' : 'Cita guardada',
        detail: `${recurrenceLine}${notifySummary || (locale === 'en' ? 'Done.' : 'Listo.')}`,
        closeForm: true,
        autoCloseMs: 1400,
      });
    } catch (e) {
      setAppointmentSaveFeedback({
        phase: 'error',
        title: locale === 'en' ? 'Error' : 'Error',
        detail: formatAppointmentSaveError(e),
        closeForm: false,
      });
    } finally {
      setIsSavingAppointment(false);
    }
  };

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

    const payload = {
      code,
      name,
      is_active: newPromoter.is_active !== false,
      notes: String(newPromoter.notes || '').trim(),
      email: String(newPromoter.email || '').trim().toLowerCase(),
    };
    if (!isEditingPromoter || !newPromoter.id) {
      payload.calendar_feed_token = generateCalendarFeedToken();
    } else if (!String(newPromoter.calendar_feed_token || '').trim()) {
      payload.calendar_feed_token = generateCalendarFeedToken();
    }
    const clinicDb = createStaffDb(activeClinic);
    const savePayload = async (row) => {
      if (isEditingPromoter && newPromoter.id) {
        return clinicDb.from('promoters').update(row).eq('id', newPromoter.id).select('*');
      }
      return clinicDb.from('promoters').insert([row]).select('*');
    };

    let res = await savePayload(payload);
    if (res.error && /notes|calendar_feed_token|email|column|schema cache/i.test(res.error.message || '')) {
      const { notes, calendar_feed_token, email, ...coreRow } = payload;
      res = await savePayload(coreRow);
      if (!res.error && calendar_feed_token !== undefined) {
        alert(L.p.admin.promoterCalendarFeedBroken);
        return;
      }
      if (!res.error && notes !== undefined) {
        alert(L.p.admin.promoterNotesColumnMissing);
      }
      if (!res.error && email !== undefined && String(newPromoter.email || '').trim()) {
        alert(L.p.admin.promoterEmailColumnMissing);
      }
    }
    if (res.error) {
      if (res.error.sessionExpired) {
        alert(`${L.p.admin.promoterSaveError}: ${L.dbErrorUnauthorized}`);
        await handleLogout();
        return;
      }
      return alert(`${L.p.admin.promoterSaveError}: ${res.error.message}`);
    }

    await logAudit(
      null,
      name,
      isEditingPromoter ? 'PROMOTOR ACTUALIZADO' : 'ALTA PROMOTOR',
      `Código ${code} · ${activeClinic}`,
    );
    setIsEditingPromoter(false);
    setNewPromoter({ id: null, code: '', name: '', email: '', notes: '', is_active: true });
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
    <div className="flex app-shell-height lg:h-screen bg-slate-50 font-sans text-slate-900 overflow-hidden relative">

      {wrongHostWarning && (
        <div className="fixed inset-x-0 fixed-safe-top z-[100000] bg-amber-500 text-amber-950 px-3 py-2 text-center text-[10px] sm:text-xs font-black uppercase shadow-lg">
          Esta URL no es producción — abre{' '}
          <a href={`https://${canonicalHost}`} className="underline underline-offset-2">
            {canonicalHost}
          </a>
          {' '}(versión {buildSha})
        </div>
      )}

      {currentUser && dbStatus === 'cargando' && (
        <div className={`fixed inset-x-0 fixed-safe-top z-[99998] bg-blue-600 text-white px-4 py-2 text-center text-[10px] sm:text-xs font-black uppercase shadow-lg ${wrongHostWarning ? 'top-[calc(env(safe-area-inset-top,0px)+2.25rem)]' : ''}`}>
          {L.dbLoading}
        </div>
      )}

      {currentUser && dbStatus === 'error' && (
        <div className={`fixed inset-x-0 fixed-safe-top z-[99998] bg-red-600 text-white px-3 py-3 shadow-lg ${wrongHostWarning ? 'top-[calc(env(safe-area-inset-top,0px)+2.25rem)]' : ''}`}>
          <div className="max-w-3xl mx-auto text-center">
            <p className="text-[11px] sm:text-xs font-black uppercase">{L.dbErrorTitle}</p>
            <p className="text-[10px] sm:text-[11px] font-semibold mt-1 leading-snug opacity-95">{dbErrorHint}</p>
            {dbErrorMessage && (
              <p className="text-[9px] font-mono mt-1 opacity-80 break-all">{dbErrorMessage}</p>
            )}
            <button
              type="button"
              onClick={() => fetchAllData()}
              className="mt-2 bg-white text-red-700 text-[10px] font-black uppercase px-4 py-1.5 rounded-lg hover:bg-red-50 transition"
            >
              {L.dbErrorRetry}
            </button>
          </div>
        </div>
      )}
      
      {/* CAPA DE BLOQUEO: INICIAR TURNO Y LLAVE MAESTRA */}
      {authBootstrapping && !currentUser && (
        <div className="fixed inset-0 bg-slate-900/95 backdrop-blur-md flex items-center justify-center z-[99999]">
          <div className="bg-white p-8 rounded-3xl shadow-2xl text-center border mx-4">
            <img src="/1c3300f3-f5e7-4682-b627-257e868ed467.jpg" className="h-16 mx-auto mb-4 rounded-xl shadow-sm" alt="Logo"/>
            <p className="text-sm font-black uppercase text-slate-600">{L.loginRestoring}</p>
          </div>
        </div>
      )}
      {!currentUser && !authBootstrapping && (
        <div className="fixed inset-0 bg-slate-900/95 backdrop-blur-md flex items-center justify-center z-[99999] safe-area-top safe-area-bottom">
           <div className="bg-white p-6 sm:p-10 rounded-3xl shadow-2xl w-full max-w-sm text-center border mx-4">
             <img src="/1c3300f3-f5e7-4682-b627-257e868ed467.jpg" className="h-20 mx-auto mb-6 rounded-xl shadow-sm" alt="Logo"/>
             <h2 className="text-2xl font-black uppercase mb-2 text-slate-800">{L.loginTitle}</h2>
             <p className="text-xs font-bold text-slate-500 mb-6 uppercase">
               {loginModeTrusted
                 ? (trustedDevice?.pinFresh === false ? L.loginTrustedPinHint : L.loginTrustedHint)
                 : L.loginHint}
             </p>
             {loginModeTrusted && trustedDevice?.emailMasked ? (
               <div className="mb-4 p-3 rounded-xl bg-blue-50 border border-blue-100 text-left">
                 <p className="text-[10px] font-black uppercase text-blue-600 mb-1">{L.loginTrustedHint}</p>
                 <p className="text-sm font-black text-slate-800">{trustedDevice.emailMasked}</p>
                 <button
                   type="button"
                   onClick={handleForgetDevice}
                   className="mt-2 text-[10px] font-black uppercase text-blue-700 underline"
                 >
                   {L.loginUseOtherAccount}
                 </button>
               </div>
             ) : (
               <>
                 <label className="block text-[10px] font-black uppercase text-slate-400 text-left mb-1 ml-1">{L.loginEmail}</label>
                 <input
                   type="email"
                   autoComplete="username"
                   value={loginEmail}
                   onChange={(e) => setLoginEmail(e.target.value)}
                   disabled={isLoggingIn}
                   placeholder={L.loginEmailPh}
                   className="w-full p-3 mb-4 border-2 border-slate-200 rounded-xl outline-none focus:border-blue-500 font-bold text-sm text-slate-900 bg-slate-50 disabled:opacity-60"
                 />
                 <label className="flex items-start gap-2 mb-4 text-left cursor-pointer">
                   <input
                     type="checkbox"
                     checked={rememberDevice}
                     onChange={(e) => setRememberDevice(e.target.checked)}
                     disabled={isLoggingIn}
                     className="mt-0.5 w-4 h-4"
                   />
                   <span className="text-[10px] font-bold text-slate-600 uppercase leading-relaxed">{L.loginRememberDevice}</span>
                 </label>
               </>
             )}
             <label className="block text-[10px] font-black uppercase text-slate-400 text-left mb-1 ml-1">NIP</label>
             <input 
                type="password"
                autoComplete="current-password"
                maxLength="10" 
                value={loginPin} 
                onChange={e => setLoginPin(e.target.value)} 
                onKeyDown={e => {
                 if (e.key === 'Enter') handleLoginSubmit();
               }}
               disabled={isLoggingIn}
               className="w-full text-center text-3xl tracking-[0.2em] font-black p-4 border-2 border-slate-200 rounded-xl outline-none focus:border-blue-500 mb-6 bg-slate-50 text-slate-900 disabled:opacity-60" 
             />
             <button onClick={handleLoginSubmit} disabled={isLoggingIn || !loginPin.trim() || (!loginModeTrusted && !loginEmail.trim())} className="w-full bg-blue-600 text-white font-black py-4 rounded-xl uppercase text-sm shadow-md hover:bg-blue-700 transition disabled:opacity-60 disabled:cursor-not-allowed">
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
             <span className="text-[8px] text-emerald-400">{L.accessLevel}: {currentUserLevel}{currentUserLevel >= 99 ? (locale === 'en' ? ' (role unresolved)' : ' (rol no reconocido)') : ''}</span>
             {visibleClinics.length > 1 && (
               <span className="text-[8px] text-blue-300">{L.clinics}: {visibleClinics.map((c) => getClinicShortLabel(c)).join(' · ')}</span>
             )}
           </div>
        )}

        {currentUser && visibleClinics.length > 1 && (
        <div className="p-3 bg-slate-900 border-b border-slate-800">
          <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1.5 px-1">{L.activeLocation}</p>
          <div className="bg-slate-950 p-1 rounded-xl flex border border-slate-800 gap-0.5">
            {visibleClinics.map((clinicKey) => {
              const theme = getClinicTheme(clinicKey);
              const meta = getClinicMeta(clinicKey);
              return (
                <button
                  key={clinicKey}
                  onClick={() => switchClinic(clinicKey)}
                  className={`flex-1 py-2 text-[10px] font-black uppercase rounded-lg transition-all ${activeClinic === clinicKey ? `${theme.active} text-white shadow-md` : 'text-slate-500 hover:text-slate-300'}`}
                >
                  {meta.flag} {meta.shortLabel}
                </button>
              );
            })}
          </div>
        </div>
        )}

        {currentUser && visibleClinics.length === 1 && (
        <div className="p-3 bg-slate-900 border-b border-slate-800">
          <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1.5 px-1">{L.location}</p>
          <div className="bg-slate-950 py-2 px-3 rounded-xl border border-slate-800 text-center text-[10px] font-black uppercase text-white leading-snug">
            {activeClinicDisplayName}
          </div>
        </div>
        )}

        <div className="p-3 space-y-2">
          <button onClick={() => openNewAppointment()} className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-black py-3 rounded-xl flex items-center justify-center gap-2 shadow-lg transition uppercase text-xs">
            <span className="text-xl leading-none">+</span> {L.newAppointment}
          </button>
          <button
            type="button"
            onClick={() => setShowScreenshotIntake(true)}
            className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-black py-2.5 rounded-xl flex items-center justify-center gap-2 shadow transition uppercase text-[10px]"
          >
            {L.p.appt.screenshotFromCapture.replace(/^📷\s*/, '📷 ')}
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
          <button type="button" onClick={() => setShowAgentChat(true)} className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg font-bold transition text-sm text-violet-300 hover:bg-slate-800">🤖 {locale === 'en' ? 'Assistant' : 'Asistente'}</button>
          
          {currentUserLevel <= 2 && (
            <>
              <div className="text-[10px] font-black text-slate-600 uppercase tracking-widest mb-1 px-2 mt-4">{L.administration}</div>
              <button onClick={() => selectTab('Servicios')} className={`w-full flex items-center gap-2 px-2.5 py-2 rounded-lg font-bold transition text-sm ${activeTab === 'Servicios' ? 'bg-blue-600/20 text-blue-400' : 'hover:bg-slate-800'}`}>⚙️ {L.tabs.Servicios}</button>
              <button onClick={() => selectTab('Reportes')} className={`w-full flex items-center gap-2 px-2.5 py-2 rounded-lg font-bold transition text-sm ${activeTab === 'Reportes' ? 'bg-blue-600/20 text-blue-400' : 'hover:bg-slate-800'}`}>📊 {L.tabs.Reportes}</button>
              <button onClick={() => selectTab('Admin')} className={`w-full flex items-center gap-2 px-2.5 py-2 rounded-lg font-bold transition text-sm ${activeTab === 'Admin' ? 'bg-blue-600/20 text-blue-400' : 'hover:bg-slate-800'}`}>🔒 {L.tabs.Admin}</button>
            </>
          )}
        </nav>
        <div className="p-3 pt-0 hidden lg:block">
          <button
            type="button"
            onClick={() => setShowSymbolLegend(true)}
            className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg font-bold transition text-sm text-slate-400 hover:bg-slate-800 hover:text-slate-200"
          >
            ℹ️ {L.symbolLegendBtn}
          </button>
        </div>
      </aside>

      {/* CONTENIDO PRINCIPAL */}
      <main className="flex-1 flex flex-col min-h-0 app-shell-height lg:h-screen overflow-hidden relative min-w-0 pb-[calc(3.5rem+env(safe-area-inset-bottom,0px))] lg:pb-0">

        {/* Barra superior móvil — compacta */}
        {currentUser && (
          <div className="lg:hidden shrink-0 bg-slate-950 text-white px-2 py-2 flex items-center gap-2 border-b border-slate-800 z-20 safe-area-top">
            <img src="/1c3300f3-f5e7-4682-b627-257e868ed467.jpg" alt="Logo" className="h-8 w-8 object-contain bg-white rounded p-0.5 shrink-0" />
            {visibleClinics.length > 1 ? (
              <div className="flex bg-slate-900 p-0.5 rounded-lg border border-slate-700 shrink-0">
                {visibleClinics.map((clinicKey) => {
                  const theme = getClinicTheme(clinicKey);
                  const meta = getClinicMeta(clinicKey);
                  return (
                    <button
                      key={clinicKey}
                      onClick={() => switchClinic(clinicKey)}
                      className={`px-2 py-1 text-[9px] font-black rounded-md ${activeClinic === clinicKey ? `${theme.active} text-white` : 'text-slate-400'}`}
                      title={meta.shortLabel}
                    >
                      {meta.flag}
                    </button>
                  );
                })}
              </div>
            ) : (
              <span className="text-[9px] font-black uppercase text-slate-200 shrink-0 max-w-[38vw] truncate" title={activeClinicDisplayName}>
                {activeClinicTheme.flag} {activeClinicDisplayName}
              </span>
            )}
            <span className="flex-1 truncate text-[10px] font-bold text-slate-200 min-w-0">{currentUser.name}</span>
            <button type="button" onClick={() => setShowSymbolLegend(true)} className="shrink-0 h-8 w-8 rounded-lg border border-slate-700 text-sm leading-none" aria-label={L.symbolLegendBtn}>ℹ️</button>
            <button onClick={() => openNewAppointment()} className="shrink-0 h-8 w-8 bg-emerald-600 rounded-lg text-white font-black text-lg leading-none shadow" aria-label={L.ariaNewAppt}>+</button>
            <button
              type="button"
              onClick={() => setShowScreenshotIntake(true)}
              className="shrink-0 h-8 w-8 bg-indigo-600 rounded-lg text-white text-base leading-none shadow"
              aria-label={L.ariaScreenshotCapture}
            >
              📷
            </button>
            <button onClick={handleLogout} className="shrink-0 text-[9px] font-black text-red-400 uppercase px-1">{L.logout}</button>
          </div>
        )}

        {currentUser && (
          <div className={`lg:hidden shrink-0 z-20 border-b ${activeClinicTheme.banner} text-white px-3 py-1.5 flex items-center justify-center gap-2 shadow-sm`}>
            <span className="text-[11px] sm:text-sm font-black uppercase tracking-wide truncate max-w-full text-center">
              {activeClinicTheme.flag} {activeClinicDisplayName}
            </span>
            {dbStatus === 'cargando' ? (
              <span className="text-[8px] font-bold uppercase opacity-80 shrink-0">…</span>
            ) : null}
          </div>
        )}
        
        {/* VISTA AGENDA */}
        {activeTab === 'Agenda' && (
          <div className="flex flex-col h-full relative z-10">
            <header className="bg-white border-b border-slate-200 shrink-0 shadow-sm z-20">
              <div className="flex flex-wrap items-center gap-1.5 px-2 py-1.5 lg:px-3">
                <div className="flex bg-slate-100 p-0.5 rounded-lg border border-slate-200 shrink-0">
                  <button onClick={() => navigateDate(-1)} className="p-1.5 hover:bg-white rounded-lg transition text-slate-600 text-sm" aria-label={L.scrollLeft}>◀</button>
                  <div className="px-2 sm:px-3 flex items-center justify-center min-w-0">
                    <span className="text-[10px] sm:text-xs font-bold text-slate-800 truncate max-w-[9rem] sm:max-w-none">
                      {viewMode === 'Día'
                        ? `${currentDayInfo.name} · ${currentDayInfo.date}`
                        : `${weekDays[0].name} ${weekDays[0].date} – ${weekDays[6].name} ${weekDays[6].date}`}
                    </span>
                  </div>
                  <button onClick={() => navigateDate(1)} className="p-1.5 hover:bg-white rounded-lg transition text-slate-600 text-sm" aria-label={L.scrollRight}>▶</button>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const now = getClinicNow(activeClinic);
                    setCurrentDate(now.date);
                    if (isMobileViewport) setViewMode('Día');
                    pendingScrollToNowRef.current = true;
                    window.setTimeout(() => scrollCalendarToNow('smooth'), 80);
                  }}
                  className="text-[9px] font-black uppercase text-slate-500 hover:text-blue-600 transition border border-slate-200 px-2 py-1 rounded shrink-0"
                >
                  {L.today}
                </button>
                <div className="flex items-center bg-slate-200/50 p-0.5 rounded-lg shrink-0">
                  <button onClick={() => { setZoomManual(false); setViewMode('Día'); pendingScrollToNowRef.current = true; }} className={`px-2 py-0.5 rounded font-black text-[9px] uppercase transition ${viewMode === 'Día' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-500'}`}>{L.viewDay}</button>
                  <button onClick={() => { setZoomManual(false); setViewMode('Semana'); pendingScrollToNowRef.current = true; }} className={`px-2 py-0.5 rounded font-black text-[9px] uppercase transition ${viewMode === 'Semana' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-500'}`}>{L.viewWeekShort}</button>
                </div>
                <span className="hidden lg:inline text-[9px] font-bold text-slate-400 shrink-0 border-l border-slate-200 pl-2">
                  {agendaSummary.view} {L.agendaSummaryAppts}
                </span>
                <span className="lg:hidden text-[9px] font-bold text-slate-500 shrink-0" title={`${L.agendaSummaryToday}: ${agendaSummary.today} · ${L.agendaSummaryView}: ${agendaSummary.view}`}>
                  {agendaSummary.today}/{agendaSummary.view}
                </span>
                <span
                  className={`text-[8px] font-black uppercase shrink-0 px-1.5 py-0.5 rounded border ${
                    liveSyncAt && Date.now() - liveSyncAt < 20000
                      ? 'text-emerald-700 bg-emerald-50 border-emerald-200'
                      : 'text-slate-400 bg-slate-50 border-slate-200'
                  }`}
                  title={locale === 'en'
                    ? 'Ping every 3s; calendar reloads only when data changes'
                    : 'Ping cada 3 s; la agenda solo se recarga si hay cambios'}
                >
                  {liveSyncAt && Date.now() - liveSyncAt < 20000 ? '● Live' : '○ Sync'}
                </span>
                <span
                  className="text-[8px] font-black uppercase shrink-0 px-1.5 py-0.5 rounded border text-slate-400 bg-slate-50 border-slate-200"
                  title={locale === 'en' ? `App build ${buildSha}` : `Versión de la app ${buildSha}`}
                >
                  v{buildSha}
                </span>
                <div className="flex-1 min-w-[0.5rem]" />
                {currentUserLevel <= 2 && (
                  <button onClick={openBlockSlotModal} className="bg-red-100 text-red-700 border border-red-300 px-2 py-1 text-[9px] font-black rounded-lg hover:bg-red-200 transition uppercase shrink-0 flex items-center gap-1" title={L.blockSlot}>
                    <span>🚫</span>
                    <span className="hidden sm:inline">{L.blockSlot}</span>
                  </button>
                )}
                <div className="flex items-center gap-1 px-1 border-l border-slate-200 shrink-0">
                  <span className="text-[8px] font-black text-slate-400 uppercase hidden sm:inline">{L.zoom}</span>
                  <input type="range" min="20" max="300" value={zoomScale} onChange={(e) => { setZoomScale(Number(e.target.value)); setZoomManual(true); }} className="w-14 sm:w-20 h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer" aria-label={L.zoom} />
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

              <div className="flex flex-wrap items-center gap-1.5 px-2 py-1.5 lg:px-3 bg-slate-50 border-t border-slate-100">
                <div className="flex flex-wrap items-center gap-1 flex-1 min-w-0">
                  <span className="text-[9px] font-black text-blue-700 uppercase shrink-0 mr-0.5">{L.filterEquipment}</span>
                  <button
                    type="button"
                    onClick={() => { setEquipmentFilter('Todos'); setZoomManual(false); setWeekFilterHintDismissed(true); }}
                    className={`px-2 py-1 rounded-md text-[10px] font-black uppercase border transition shrink-0 ${equipmentFilter === 'Todos' ? 'bg-blue-600 text-white border-blue-600 shadow-sm' : 'bg-white text-slate-600 border-slate-300 hover:border-blue-400'}`}
                  >
                    {L.allEquipment}
                  </button>
                  {filterChipEquipments.map((eq) => (
                    <button
                      key={eq}
                      type="button"
                      title={eq}
                      onClick={() => { setEquipmentFilter(eq); setZoomManual(false); setWeekFilterHintDismissed(true); }}
                      className={`px-2 py-1 rounded-md text-[10px] font-black uppercase border transition shrink-0 ${equipmentFilter === eq ? 'bg-blue-600 text-white border-blue-600 shadow-sm' : eq === assessmentService ? 'bg-fuchsia-50 text-fuchsia-800 border-fuchsia-300 hover:border-fuchsia-400' : 'bg-white text-slate-600 border-slate-300 hover:border-blue-400'}`}
                    >
                      {getEquipmentShortLabel(eq)}
                    </button>
                  ))}
                </div>
                {(calendarHScroll.max > 8) && (
                  <div className="flex items-center gap-1 shrink-0 ml-auto">
                    <button
                      type="button"
                      aria-label={L.scrollLeft}
                      disabled={calendarHScroll.left <= 0}
                      onClick={() => scrollCalendarHorizontal(viewMode === 'Semana' ? -Math.max(120, currentColWidth) : -240)}
                      className="shrink-0 w-6 h-6 flex items-center justify-center rounded bg-white border border-slate-300 text-slate-600 text-xs hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                      ◀
                    </button>
                    <input
                      type="range"
                      min={0}
                      max={Math.max(calendarHScroll.max, 1)}
                      value={Math.min(calendarHScroll.left, calendarHScroll.max || 0)}
                      onChange={(e) => setCalendarScrollLeft(Number(e.target.value))}
                      className="w-16 sm:w-24 lg:w-32 h-1 accent-slate-400 cursor-pointer"
                      aria-label={L.scrollHorizontal}
                    />
                    <button
                      type="button"
                      aria-label={L.scrollRight}
                      disabled={calendarHScroll.left >= calendarHScroll.max - 2}
                      onClick={() => scrollCalendarHorizontal(viewMode === 'Semana' ? Math.max(120, currentColWidth) : 240)}
                      className="shrink-0 w-6 h-6 flex items-center justify-center rounded bg-white border border-slate-300 text-slate-600 text-xs hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                      ▶
                    </button>
                  </div>
                )}
              </div>

              {showCalendarLegend && (
                <div className="flex flex-wrap gap-1.5 px-2 py-1.5 lg:px-3 border-t border-slate-100 text-[9px] font-bold text-slate-600">
                  <span className="inline-flex items-center gap-1 bg-white border border-slate-300 px-2 py-0.5 rounded-lg"><span className="w-3 h-3 bg-white border border-slate-300 rounded" /> {L.legendAvailable}</span>
                  <span className="inline-flex items-center gap-1 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-lg">🟡 {L.legendOutsideHours}</span>
                  <span className="inline-flex items-center gap-1 bg-violet-50 border border-violet-200 px-2 py-0.5 rounded-lg">🟣 {L.legendExtended}</span>
                  <span className="inline-flex items-center gap-1 bg-slate-50 border border-slate-200 px-2 py-0.5 rounded-lg">⭐ {L.legendNewPatient}</span>
                  <button type="button" onClick={() => setShowSymbolLegend(true)} className="inline-flex items-center gap-1 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-lg text-blue-700 font-black uppercase">
                    ℹ️ {L.legendViewAll}
                  </button>
                  <span className="hidden lg:inline text-slate-400 self-center">{L.shortcutsHint}</span>
                </div>
              )}
            </header>

            {/* --- CONTENEDOR DEL CALENDARIO: SCROLL UNIFICADO (CIRUGÍA CSS) --- */}
            <div ref={calendarScrollRef} className={`calendar-h-scroll flex-1 bg-white overflow-auto relative m-1.5 lg:m-4 rounded-lg lg:rounded-xl shadow-inner border border-slate-200 min-h-0 scroll-pb-16 overscroll-contain ${fitAllEquipOnScreen ? 'overflow-x-hidden' : ''}`} style={{ scrollPaddingBottom: '4rem' }}>
              <div className={`flex pb-16 ${fitAllEquipOnScreen ? 'w-full min-w-0' : 'min-w-max'}`}>
                
                <div className="w-16 md:w-20 shrink-0 border-r border-slate-200 bg-slate-50 sticky left-0 z-50" data-cal-time-col>
                  <div
                    className="border-b border-slate-200 bg-slate-100 flex items-center justify-center sticky top-0 z-[60]"
                    style={{ height: viewMode === 'Semana' ? `${weekStickyHeaderPx}px` : '48px' }}
                  >
                    <span className="text-[9px] font-black text-slate-400 uppercase">{L.time}</span>
                  </div>
                  <div className="relative" style={{ height: `${CALENDAR_HEIGHT}px` }}>
                    {timeOptions.map((timeStr, timeIdx) => {
                      const slotMins = calendarStartMins + timeIdx * intervalMins;
                      const isHourLine = slotMins % 60 === 0;
                      return (
                      <div key={timeStr} className={`absolute w-full border-t box-border ${isHourLine ? 'border-slate-300/90' : 'border-slate-200/80'}`} style={{ top: `${timeToPixels(timeStr)}px`, height: `${intervalMins * PIXELS_PER_MINUTE}px` }}>
                        <span className="block text-right pr-2 pt-0.5 text-[9px] font-black text-slate-600 leading-none bg-slate-50">{timeStr}</span>
                      </div>
                    );})}
                  </div>
                </div>
                
                <div className="flex-1 flex">
                  {viewMode === 'Día' ? (
                    <div className="flex min-w-full flex-col">
                      {showAssessmentBand && getAssessmentAppsForDay(currentDayInfo.fullDate).length > 0 && (
                        <CalendarAssessmentBand
                          appointments={getAssessmentAppsForDay(currentDayInfo.fullDate)}
                          locale={locale}
                          L={L}
                          calculateEndTime={calculateEndTime}
                          onSelect={openAppointmentDetails}
                          label={assessmentService}
                        />
                      )}
                      <div className={`flex min-w-full ${fitAllEquipOnScreen ? 'w-full' : ''}`}>
                      {displayedEquipments.map((eqName) => {
                        const srvColor = dbServices.find(s => s.name === eqName)?.color || 'blue';
                        const equipColStyle = fitAllEquipOnScreen
                          ? { flex: '1 1 0%', minWidth: 0 }
                          : { minWidth: `${currentColWidth}px`, flex: `0 0 ${currentColWidth}px` };
                        const blockColWidth = fitAllEquipOnScreen
                          ? Math.max(48, Math.floor(320 / Math.max(1, displayedEquipments.length)))
                          : currentColWidth;
                        return (
                        <div key={eqName} className={`border-r border-slate-300 last:border-r-0 min-w-0 ${getEquipmentBgColor(srvColor)}`} style={equipColStyle}>
                          <div className={`h-12 border-b border-slate-200 flex flex-col items-center justify-center sticky top-0 z-[55] shadow-md ${getEquipmentHeaderColor(srvColor)}`}>
                            <span className="text-[8px] font-black uppercase leading-none text-slate-500">{currentDayInfo.name}</span>
                            <span className="text-[9px] sm:text-[10px] font-black uppercase leading-none truncate max-w-full px-0.5">{eqName}</span>
                            <span className="text-[8px] font-bold opacity-80">{currentDayInfo.date}</span>
                          </div>
                          <div className="relative w-full" style={{ height: `${CALENDAR_HEIGHT}px` }}>
                            
                            <div className="absolute inset-0 z-0">{renderBackgroundSlots(eqName, currentDayInfo.name, currentDayInfo.fullDate)}</div>
                            
                            {/* LÍNEA DE HORA ACTUAL (MULTIHUSO) */}
                            {currentDayInfo.fullDate === clinicNow.dateStr && clinicNow.mins >= calendarStartMins && clinicNow.mins <= endMins && (
                              <div className="absolute left-0 right-0 pointer-events-none flex items-center z-20" style={{ top: `${(clinicNow.mins - calendarStartMins) * PIXELS_PER_MINUTE}px`, marginTop: '-1px' }}>
                                <div className="w-2 h-2 rounded-full bg-red-500 shadow -ml-1"></div>
                                <div className="flex-1 border-t-2 border-red-500"></div>
                              </div>
                            )}

                            {/* BLOQUEOS OOO */}
                            {dbBlockedSlots.filter(b => b.date === currentDayInfo.fullDate && (b.is_global || appointmentEquipment(b.equipment) === eqName)).map(b => (
                              <button
                                type="button"
                                key={b.id}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  openBlockedSlotEditor(b);
                                }}
                                title={locale === 'en' ? 'Click to edit or remove block' : 'Clic para editar o quitar el bloqueo'}
                                className="absolute left-1 right-1 bg-slate-200 border-l-4 border-slate-400 rounded-md opacity-90 overflow-hidden flex flex-col justify-center items-center z-[15] cursor-pointer hover:opacity-100 hover:ring-2 hover:ring-red-400 focus:outline-none focus:ring-2 focus:ring-red-500"
                                style={{ backgroundImage: 'repeating-linear-gradient(45deg, transparent, transparent 10px, rgba(0,0,0,0.03) 10px, rgba(0,0,0,0.03) 20px)', top: `${timeToPixels(b.start_time)}px`, height: `${Math.max(24, timeToPixels(b.end_time) - timeToPixels(b.start_time))}px` }}
                              >
                                <span className="text-[10px] font-black text-slate-600 uppercase bg-white/90 px-2 py-1 rounded truncate max-w-full">
                                  {b.reason || (locale === 'en' ? 'Blocked' : 'Bloqueo')}
                                </span>
                                <span className="text-[8px] font-bold text-red-700 uppercase bg-white/90 px-1.5 py-0.5 rounded mt-1">
                                  {locale === 'en' ? 'Edit / Remove' : 'Editar / Quitar'}
                                </span>
                              </button>
                            ))}

                            {/* CITAS */}
                            {calendarAppointments.filter(app => appointmentEquipment(app.equipment) === eqName && app.full_date === currentDayInfo.fullDate && app.check_in_status !== 'Cancelado').map(app => (
                              <CalendarAppointmentBlock
                                key={app.id}
                                app={app}
                                colWidth={blockColWidth}
                                locale={locale}
                                L={L}
                                isSelected={selectedSlot?.id === app.id}
                                colorClasses={getEquipmentColors(srvColor)}
                                topPx={timeToPixels(app.time)}
                                calculateEndTime={calculateEndTime}
                                onSelect={() => openAppointmentDetails(app)}
                                draggable={!isMobileViewport && (selectedSlot?.id !== app.id || !isRescheduling)}
                                onDragStart={(e) => handleDragStart(e, app)}
                              />
                            ))}
                          </div>
                        </div>
                      )})}
                      </div>
                    </div>
                  ) : (
                    <div className="flex min-w-full gap-1.5 px-0.5">
                      {weekDays.map((dayInfo, dayIndex) => {
                        const dayOpen = getDaySchedule(dbCompanyConfig, dayInfo.fullDate).open;
                        const dayLayout = weekDayLayouts[dayInfo.fullDate] || weekDayColumnWidths({
                          equipmentNames: displayedEquipments,
                          colWidth: currentColWidth,
                        });
                        const { dayWidth, byEquipment } = dayLayout;
                        const equipWidthFor = (eqName) => byEquipment[eqName] ?? currentColWidth;
                        const dayAssessments = getAssessmentAppsForDay(dayInfo.fullDate);
                        const isToday = dayInfo.fullDate === clinicNow.dateStr;
                        return (
                        <div
                          key={dayInfo.fullDate}
                          data-cal-day={dayInfo.fullDate}
                          className={`shrink-0 rounded-lg shadow-md ring-1 ring-slate-300/80 ${isToday ? 'ring-2 ring-blue-500 shadow-blue-200/40' : ''} ${!dayOpen ? 'opacity-60' : ''} ${dayIndex > 0 ? 'border-l border-slate-200' : ''}`}
                          style={{ width: `${dayWidth}px`, minWidth: `${dayWidth}px`, flex: '0 0 auto' }}
                        >
                          <div
                            className={`sticky top-0 z-[55] border-b-2 border-slate-300 shadow-md ${isToday ? 'bg-blue-50' : dayOpen ? 'bg-slate-50' : 'bg-slate-200'}`}
                          >
                            <div className="flex flex-col items-center justify-center h-8 border-b border-slate-200/80">
                              <span className="font-black text-slate-800 uppercase leading-none text-[9px]">{dayInfo.name}</span>
                              <span className={`font-bold leading-none text-[10px] ${dayOpen ? 'text-blue-600' : 'text-slate-500'}`}>
                                {dayInfo.date}{!dayOpen ? ` · ${L.p.admin.weeklyClosedShort}` : ''}
                              </span>
                            </div>
                            <div className="flex border-b border-slate-200 h-7">
                              {displayedEquipments.map((eqName) => {
                                const srvColor = dbServices.find(s => s.name === eqName)?.color || 'blue';
                                const eqW = equipWidthFor(eqName);
                                return (
                                  <div
                                    key={`${dayInfo.fullDate}-hdr-${eqName}`}
                                    className={`flex items-center justify-center border-r border-slate-300 last:border-r-0 ${getEquipmentHeaderColor(srvColor)}`}
                                    style={{ width: `${eqW}px`, minWidth: `${eqW}px`, flex: `0 0 ${eqW}px` }}
                                    title={eqName}
                                  >
                                    <span className="text-[7px] sm:text-[8px] font-black uppercase truncate px-0.5 text-center w-full leading-none">
                                      {currentColWidth >= 96 ? eqName : getEquipmentShortLabel(eqName)}
                                    </span>
                                  </div>
                                );
                              })}
                            </div>
                            {showAssessmentBand && (
                              <CalendarAssessmentBand
                                appointments={dayAssessments}
                                locale={locale}
                                L={L}
                                calculateEndTime={calculateEndTime}
                                onSelect={openAppointmentDetails}
                                label={assessmentService}
                                reserveWhenEmpty
                              />
                            )}
                          </div>
                          <div className="flex w-full relative" style={{ height: `${CALENDAR_HEIGHT}px` }}>
                            {displayedEquipments.map(eqName => {
                              const srvColor = dbServices.find(s => s.name === eqName)?.color || 'blue';
                              const eqW = equipWidthFor(eqName);
                              return (
                              <div key={`${dayInfo.fullDate}-${eqName}`} className={`relative border-r border-slate-300 last:border-r-0 ${getEquipmentBgColor(srvColor)}`} style={{ width: `${eqW}px`, minWidth: `${eqW}px`, flex: `0 0 ${eqW}px` }}>
                                
                                <div className="absolute inset-0 z-0">{renderBackgroundSlots(eqName, dayInfo.name, dayInfo.fullDate)}</div>
                                
                                {dayInfo.fullDate === clinicNow.dateStr && clinicNow.mins >= calendarStartMins && clinicNow.mins <= endMins && (
                                  <div className="absolute left-0 right-0 pointer-events-none flex items-center z-20" style={{ top: `${(clinicNow.mins - calendarStartMins) * PIXELS_PER_MINUTE}px`, marginTop: '-1px' }}>
                                    <div className="w-2 h-2 rounded-full bg-red-500 shadow -ml-1"></div>
                                    <div className="flex-1 border-t-2 border-red-500"></div>
                                  </div>
                                )}

                                {dbBlockedSlots.filter(b => b.date === dayInfo.fullDate && (b.is_global || appointmentEquipment(b.equipment) === eqName)).map(b => (
                                  <button
                                    type="button"
                                    key={b.id}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      openBlockedSlotEditor(b);
                                    }}
                                    title={locale === 'en' ? 'Click to edit or remove block' : 'Clic para editar o quitar el bloqueo'}
                                    className="absolute left-0.5 right-0.5 bg-slate-200 border-l-2 border-slate-400 rounded-md opacity-90 overflow-hidden flex flex-col justify-center items-center z-[15] cursor-pointer hover:opacity-100 hover:ring-2 hover:ring-red-400 focus:outline-none focus:ring-2 focus:ring-red-500"
                                    style={{ backgroundImage: 'repeating-linear-gradient(45deg, transparent, transparent 10px, rgba(0,0,0,0.03) 10px, rgba(0,0,0,0.03) 20px)', top: `${timeToPixels(b.start_time)}px`, height: `${Math.max(18, timeToPixels(b.end_time) - timeToPixels(b.start_time))}px` }}
                                  >
                                    <span className="text-[7px] font-black text-slate-600 uppercase bg-white/90 px-1 rounded truncate w-full text-center">
                                      {b.reason || (locale === 'en' ? 'Blocked' : 'Bloqueo')}
                                    </span>
                                  </button>
                                ))}

                                {calendarAppointments.filter(app => appointmentEquipment(app.equipment) === eqName && app.full_date === dayInfo.fullDate && app.check_in_status !== 'Cancelado').map(app => (
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
                                    draggable={!isMobileViewport && (selectedSlot?.id !== app.id || !isRescheduling)}
                                    onDragStart={(e) => handleDragStart(e, app)}
                                  />
                                ))}
                              </div>
                            )})}
                          </div>
                        </div>
                      );})}
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
            {currentUserLevel <= 2 && (
              <div className="mb-4 bg-violet-50 border border-violet-200 rounded-xl px-4 py-3 text-[10px] font-bold text-violet-900 normal-case leading-relaxed">
                👥 {L.patientsPackagesHint}
              </div>
            )}
            
            {dbStatus === 'listo' && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                 {filteredPatients.map(p => (
                   <div key={p.id} className={`bg-slate-50 border ${p.is_blocked ? 'border-red-400 bg-red-50' : 'border-slate-200'} p-4 rounded-2xl hover:shadow-lg transition flex flex-col relative`}>

                      {p.is_blocked && (
                        <span className="absolute top-2 right-2 text-[8px] font-black uppercase bg-red-600 text-white px-2 py-0.5 rounded">
                          🚫 {locale === 'en' ? 'Blocked' : 'Bloqueado'}
                        </span>
                      )}
                      <p className="font-black text-slate-900 uppercase text-base truncate pr-20">
                        {p.is_blocked && <span title={locale === 'en' ? 'Patient blocked' : 'Paciente bloqueado'} className="mr-2">🚫</span>}
                        {p.sessionGroupId && <span title={L.symbolLegend?.legendSharedWallet || 'Cartera compartida'} className="mr-2">👥</span>}
                        {p.patient}
                      </p>
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest truncate">{p.phone || L.noPhone}</p>
                      <div className="flex justify-between items-center mt-2 mb-4">
                        <p className="text-[9px] font-black text-blue-600 uppercase tracking-widest bg-blue-50 px-2 py-1 rounded">{p.protocol}</p>
                        <p className="text-[9px] font-black text-slate-500 bg-slate-200 px-2 py-1 rounded">{L.sessions}: {p.historicoSesiones}</p>
                      </div>
                      <div className="mt-auto flex gap-2">
                         <button onClick={() => { 
                           setSelectedSlot({ ...p, patientId: p.id }); 
                           setShowPatientProfile(true); 
                         }} className="flex-1 bg-emerald-600 text-white text-[9px] font-black uppercase py-2 rounded hover:bg-emerald-700 transition shadow-sm">💳 {L.chart}</button>
                         <button
                           disabled={!!p.is_blocked}
                           onClick={() => { 
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
                             patientId: p.id,
                           }); 
                         }} className={`flex-1 text-white text-[9px] font-black uppercase py-2 rounded transition shadow-sm ${p.is_blocked ? 'bg-slate-400 cursor-not-allowed opacity-70' : 'bg-blue-600 hover:bg-blue-700'}`}>📅 {L.schedule}</button>
                      </div>
                   </div>
                 ))}
                 {filteredPatients.length === 0 && <div className="col-span-full py-20 text-center"><p className="text-slate-400 font-black uppercase text-lg">{L.noPatients}</p></div>}
              </div>
            )}
            {dbStatus !== 'listo' && (
              <div className="py-20 text-center">
                <p className="text-slate-400 font-black uppercase text-sm">{dbStatus === 'error' ? L.dbErrorTitle : L.dbLoading}</p>
              </div>
            )}
          </div>
        )}

        {/* VISTA SERVICIOS Y PROTOCOLOS (CATÁLOGO) */}
        {activeTab === 'Servicios' && currentUserLevel <= 2 && (
          <StaffTabErrorBoundary locale={locale} onGoAgenda={() => selectTab('Agenda')}>
          <div className={`${STAFF_TAB_PANEL} bg-slate-50`}>
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
                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 space-y-2">
                    <p className="text-[9px] font-black text-amber-900 uppercase">{L.p.services.firstSessionNotes}</p>
                    <p className="text-[8px] font-bold text-amber-800/90 leading-relaxed">{L.p.services.firstSessionNotesHint}</p>
                    <label className="flex items-start gap-2 bg-white p-2.5 rounded-lg border border-amber-200 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={!!newSrv.use_custom_notes}
                        onChange={(e) => setNewSrv({ ...newSrv, use_custom_notes: e.target.checked })}
                        className="w-4 h-4 mt-0.5 shrink-0"
                      />
                      <span className="text-[10px] font-black uppercase text-amber-900 leading-snug">{L.p.services.useCustomNotes}</span>
                    </label>
                    <textarea
                      rows={4}
                      className="w-full p-3 rounded-xl border border-amber-200 font-bold text-sm outline-none text-slate-900 bg-white leading-relaxed"
                      value={newSrv.first_session_notes || ''}
                      onChange={(e) => setNewSrv({ ...newSrv, first_session_notes: e.target.value })}
                      placeholder={L.p.services.firstSessionNotesPh}
                    />
                  </div>
                  <div className="flex gap-2 pt-1">
                    {isEditingSrv && <button onClick={() => {setIsEditingSrv(false); setEditingSrvOriginalName(''); setEditingSrvOriginalSchedule({ duration: 60, buffer: 30 }); setNewSrv({ id: null, name: '', duration: 60, buffer: 30, price: 100, color: 'blue', is_active: true, equipment: 'Cámara 1', start_time: '', end_time: '', first_session_notes: '', use_custom_notes: false });}} className="px-4 bg-slate-100 text-slate-700 font-black py-3 rounded-xl uppercase text-xs hover:bg-slate-200">Cancelar</button>}
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
                        clinic: normalizeClinicId(activeClinic),
                        first_session_notes: String(newSrv.first_session_notes || '').trim() || null,
                        use_custom_notes: !!newSrv.use_custom_notes,
                      };
                      const saveServiceRow = async (payload, id) => {
                        let row = { ...payload };
                        for (let attempt = 0; attempt < 3; attempt += 1) {
                          const res = id
                            ? await activeSupabase.from('services').update(row).eq('id', id)
                            : await activeSupabase.from('services').insert([row]);
                          if (!res.error) return res;
                          if (!/first_session_notes|use_custom_notes|column|schema cache/i.test(res.error.message || '')) {
                            return res;
                          }
                          const { first_session_notes, use_custom_notes, ...rest } = row;
                          row = rest;
                        }
                        return { error: { message: 'Ejecuta scripts/supabase-service-first-session-notes.sql en Supabase.' } };
                      };
                      try {
                        let error;
                        if (isEditingSrv && newSrv.id) {
                          const oldName = editingSrvOriginalName || newSrv.name;
                          const newName = p.name;
                          const apptCount = countAppointmentsForServiceResolved(oldName, dbServices, dbAppointments);
                          if (hasServiceScheduleChange(editingSrvOriginalSchedule, { duration, buffer }) && apptCount > 0) {
                            return alert(a('serviceDurationLocked', apptCount));
                          }
                          if (oldName !== newName) {
                            if (apptCount > 0 && !window.confirm(a('renameEquipmentConfirm', oldName, newName, apptCount))) {
                              return;
                            }
                            if (apptCount > 0) {
                              const renamed = await renameEquipmentAcrossClinic(activeSupabase, oldName, newName);
                              await logAudit(null, oldName, 'RENOMBRAR EQUIPO', `«${oldName}» → «${newName}». Citas: ${renamed.appointments}, bloqueos: ${renamed.blockedSlots}, pacientes: ${renamed.patients}`);
                            }
                          }
                          ({ error } = await saveServiceRow(p, newSrv.id));
                        } else {
                          ({ error } = await saveServiceRow(p));
                        }
                        if (error) return alert(`${L.p.services.saveError}: ${error.message}`);
                        setIsEditingSrv(false);
                        setEditingSrvOriginalName('');
                        setEditingSrvOriginalSchedule({ duration: 60, buffer: 30 });
                        setNewSrv({ id: null, name: '', duration: 60, buffer: 30, price: 100, color: 'blue', is_active: true, equipment: 'Cámara 1', start_time: '', end_time: '', first_session_notes: '', use_custom_notes: false });
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
                      <tr><th className="px-5 py-3">Equipo</th><th className="px-5 py-3">Horario</th><th className="px-5 py-3">Bloque</th><th className="px-5 py-3">Precio</th><th className="px-5 py-3">1ª sesión</th><th className="px-5 py-3">Estado</th><th className="px-5 py-3 text-right">Acciones</th></tr>
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
                            {s.use_custom_notes && String(s.first_session_notes || '').trim() ? (
                              <span className="inline-block px-2 py-1 rounded-md text-[9px] font-black uppercase bg-amber-100 text-amber-800" title={String(s.first_session_notes).slice(0, 120)}>
                                {L.p.services.hasFirstSessionNotes}
                              </span>
                            ) : (
                              <span className="text-[9px] font-bold text-slate-300 uppercase">—</span>
                            )}
                          </td>
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
                                setEditingSrvOriginalName(s.name);
                                setEditingSrvOriginalSchedule({
                                  duration: Number(s.duration) || 60,
                                  buffer: Number(s.buffer ?? 30),
                                });
                                setIsEditingSrv(true);
                              }} className="bg-blue-50 text-blue-700 px-3 py-1.5 rounded-lg text-[9px] font-black uppercase hover:bg-blue-100 border border-blue-100">Editar</button>
                              <button onClick={async () => {
                                try {
                                  const apptCount = countAppointmentsForServiceResolved(s.name, dbServices, dbAppointments);
                                  if (apptCount > 0) {
                                    return alert(a('deleteEquipmentHasAppts', apptCount));
                                  }
                                  if (!window.confirm(a('deleteEquipment'))) return;
                                  await activeSupabase.from('services').delete().eq('id', s.id);
                                  fetchAllData();
                                } catch (e) {
                                  alert(a('genericError', e?.message || String(e)));
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
          </StaffTabErrorBoundary>
        )}

        {/* VISTA REPORTES */}
        {activeTab === 'Reportes' && currentUserLevel <= 2 && (
          <StaffTabErrorBoundary locale={locale} onGoAgenda={() => selectTab('Agenda')}>
          <div className={`${STAFF_TAB_PANEL} bg-white relative`}>
            <div className="flex justify-between items-end mb-6 border-b border-slate-200 pb-4 gap-3 flex-wrap">
              <h2 className="text-2xl font-black text-slate-800 uppercase tracking-tight">{L.p.reports.title}</h2>
              <div className="flex flex-wrap bg-slate-100 p-1 rounded-lg border border-slate-200">
                {[
                  { id: 'Citas', label: L.p.reports.filterAppts },
                  { id: 'Paciente', label: L.p.reports.filterPatient },
                  { id: 'Ventas', label: L.p.reports.filterSales },
                  { id: 'Caja Negra', label: L.p.reports.filterAudit },
                ].map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setReportFilter(t.id)}
                    className={`px-4 sm:px-6 py-2 text-xs font-black uppercase rounded transition ${reportFilter === t.id ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500'}`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>
            
            {(reportFilter === 'Citas' || reportFilter === 'Día') && (
              <div className="flex-1 flex flex-col min-h-0">
                <div className="mb-4 space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-end gap-3">
                    <div className="min-w-0 flex-1">
                      <label className="block text-[10px] font-black uppercase text-slate-400 mb-1">{L.p.reports.apptsStart}</label>
                      <input
                        type="date"
                        value={reportStartDate}
                        onChange={(e) => {
                          setReportStartDate(e.target.value);
                          setReportDate(e.target.value);
                        }}
                        className="w-full p-2.5 border border-slate-300 rounded-lg font-bold text-sm outline-none text-slate-900 bg-white"
                      />
                    </div>
                    <div className="min-w-0 flex-1">
                      <label className="block text-[10px] font-black uppercase text-slate-400 mb-1">{L.p.reports.apptsEnd}</label>
                      <input
                        type="date"
                        value={reportEndDate}
                        onChange={(e) => setReportEndDate(e.target.value)}
                        className="w-full p-2.5 border border-slate-300 rounded-lg font-bold text-sm outline-none text-slate-900 bg-white"
                      />
                    </div>
                    <div className="flex gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={downloadAppointmentsReportCsv}
                        className="bg-emerald-700 text-white px-4 py-2.5 rounded-lg text-xs font-black uppercase hover:bg-emerald-600 transition"
                      >
                        {L.p.reports.downloadExcel}
                      </button>
                      <button
                        type="button"
                        onClick={printAppointmentsReport}
                        className="bg-slate-900 text-white px-4 py-2.5 rounded-lg text-xs font-black uppercase hover:bg-slate-800 transition"
                      >
                        {L.p.reports.apptsPrint}
                      </button>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2 items-center">
                    <button type="button" onClick={() => setReportApptRangePreset('today')} className="px-3 py-1.5 rounded-lg text-[10px] font-black uppercase bg-slate-100 border border-slate-200 text-slate-700 hover:bg-slate-200">{L.p.reports.apptsPresetToday}</button>
                    <button type="button" onClick={() => setReportApptRangePreset('next7')} className="px-3 py-1.5 rounded-lg text-[10px] font-black uppercase bg-slate-100 border border-slate-200 text-slate-700 hover:bg-slate-200">{L.p.reports.apptsPresetNext7}</button>
                    <button type="button" onClick={() => setReportApptRangePreset('prev7')} className="px-3 py-1.5 rounded-lg text-[10px] font-black uppercase bg-slate-100 border border-slate-200 text-slate-700 hover:bg-slate-200">{L.p.reports.apptsPresetPrev7}</button>
                    <label className="flex items-center gap-2 ml-auto text-xs font-bold text-slate-600 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={reportIncludeCancelled}
                        onChange={(e) => setReportIncludeCancelled(e.target.checked)}
                        className="w-4 h-4"
                      />
                      {L.p.reports.apptsIncludeCancelled}
                    </label>
                  </div>
                  <p className="text-xs text-slate-500">{L.p.reports.apptsHint}</p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
                    {[
                      { label: L.p.reports.apptsTotal, value: reportApptStats.total, className: 'bg-slate-50 border-slate-200 text-slate-800' },
                      { label: L.p.reports.apptsScheduled, value: reportApptStats.scheduled, className: 'bg-blue-50 border-blue-200 text-blue-800' },
                      { label: L.p.reports.apptsDone, value: reportApptStats.done, className: 'bg-emerald-50 border-emerald-200 text-emerald-800' },
                      { label: L.p.reports.apptsCancelled, value: reportApptStats.cancelled, className: 'bg-red-50 border-red-200 text-red-800' },
                      { label: L.p.reports.apptsNoShow, value: reportApptStats.noShow, className: 'bg-orange-50 border-orange-200 text-orange-800' },
                      { label: L.p.reports.apptsPendingCancel, value: reportApptStats.pendingCancel, className: 'bg-amber-50 border-amber-200 text-amber-900' },
                    ].map((card) => (
                      <div key={card.label} className={`rounded-xl border p-3 ${card.className}`}>
                        <p className="text-[9px] font-black uppercase tracking-widest opacity-80">{card.label}</p>
                        <p className="text-2xl font-black mt-1">{card.value}</p>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="flex-1 bg-slate-50 rounded-xl border border-slate-200 overflow-auto min-h-[280px]">
                  <table className="w-full text-left border-collapse bg-white">
                    <thead>
                      <tr className="bg-slate-100 border-b border-slate-200 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                        <th className="p-4">{L.p.reports.apptsColDate}</th>
                        <th className="p-4">{L.p.reports.apptsColTime}</th>
                        <th className="p-4">{L.p.reports.apptsColPatient}</th>
                        <th className="p-4 hidden md:table-cell">{L.p.reports.apptsColPhone}</th>
                        <th className="p-4 hidden lg:table-cell">{L.p.reports.apptsColAttendant}</th>
                        <th className="p-4 text-right">{L.p.reports.apptsColStatus}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {reportAppointments.map((app) => (
                        <tr key={app.id} className="hover:bg-slate-50 transition-colors">
                          <td className="p-4 font-black text-slate-800 text-xs whitespace-nowrap">{app.full_date}</td>
                          <td className="p-4">
                            <p className="text-xs font-black text-slate-800">{app.time}</p>
                            <p className="text-[9px] font-bold text-blue-600 uppercase">{app.equipment}</p>
                          </td>
                          <td className="p-4 font-black text-slate-700 uppercase text-sm">{app.patient}</td>
                          <td className="p-4 hidden md:table-cell font-bold text-slate-600 text-xs">{app.phone || '—'}</td>
                          <td className="p-4 hidden lg:table-cell font-bold text-slate-600 text-xs">{app.attendant || 'N/A'}</td>
                          <td className="p-4 text-right">{getStatusBadge(app.check_in_status)}</td>
                        </tr>
                      ))}
                      {reportAppointments.length === 0 && (
                        <tr>
                          <td colSpan="6" className="text-center p-8 text-slate-400 font-bold uppercase">
                            {L.p.reports.noApptsDate}
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {reportFilter === 'Paciente' && (
              <div className="flex-1 flex flex-col">
                <div className="flex flex-col md:flex-row gap-4 mb-4 items-end">
                  <input type="text" placeholder="Búsqueda Inteligente (Ignora acentos)..." value={selectedPatientReport} onChange={e => setSelectedPatientReport(e.target.value)} className="w-full max-w-md p-2.5 border border-slate-300 rounded-lg font-bold text-sm outline-none uppercase text-slate-900 bg-white" />
                  <button
                    type="button"
                    onClick={downloadPatientReportCsv}
                    className="bg-emerald-700 text-white px-4 py-2.5 rounded-lg text-xs font-black uppercase hover:bg-emerald-600 transition shrink-0"
                  >
                    {L.p.reports.downloadExcel}
                  </button>
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
                <div className="flex items-center gap-2 mb-4 bg-slate-100 p-3 rounded-xl border border-slate-200 flex-wrap">
                   <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Mostrando los últimos 200 movimientos de la clínica en tiempo real</span>
                   <div className="ml-auto flex gap-2">
                     <button
                       type="button"
                       onClick={downloadAuditReportCsv}
                       className="bg-emerald-700 text-white text-xs font-black uppercase px-3 py-1.5 rounded hover:bg-emerald-600 transition shadow-sm"
                     >
                       {L.p.reports.downloadExcel}
                     </button>
                     <button onClick={() => {
                        if(activeSupabase) {
                          activeSupabase.from('audit_logs').select('*').order('timestamp', { ascending: false }).limit(200)
                          .then(({data}) => setGlobalAuditLogs(data || []));
                        }
                     }} className="bg-white border border-slate-300 text-xs font-black uppercase px-3 py-1.5 rounded hover:bg-slate-50 transition shadow-sm">Refrescar 🔄</button>
                   </div>
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
                  <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 mb-6 sm:items-end">
                    <div className="min-w-0 flex-1"><label className="block text-[10px] font-black uppercase text-slate-400 mb-1">Fecha Inicio</label><input type="date" value={reportStartDate} onChange={e => setReportStartDate(e.target.value)} className="w-full min-w-0 p-2 border border-slate-300 rounded-lg font-bold outline-none text-slate-900 bg-white text-sm" /></div>
                    <div className="min-w-0 flex-1"><label className="block text-[10px] font-black uppercase text-slate-400 mb-1">Fecha Fin</label><input type="date" value={reportEndDate} onChange={e => setReportEndDate(e.target.value)} className="w-full min-w-0 p-2 border border-slate-300 rounded-lg font-bold outline-none text-slate-900 bg-white text-sm" /></div>
                    <button
                      type="button"
                      onClick={downloadSalesReportCsv}
                      className="bg-emerald-700 text-white px-4 py-2.5 rounded-lg text-xs font-black uppercase hover:bg-emerald-600 transition shrink-0"
                    >
                      {L.p.reports.downloadExcel}
                    </button>
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
                              <th className="p-4 text-center">Acciones</th>
                           </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                           {dbPatients.flatMap(p => (p.packageHistory || []).map(tx => ({...tx, patientId: p.id, patientName: p.patient})))
                            .sort((a,b) => b.id - a.id).slice(0, 50).map(tx => (
                              <tr key={tx.id} className="hover:bg-slate-50 transition-colors">
                                 <td className="p-4 font-bold text-slate-500 text-xs">
                                    <span className="block">#{tx.ticketNumber || tx.ticket_number || String(tx.id).slice(-6)}</span>
                                    <span className="text-[9px] text-slate-400">{tx.date}</span>
                                 </td>
                                 <td className="p-4 font-black text-slate-800 text-sm uppercase">{tx.patientName}</td>
                                 <td className="p-4">
                                    <p className="font-bold text-blue-600 text-xs uppercase">{tx.serviceName}</p>
                                    <p className="text-[9px] font-black text-slate-400 uppercase mt-0.5">+{tx.sessions} SESIONES A CARTERA</p>
                                 </td>
                                 <td className="p-4 text-right">
                                    <p className="font-black text-emerald-600 text-sm">${tx.price} {currencyStr}</p>
                                    <p className="text-[9px] font-black text-slate-400 uppercase mt-0.5 bg-slate-100 inline-block px-2 py-0.5 rounded">{tx.paymentMethod || 'Tarjeta'}</p>
                                 </td>
                                 <td className="p-4 text-center">
                                   <div className="flex flex-col gap-1 items-center">
                                     <button type="button" onClick={() => {
                                       const pat = dbPatients.find((p) => String(p.id) === String(tx.patientId));
                                       openSaleReceiptModal(tx, tx.patientName, pat?.phone || '');
                                     }} className="bg-slate-100 border border-slate-300 text-slate-700 px-3 py-1.5 rounded-lg text-[9px] font-black uppercase hover:bg-slate-200 transition shadow-sm w-full max-w-[8rem]">
                                       {L.modals.patient.receiptGenerated}
                                     </button>
                                     {currentUserLevel <= 2 && (
                                       <button type="button" onClick={() => handleCancelGlobalTransaction(tx, tx.patientId, tx.patientName)} className="bg-red-50 border border-red-200 text-red-600 px-3 py-1.5 rounded-lg text-[9px] font-black uppercase hover:bg-red-100 transition shadow-sm w-full max-w-[8rem]">
                                         {L.modals.patient.revert}
                                       </button>
                                     )}
                                   </div>
                                 </td>
                              </tr>
                           ))}
                        </tbody>
                     </table>
                  </div>

                </div>
              )
            )}
          </div>
          </StaffTabErrorBoundary>
        )}

        {/* VISTA GFE */}
        {activeTab === 'GFE' && <div className="flex-1 p-3 lg:p-6 overflow-hidden z-10 min-h-0"><GFEManager patients={dbAppointments} onUpdatePatient={() => {}} /></div>}

        {/* VISTA ADMIN */}
        {activeTab === 'Admin' && currentUserLevel <= 2 && (
          <StaffTabErrorBoundary locale={locale} onGoAgenda={() => selectTab('Agenda')}>
          <div className={`${STAFF_TAB_PANEL} bg-white`}>
            <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-6 pb-4 border-b border-slate-200">
              <div>
                <h2 className="text-2xl font-black text-slate-800 uppercase tracking-tight">Ajustes de Clínica</h2>
                <p className="text-[10px] font-bold text-slate-500 uppercase mt-1">
                  {getClinicMeta(activeClinic).regionLabel}
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
                  ✏️ Mensajes
                </button>
              </div>
            </div>

            {adminSubTab === 'mensajes' && (
              <div className="bg-white p-4 sm:p-8 rounded-2xl border border-slate-200 shadow-sm mb-8 space-y-8">
                <div>
                  <h3 className="font-black text-slate-900 text-xl mb-2">
                    {locale === 'en' ? 'Patient messages' : 'Mensajes al paciente'}
                  </h3>
                  <p className="text-sm text-slate-600 leading-relaxed max-w-2xl">
                    {locale === 'en'
                      ? 'Choose when we message, by email and/or SMS. Tap Edit text on a card to change that message right there.'
                      : 'Elige cuándo avisamos, por correo y/o SMS. Toca Editar texto en una tarjeta para cambiar ese mensaje ahí mismo.'}
                  </p>
                </div>

                {/* PASO 1 — Canales */}
                <section className="rounded-2xl border border-slate-200 bg-slate-50 p-4 sm:p-5 space-y-3">
                  <h4 className="text-sm font-black text-slate-900">
                    {locale === 'en' ? 'Step 1 — How do we send?' : 'Paso 1 — ¿Por dónde enviamos?'}
                  </h4>
                  <label className="flex items-start gap-3 bg-white p-3 rounded-xl border border-slate-200 cursor-pointer">
                    <input type="checkbox" checked={dbCompanyConfig.notify_on_booking !== false} onChange={(e) => setDbCompanyConfig({ ...dbCompanyConfig, notify_on_booking: e.target.checked })} className="w-5 h-5 mt-0.5 shrink-0" />
                    <span>
                      <span className="block text-sm font-bold text-slate-900">
                        {locale === 'en' ? 'Automatic messages are ON' : 'Mensajes automáticos ENCENDIDOS'}
                      </span>
                      <span className="block text-xs text-slate-500 mt-0.5">
                        {locale === 'en'
                          ? 'If you turn this off, nothing goes out automatically (you can still send manually from an appointment).'
                          : 'Si lo apagas, no sale nada automático (igual puedes mandar a mano desde una cita).'}
                      </span>
                    </span>
                  </label>
                  <p className="text-xs text-slate-500">
                    {locale === 'en'
                      ? 'Clinic-wide Allow email/SMS are hard stops. Per-situation Correo/SMS are defaults — patient prefs on the chart override them (e.g. SMS still goes out if the patient wants SMS).'
                      : 'Permitir correo/SMS a nivel clínica son cortes duros. Correo/SMS por aviso son valores por defecto: las preferencias del paciente en la ficha mandan (ej. si quiere SMS, llega por SMS).'}
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <label className="flex items-start gap-3 bg-white p-3 rounded-xl border border-slate-200 cursor-pointer">
                      <input type="checkbox" checked={dbCompanyConfig.notify_channel_email !== false} onChange={(e) => setDbCompanyConfig({ ...dbCompanyConfig, notify_channel_email: e.target.checked })} className="w-5 h-5 mt-0.5 shrink-0" />
                      <span>
                        <span className="block text-sm font-bold text-slate-900">{locale === 'en' ? 'Allow email' : 'Permitir correo'}</span>
                        <span className="block text-xs text-slate-500 mt-0.5">
                          {locale === 'en' ? 'If off, no notice can use email.' : 'Si está apagado, ningún aviso puede usar correo.'}
                        </span>
                      </span>
                    </label>
                    <label className="flex items-start gap-3 bg-white p-3 rounded-xl border border-slate-200 cursor-pointer">
                      <input type="checkbox" checked={dbCompanyConfig.notify_channel_sms !== false} onChange={(e) => setDbCompanyConfig({ ...dbCompanyConfig, notify_channel_sms: e.target.checked })} className="w-5 h-5 mt-0.5 shrink-0" />
                      <span>
                        <span className="block text-sm font-bold text-slate-900">{locale === 'en' ? 'Allow SMS' : 'Permitir SMS'}</span>
                        <span className="block text-xs text-slate-500 mt-0.5">
                          {locale === 'en' ? 'If off, no notice can use SMS.' : 'Si está apagado, ningún aviso puede usar SMS.'}
                        </span>
                      </span>
                    </label>
                  </div>
                </section>

                {/* PASO 2 — Cuándo */}
                <section className="space-y-3">
                  <h4 className="text-sm font-black text-slate-900">
                    {locale === 'en' ? 'Step 2 — When do we message?' : 'Paso 2 — ¿Cuándo avisamos?'}
                  </h4>
                  <p className="text-xs text-slate-500">
                    {locale === 'en'
                      ? 'Turn each situation on/off. First visit always uses email + SMS. For the others, set defaults — patient prefs still win for that person.'
                      : 'Enciende o apaga cada situación. Primera visita siempre va por correo + SMS. En las demás, elige defaults — las preferencias del paciente mandan.'}
                  </p>
                  <div className="space-y-3">
                    {messageTypeCards.map((card) => {
                      const on = isMessageTypeOn(card);
                      const emailKey = `notify_use_email_${card.id}`;
                      const smsKey = `notify_use_sms_${card.id}`;
                      const forceBothChannels = card.id === 'first';
                      const useEmail = forceBothChannels ? true : dbCompanyConfig[emailKey] !== false;
                      const useSms = forceBothChannels ? true : dbCompanyConfig[smsKey] !== false;
                      const channels = resolveNotifyChannels(dbCompanyConfig, card.id);
                      const editing = emailTemplateTab === card.id;
                      return (
                        <div
                          key={card.id}
                          id={`msg-card-${card.id}`}
                          className={`rounded-2xl border p-4 ${editing ? 'border-slate-900 bg-white shadow-md' : on ? 'border-emerald-300 bg-emerald-50/60' : 'border-slate-200 bg-slate-50'}`}
                        >
                          <div className="flex flex-col sm:flex-row sm:items-start gap-3">
                            <label className="flex items-start gap-3 flex-1 cursor-pointer min-w-0">
                              <input
                                type="checkbox"
                                checked={on}
                                onChange={(e) => setDbCompanyConfig({ ...dbCompanyConfig, [card.autoKey]: e.target.checked })}
                                className="w-5 h-5 mt-0.5 shrink-0"
                              />
                              <span className="min-w-0">
                                <span className="block text-sm font-black text-slate-900">{card.title}</span>
                                <span className="block text-xs text-slate-600 mt-1 leading-relaxed">{card.when}</span>
                                <span className={`inline-block mt-2 text-[10px] font-black uppercase tracking-wide px-2 py-1 rounded-full ${on ? 'bg-emerald-600 text-white' : 'bg-slate-300 text-slate-700'}`}>
                                  {on
                                    ? (locale === 'en' ? 'Sending' : 'Se envía')
                                    : (locale === 'en' ? 'Off' : 'Apagado')}
                                </span>
                                {on && (
                                  <span className="ml-2 inline-block mt-2 text-[10px] font-bold text-slate-600">
                                    {[
                                      channels.sendEmail ? (locale === 'en' ? 'Email' : 'Correo') : null,
                                      channels.sendSms ? 'SMS' : null,
                                    ].filter(Boolean).join(' + ')
                                      || (locale === 'en' ? 'No channel selected' : 'Sin canal elegido')}
                                  </span>
                                )}
                              </span>
                            </label>
                            <button
                              type="button"
                              onClick={() => {
                                if (editing) {
                                  setEmailTemplateTab('');
                                  return;
                                }
                                setEmailTemplateTab(card.id);
                                window.setTimeout(() => {
                                  document.getElementById(`msg-card-${card.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                                }, 50);
                              }}
                              className={`shrink-0 px-4 py-2.5 rounded-xl text-xs font-black uppercase transition ${
                                editing
                                  ? 'bg-slate-900 text-white'
                                  : 'bg-white border border-slate-300 text-slate-800 hover:bg-slate-100'
                              }`}
                            >
                              {editing
                                ? (locale === 'en' ? 'Hide text' : 'Ocultar texto')
                                : (locale === 'en' ? 'Edit text' : 'Editar texto')}
                            </button>
                          </div>

                          {on && (
                            <div className={`mt-3 pt-3 border-t ${on ? 'border-emerald-200' : 'border-slate-200'}`}>
                              <p className="text-xs font-bold text-slate-700 mb-2">
                                {forceBothChannels
                                  ? (locale === 'en'
                                    ? 'First visit always sends by email and SMS:'
                                    : 'Primera visita siempre se envía por correo y SMS:')
                                  : (locale === 'en' ? 'Send this notice by:' : 'Enviar este aviso por:')}
                              </p>
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                <label className={`flex items-center gap-2 p-3 rounded-xl border ${forceBothChannels ? 'bg-white border-blue-300 opacity-90 cursor-default' : `cursor-pointer ${useEmail ? 'bg-white border-blue-300' : 'bg-slate-100 border-slate-200 opacity-70'}`}`}>
                                  <input
                                    type="checkbox"
                                    checked={useEmail}
                                    disabled={forceBothChannels}
                                    onChange={(e) => setDbCompanyConfig({ ...dbCompanyConfig, [emailKey]: e.target.checked })}
                                    className="w-4 h-4 shrink-0"
                                  />
                                  <span className="text-sm font-bold text-slate-900">{locale === 'en' ? 'Email' : 'Correo'}</span>
                                </label>
                                <label className={`flex items-center gap-2 p-3 rounded-xl border ${forceBothChannels ? 'bg-white border-violet-300 opacity-90 cursor-default' : `cursor-pointer ${useSms ? 'bg-white border-violet-300' : 'bg-slate-100 border-slate-200 opacity-70'}`}`}>
                                  <input
                                    type="checkbox"
                                    checked={useSms}
                                    disabled={forceBothChannels}
                                    onChange={(e) => setDbCompanyConfig({ ...dbCompanyConfig, [smsKey]: e.target.checked })}
                                    className="w-4 h-4 shrink-0"
                                  />
                                  <span className="text-sm font-bold text-slate-900">SMS</span>
                                </label>
                              </div>
                              {forceBothChannels ? (
                                <p className="mt-2 text-xs font-bold text-slate-600">
                                  {locale === 'en'
                                    ? 'Later notices follow Admin defaults and patient prefs.'
                                    : 'Los avisos posteriores siguen Admin y las preferencias del paciente.'}
                                </p>
                              ) : !channels.sendEmail && !channels.sendSms ? (
                                <p className="mt-2 text-xs font-bold text-amber-800">
                                  {locale === 'en'
                                    ? 'Pick at least email or SMS, or turn the notice off.'
                                    : 'Elige al menos correo o SMS, o apaga el aviso.'}
                                </p>
                              ) : null}
                            </div>
                          )}

                          {card.id === 'reminder' && (
                            <div className={`mt-3 pt-3 border-t ${on ? 'border-emerald-200' : 'border-slate-200'}`}>
                              <label className="text-xs font-bold text-slate-700">
                                {locale === 'en' ? 'How many hours before the appointment?' : '¿Cuántas horas antes de la cita?'}
                              </label>
                              <div className="flex items-center gap-2 mt-1">
                                <input
                                  type="number"
                                  min="1"
                                  max="72"
                                  disabled={!on}
                                  value={dbCompanyConfig.reminder_hours ?? 24}
                                  onChange={(e) => setDbCompanyConfig({ ...dbCompanyConfig, reminder_hours: Number(e.target.value) })}
                                  className="w-24 p-2.5 border border-slate-300 rounded-lg font-bold text-slate-900 bg-white disabled:opacity-50"
                                />
                                <span className="text-xs text-slate-500">
                                  {locale === 'en' ? 'hours before (24 is recommended)' : 'horas antes (recomendado: 24)'}
                                </span>
                              </div>
                            </div>
                          )}

                          {editing && (
                            <div className="mt-4 pt-4 border-t border-slate-300 space-y-4">
                              <p className="text-xs font-black uppercase tracking-wide text-slate-500">
                                {locale === 'en' ? 'Message text for this notice' : 'Texto de este aviso'}
                              </p>
                              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                                <div className="space-y-3 rounded-xl border border-slate-200 p-4 bg-slate-50">
                                  <p className="text-sm font-black text-slate-900">
                                    {locale === 'en' ? 'Email' : 'Correo'}
                                  </p>
                                  <div>
                                    <label className="text-xs font-bold text-slate-600">
                                      {locale === 'en' ? 'Subject line' : 'Asunto'}
                                    </label>
                                    <input
                                      type="text"
                                      value={dbCompanyConfig[`notify_subject_${card.id}`] || ''}
                                      onChange={(e) => setDbCompanyConfig({ ...dbCompanyConfig, [`notify_subject_${card.id}`]: e.target.value })}
                                      className="w-full p-3 border border-slate-300 rounded-lg font-bold outline-none text-slate-900 bg-white mt-1"
                                    />
                                  </div>
                                  <div>
                                    <label className="text-xs font-bold text-slate-600">
                                      {locale === 'en' ? 'Message body' : 'Cuerpo del mensaje'}
                                    </label>
                                    <textarea
                                      rows={6}
                                      value={dbCompanyConfig[`notify_body_${card.id}`] || ''}
                                      onChange={(e) => setDbCompanyConfig({ ...dbCompanyConfig, [`notify_body_${card.id}`]: e.target.value })}
                                      className="w-full p-3 border border-slate-300 rounded-lg font-bold outline-none text-slate-900 bg-white mt-1 text-sm leading-relaxed"
                                    />
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setEmailTemplateTab(card.id);
                                      openEmailPreview();
                                    }}
                                    className="px-4 py-2.5 bg-white border border-slate-300 text-slate-800 font-black text-xs uppercase rounded-lg hover:bg-slate-100 transition"
                                  >
                                    {locale === 'en' ? 'Preview email' : 'Ver cómo se ve el correo'}
                                  </button>
                                </div>

                                <div className="space-y-3 rounded-xl border border-violet-200 p-4 bg-violet-50/50">
                                  <p className="text-sm font-black text-slate-900">SMS</p>
                                  <div className="rounded-lg border border-violet-200 bg-white p-3 space-y-2">
                                    <p className="text-[10px] font-black uppercase text-violet-800">
                                      {locale === 'en' ? '1) Greeting you edit' : '1) Saludo que tú editas'}
                                    </p>
                                    <p className="text-xs text-slate-600 leading-relaxed">
                                      {locale === 'en'
                                        ? 'Usually just {{nombre}} and {{clinica}}. Keep it short.'
                                        : 'Normalmente solo {{nombre}} y {{clinica}}. Manténlo corto.'}
                                    </p>
                                    <textarea
                                      rows={3}
                                      value={dbCompanyConfig[`notify_sms_${card.id}`] || ''}
                                      onChange={(e) => setDbCompanyConfig({ ...dbCompanyConfig, [`notify_sms_${card.id}`]: e.target.value })}
                                      className="w-full p-3 border border-violet-200 rounded-lg font-bold outline-none text-slate-900 bg-violet-50/40 text-sm leading-relaxed"
                                      placeholder={locale === 'en' ? 'Hi {{nombre}}, reminder of your appointment at {{clinica}}.' : 'Hola {{nombre}}, recordatorio de tu cita en {{clinica}}.'}
                                    />
                                  </div>
                                  <div className="rounded-lg border border-dashed border-violet-300 bg-violet-100/40 p-3">
                                    <p className="text-[10px] font-black uppercase text-violet-900 mb-1">
                                      {locale === 'en' ? '2) Added automatically (not editable here)' : '2) Se agrega solo (no se edita aquí)'}
                                    </p>
                                    <p className="text-xs text-violet-900/90 leading-relaxed">
                                      {locale === 'en'
                                        ? 'Date · time · service · location · map link · clinic phone'
                                        : 'Fecha · hora · servicio · ubicación · liga del mapa · teléfono de la clínica'}
                                    </p>
                                  </div>
                                  <div className="rounded-lg border border-slate-300 bg-slate-900 p-3">
                                    <p className="text-[10px] font-black uppercase text-slate-400 mb-2">
                                      {locale === 'en' ? 'Full SMS that will be sent' : 'SMS completo que se enviará'}
                                    </p>
                                    <p className="text-xs font-medium text-slate-100 leading-relaxed whitespace-pre-wrap">
                                      {buildNotifyPreviewForType(card.id).smsBody}
                                    </p>
                                  </div>
                                </div>
                              </div>

                              {card.id === 'first' && (
                                <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 space-y-3">
                                  <h5 className="text-sm font-black text-amber-950">
                                    {locale === 'en' ? 'Only for first visits — session tips' : 'Solo en primera visita — indicaciones de sesión'}
                                  </h5>
                                  <div>
                                    <label className="text-xs font-bold text-amber-900">{locale === 'en' ? 'Section title' : 'Título'}</label>
                                    <input
                                      type="text"
                                      value={dbCompanyConfig.notify_session_label || ''}
                                      onChange={(e) => setDbCompanyConfig({ ...dbCompanyConfig, notify_session_label: e.target.value })}
                                      className="w-full p-3 border border-amber-200 rounded-lg font-bold outline-none text-slate-900 bg-white mt-1"
                                    />
                                  </div>
                                  <div>
                                    <label className="text-xs font-bold text-amber-900">
                                      {locale === 'en' ? 'Full tips (email)' : 'Indicaciones completas (correo)'}
                                    </label>
                                    <textarea
                                      rows={3}
                                      value={dbCompanyConfig.notify_session_default || ''}
                                      onChange={(e) => setDbCompanyConfig({ ...dbCompanyConfig, notify_session_default: e.target.value })}
                                      className="w-full p-3 border border-amber-200 rounded-lg font-bold outline-none text-slate-900 bg-white mt-1 text-sm leading-relaxed"
                                    />
                                  </div>
                                  <div>
                                    <label className="text-xs font-bold text-amber-900">
                                      {locale === 'en' ? 'Link for SMS' : 'Liga para el SMS'}
                                    </label>
                                    <input
                                      type="url"
                                      value={dbCompanyConfig.notify_session_url || ''}
                                      onChange={(e) => setDbCompanyConfig({ ...dbCompanyConfig, notify_session_url: e.target.value.trim() })}
                                      className="w-full p-3 border border-amber-200 rounded-lg font-bold outline-none text-slate-900 bg-white mt-1 text-sm"
                                    />
                                  </div>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </section>

                {/* Info compartida */}
                <section className="rounded-2xl border border-slate-200 p-4 sm:p-5 space-y-2">
                  <h4 className="text-sm font-black text-slate-900">
                    {locale === 'en' ? 'Extra note on every email' : 'Nota extra en todos los correos'}
                  </h4>
                  <p className="text-xs text-slate-500">
                    {locale === 'en'
                      ? 'Parking, what to bring, maps — shown on all email types.'
                      : 'Estacionamiento, qué traer, mapas — aparece en todos los tipos de correo.'}
                  </p>
                  <textarea
                    rows={4}
                    value={dbCompanyConfig.notify_extra_info || ''}
                    onChange={(e) => setDbCompanyConfig({ ...dbCompanyConfig, notify_extra_info: e.target.value })}
                    className="w-full p-3 border border-slate-300 rounded-lg font-bold outline-none text-slate-900 bg-white text-sm leading-relaxed"
                    placeholder={locale === 'en' ? 'Free parking. Wear comfortable clothes.' : 'Estacionamiento gratuito. Traer ropa cómoda.'}
                  />
                </section>

                {isShenandoah(activeClinic) && (
                  <section className="rounded-2xl border border-blue-200 bg-blue-50 p-4 sm:p-5 space-y-3">
                    <h4 className="text-sm font-black text-blue-950">
                      {locale === 'en' ? 'Houston only — YES/NO confirmation SMS' : 'Solo Houston — SMS de confirmación SI/NO'}
                    </h4>
                    <p className="text-xs text-blue-900/90 leading-relaxed">
                      {locale === 'en'
                        ? 'Separate from the messages above. Asks first-session patients to reply YES or NO before the visit.'
                        : 'Es aparte de los mensajes de arriba. Pide a pacientes de primera sesión que respondan SI o NO antes de la visita.'}
                    </p>
                    <label className="flex items-start gap-3 bg-white p-3 rounded-xl border border-blue-200 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={dbCompanyConfig.confirmation_sms_enabled === true}
                        onChange={(e) => setDbCompanyConfig({ ...dbCompanyConfig, confirmation_sms_enabled: e.target.checked })}
                        className="w-5 h-5 mt-0.5 shrink-0"
                      />
                      <span className="text-sm font-bold text-blue-950">
                        {locale === 'en' ? 'Ask for YES/NO before first sessions' : 'Pedir SI/NO antes de primeras sesiones'}
                      </span>
                    </label>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs font-bold text-blue-900">
                          {locale === 'en' ? 'Hours before visit' : 'Horas antes de la visita'}
                        </label>
                        <input type="number" min="1" max="24" value={dbCompanyConfig.confirmation_hours_before ?? 6} onChange={(e) => setDbCompanyConfig({ ...dbCompanyConfig, confirmation_hours_before: Number(e.target.value) })} className="w-full p-2.5 border border-blue-200 rounded-lg font-bold text-sm bg-white mt-1" />
                      </div>
                      <div>
                        <label className="text-xs font-bold text-blue-900">
                          {locale === 'en' ? 'Alert staff if no reply (hours)' : 'Avisar al staff si no responde (horas)'}
                        </label>
                        <input type="number" min="1" max="6" value={dbCompanyConfig.confirmation_no_reply_hours ?? 1} onChange={(e) => setDbCompanyConfig({ ...dbCompanyConfig, confirmation_no_reply_hours: Number(e.target.value) })} className="w-full p-2.5 border border-blue-200 rounded-lg font-bold text-sm bg-white mt-1" />
                      </div>
                    </div>
                  </section>
                )}

                {/* Alertas al equipo */}
                <section className="rounded-2xl border border-indigo-200 bg-indigo-50 p-4 sm:p-5 space-y-3">
                  <h4 className="text-sm font-black text-indigo-950">
                    {locale === 'en' ? 'Staff alerts (not the patient)' : 'Avisos al equipo (no al paciente)'}
                  </h4>
                  <p className="text-xs text-indigo-900/90 leading-relaxed">
                    {locale === 'en'
                      ? 'Optional for new bookings (checkbox below). Online cancel requests always alert these phones/emails — the appointment stays on the calendar until staff approves.'
                      : 'Opcional para citas nuevas (casilla abajo). Las cancelaciones en línea siempre avisan a estos teléfonos/correos — la cita sigue en agenda hasta que el staff apruebe.'}
                  </p>
                  <label className="flex items-start gap-3 bg-white p-3 rounded-xl border border-indigo-200 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={dbCompanyConfig.notify_staff_on_booking === true}
                      onChange={(e) => setDbCompanyConfig({ ...dbCompanyConfig, notify_staff_on_booking: e.target.checked })}
                      className="w-5 h-5 mt-0.5 shrink-0"
                    />
                    <span className="text-sm font-bold text-indigo-950">
                      {locale === 'en' ? 'Alert the team on new bookings' : 'Avisar al equipo cuando hay cita nueva'}
                    </span>
                  </label>
                  <label className={`flex items-start gap-3 bg-white p-3 rounded-xl border border-indigo-200 cursor-pointer ${dbCompanyConfig.notify_staff_on_booking !== true ? 'opacity-50' : ''}`}>
                    <input
                      type="checkbox"
                      disabled={dbCompanyConfig.notify_staff_on_booking !== true}
                      checked={dbCompanyConfig.staff_alert_first_sessions_only === true}
                      onChange={(e) => setDbCompanyConfig({ ...dbCompanyConfig, staff_alert_first_sessions_only: e.target.checked })}
                      className="w-5 h-5 mt-0.5 shrink-0"
                    />
                    <span className="text-sm font-bold text-indigo-950">
                      {locale === 'en' ? 'Only for first visits' : 'Solo en primeras visitas'}
                    </span>
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-bold text-indigo-900">
                        {locale === 'en' ? 'Clinic phones (SMS)' : 'Teléfonos de la clínica (SMS)'}
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
                      <label className="text-xs font-bold text-indigo-900">
                        {locale === 'en' ? 'Team emails' : 'Correos del equipo'}
                      </label>
                      <textarea
                        rows={2}
                        value={dbCompanyConfig.staff_alert_emails || ''}
                        onChange={(e) => setDbCompanyConfig({ ...dbCompanyConfig, staff_alert_emails: e.target.value })}
                        placeholder="recepcion@oxygengdl.com"
                        className="w-full p-2.5 border border-indigo-200 rounded-lg font-bold text-sm outline-none bg-white mt-1"
                      />
                    </div>
                  </div>
                </section>

                <button
                  type="button"
                  onClick={async () => {
                    try {
                      await saveCompanyConfig();
                    } catch (e) {
                      alert(a('configSaveError', e.message));
                    }
                  }}
                  className="w-full sm:w-auto sm:min-w-[280px] bg-emerald-600 text-white font-black py-4 px-8 rounded-xl uppercase shadow-lg hover:bg-emerald-700 transition"
                >
                  {locale === 'en' ? 'Save messages' : 'Guardar mensajes'}
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
                    <label className="text-[10px] font-black text-slate-400 uppercase ml-1">Link Google Maps (opcional)</label>
                    <input type="url" value={dbCompanyConfig.maps_url || ''} onChange={e => setDbCompanyConfig({...dbCompanyConfig, maps_url: e.target.value.trim()})} placeholder="https://maps.google.com/..." className="w-full p-2.5 border rounded-lg font-bold outline-none text-slate-900 bg-white text-sm" />
                    <p className="text-[9px] font-bold text-slate-400 mt-1">Si lo dejas vacío, se genera automáticamente desde la dirección. Se usa en correos y SMS.</p>
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
                    <label className="text-[10px] font-black text-slate-400 uppercase ml-1">{L.p.admin.weeklyDefaultOpen}</label>
                    <input type="time" value={normalizeTimeInput(dbCompanyConfig.start_time) || '07:00'} onChange={e => setDbCompanyConfig({...dbCompanyConfig, start_time: e.target.value})} className="w-full p-2.5 border rounded-lg font-bold outline-none text-slate-900 bg-white" />
                  </div>
                  <div>
                    <label className="text-[10px] font-black text-slate-400 uppercase ml-1">{L.p.admin.weeklyDefaultClose}</label>
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

                <h3 className="font-black text-slate-800 uppercase text-sm mb-2 pb-2 border-b mt-2">{L.p.admin.weeklyScheduleTitle}</h3>
                <p className="text-[10px] font-bold text-slate-500 mb-3 leading-relaxed">{L.p.admin.weeklyScheduleHint}</p>
                <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm mb-6">
                  <div className="hidden sm:grid grid-cols-[1fr_auto_auto_9rem_9rem] gap-2 px-4 py-2 bg-slate-50 border-b border-slate-100 text-[9px] font-black text-slate-400 uppercase">
                    <span>{L.p.admin.weeklyDayCol}</span>
                    <span className="text-center">{L.p.admin.weeklyOpenCol}</span>
                    <span className="text-center">{L.p.admin.weeklyCustomCol}</span>
                    <span>{L.p.admin.weeklyStartCol}</span>
                    <span>{L.p.admin.weeklyEndCol}</span>
                  </div>
                  {WEEKDAY_KEYS.map((key) => {
                    const schedule = normalizeWeeklySchedule(dbCompanyConfig.weekly_schedule, {
                      start_time: normalizeTimeInput(dbCompanyConfig.start_time) || '07:00',
                      end_time: normalizeTimeInput(dbCompanyConfig.end_time) || '20:00',
                    });
                    const day = schedule[key];
                    return (
                      <div key={key} className="grid grid-cols-1 sm:grid-cols-[1fr_auto_auto_9rem_9rem] gap-2 sm:gap-3 items-center px-4 py-3 border-b border-slate-100 last:border-b-0">
                        <span className="text-xs font-black text-slate-800 uppercase">{weekdayLabels[key]}</span>
                        <label className="flex items-center justify-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={day.open !== false}
                            onChange={(e) => updateWeeklyDay(key, { open: e.target.checked })}
                            className="w-4 h-4"
                          />
                          <span className="text-[10px] font-bold text-slate-600 uppercase sm:hidden">{L.p.admin.weeklyOpenCol}</span>
                        </label>
                        <label className={`flex items-center justify-center gap-2 cursor-pointer ${!day.open ? 'opacity-40 pointer-events-none' : ''}`}>
                          <input
                            type="checkbox"
                            checked={day.custom_hours === true}
                            onChange={(e) => updateWeeklyDay(key, { custom_hours: e.target.checked })}
                            className="w-4 h-4"
                            disabled={!day.open}
                          />
                          <span className="text-[10px] font-bold text-slate-600 uppercase sm:hidden">{L.p.admin.weeklyCustomCol}</span>
                        </label>
                        <input
                          type="time"
                          disabled={!day.open || !day.custom_hours}
                          value={normalizeTimeInput(day.start_time) || normalizeTimeInput(dbCompanyConfig.start_time) || '07:00'}
                          onChange={(e) => updateWeeklyDay(key, { start_time: e.target.value, custom_hours: true })}
                          className="w-full p-2 border rounded-lg font-bold text-sm text-slate-900 bg-white disabled:bg-slate-100 disabled:text-slate-400"
                        />
                        <input
                          type="time"
                          disabled={!day.open || !day.custom_hours}
                          value={normalizeTimeInput(day.end_time) || normalizeTimeInput(dbCompanyConfig.end_time) || '20:00'}
                          onChange={(e) => updateWeeklyDay(key, { end_time: e.target.value, custom_hours: true })}
                          className="w-full p-2 border rounded-lg font-bold text-sm text-slate-900 bg-white disabled:bg-slate-100 disabled:text-slate-400"
                        />
                      </div>
                    );
                  })}
                </div>

                <h3 className="font-black text-slate-800 uppercase text-sm mb-2 pb-2 border-b mt-6">{L.p.admin.calendarFeedTitle}</h3>
                <p className="text-[10px] font-bold text-slate-500 mb-2 leading-relaxed">{L.p.admin.calendarFeedHint}</p>
                <p className="text-[10px] font-bold text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-3 leading-relaxed">{L.p.admin.calendarFeedLiveNote}</p>
                <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3 shadow-sm">
                  <label className="flex items-start gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={dbCompanyConfig.calendar_feed_enabled === true}
                      onChange={(e) => {
                        const enabled = e.target.checked;
                        setDbCompanyConfig((prev) => ({
                          ...prev,
                          calendar_feed_enabled: enabled,
                          calendar_feed_token: enabled && !prev.calendar_feed_token
                            ? generateCalendarFeedToken()
                            : prev.calendar_feed_token,
                        }));
                      }}
                      className="w-4 h-4 mt-0.5"
                    />
                    <span className="text-xs font-black uppercase text-slate-700">{L.p.admin.calendarFeedEnable}</span>
                  </label>

                  {dbCompanyConfig.calendar_feed_enabled && (
                    <div className="space-y-3 pt-2 border-t border-slate-100">
                      {calendarFeedUrl ? (
                        <>
                          <div>
                            <label className="block text-[10px] font-black text-slate-400 uppercase mb-1">{L.p.admin.calendarFeedClinicUrl}</label>
                            <input
                              type="text"
                              readOnly
                              value={calendarFeedUrl}
                              className="w-full p-2.5 border rounded-lg font-mono text-[10px] text-slate-700 bg-slate-50"
                            />
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              onClick={() => copyCalendarFeedUrl(false)}
                              className="bg-emerald-600 text-white text-[10px] font-black uppercase px-3 py-2 rounded-lg hover:bg-emerald-700"
                            >
                              {L.p.admin.calendarFeedCopy}
                            </button>
                            <button
                              type="button"
                              onClick={() => copyCalendarFeedUrl(true)}
                              className="bg-slate-700 text-white text-[10px] font-black uppercase px-3 py-2 rounded-lg hover:bg-slate-800"
                            >
                              {L.p.admin.calendarFeedCopyWebcal}
                            </button>
                            <button
                              type="button"
                              onClick={openGoogleCalendarSubscribe}
                              className="bg-blue-600 text-white text-[10px] font-black uppercase px-3 py-2 rounded-lg hover:bg-blue-700"
                            >
                              {L.p.admin.calendarFeedOpenGoogle}
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                if (!window.confirm(L.p.admin.calendarFeedRegenerateConfirm)) return;
                                setDbCompanyConfig((prev) => ({
                                  ...prev,
                                  calendar_feed_token: generateCalendarFeedToken(),
                                }));
                              }}
                              className="bg-amber-100 text-amber-800 border border-amber-200 text-[10px] font-black uppercase px-3 py-2 rounded-lg hover:bg-amber-200"
                            >
                              {L.p.admin.calendarFeedRegenerate}
                            </button>
                          </div>
                          <div className="bg-blue-50 border border-blue-100 rounded-lg p-3 text-[10px] font-bold text-blue-900 space-y-1">
                            <p className="font-black uppercase">{L.p.admin.calendarFeedStepsTitle}</p>
                            <p>1. {L.p.admin.calendarFeedStep1}</p>
                            <p>2. {L.p.admin.calendarFeedStep2}</p>
                            <p>3. {L.p.admin.calendarFeedStep3}</p>
                            <p>4. {L.p.admin.calendarFeedStep4}</p>
                          </div>
                        </>
                      ) : (
                        <p className="text-[10px] font-bold text-amber-700 uppercase">{L.p.admin.calendarFeedSaveFirst}</p>
                      )}
                    </div>
                  )}
                </div>

                <h3 className="font-black text-slate-800 uppercase text-sm mb-2 pb-2 border-b mt-6">{L.p.admin.googleCalendarLiveTitle}</h3>
                <p className="text-[10px] font-bold text-slate-500 mb-3 leading-relaxed">{L.p.admin.googleCalendarLiveHint}</p>
                <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 space-y-3 shadow-sm mb-6">
                  {!googleCalendarApiStatus.configured && (
                    <p className="text-[10px] font-bold text-amber-800 bg-amber-100 border border-amber-200 rounded-lg px-3 py-2">
                      {L.p.admin.googleCalendarNotConfigured}
                    </p>
                  )}
                  {googleCalendarApiStatus.sqlRequired && (
                    <p className="text-[10px] font-bold text-amber-800 bg-amber-100 border border-amber-200 rounded-lg px-3 py-2">
                      {L.p.admin.googleCalendarSqlRequired}
                    </p>
                  )}
                  {googleCalendarApiStatus.connected && googleCalendarApiStatus.email && (
                    <p className="text-[10px] font-black text-emerald-800 uppercase">
                      {L.p.admin.googleCalendarConnectedAs(googleCalendarApiStatus.email)}
                    </p>
                  )}
                  <div className="flex flex-wrap gap-2">
                    {googleCalendarApiStatus.connected ? (
                      <>
                        <label className="flex items-center gap-2 bg-white px-3 py-2 rounded-lg border border-emerald-200 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={dbCompanyConfig.google_calendar_enabled === true}
                            onChange={(e) => setDbCompanyConfig({ ...dbCompanyConfig, google_calendar_enabled: e.target.checked })}
                            className="w-4 h-4"
                          />
                          <span className="text-[10px] font-black uppercase text-emerald-900">{L.p.admin.googleCalendarSyncEnable}</span>
                        </label>
                        <button
                          type="button"
                          onClick={bulkSyncGoogleCalendar}
                          className="bg-emerald-600 text-white text-[10px] font-black uppercase px-3 py-2 rounded-lg hover:bg-emerald-700"
                        >
                          {L.p.admin.googleCalendarBulkSync}
                        </button>
                        <button
                          type="button"
                          onClick={disconnectGoogleCalendar}
                          className="bg-white text-red-700 border border-red-200 text-[10px] font-black uppercase px-3 py-2 rounded-lg hover:bg-red-50"
                        >
                          {L.p.admin.googleCalendarDisconnect}
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        disabled={!googleCalendarApiStatus.configured || googleCalendarApiStatus.sqlRequired}
                        onClick={connectGoogleCalendar}
                        className="bg-emerald-600 text-white text-[10px] font-black uppercase px-4 py-2.5 rounded-lg hover:bg-emerald-700 disabled:opacity-50"
                      >
                        {L.p.admin.googleCalendarConnect}
                      </button>
                    )}
                  </div>
                  <p className="text-[9px] font-bold text-emerald-800/80 leading-relaxed">
                    {locale === 'en'
                      ? 'After connecting, save Admin settings if you toggled sync. New appointments sync automatically.'
                      : 'Tras conectar, guarda Ajustes si activaste la sincronización. Las citas nuevas se sincronizan solas.'}
                  </p>
                </div>

                {/* ACCESO A NOTIFICACIONES (todo se configura en su propia pestaña) */}
                <h3 className="font-black text-slate-800 uppercase text-sm mb-3 pb-2 border-b mt-6">
                  {locale === 'en' ? 'Patient messages' : 'Mensajes al paciente'}
                </h3>
                <div className="w-full mb-6 p-4 rounded-xl border border-emerald-200 bg-emerald-50">
                  <p className="text-sm font-bold text-emerald-900 mb-1">
                    {locale === 'en' ? 'When we message & what we say' : 'Cuándo avisamos y qué decimos'}
                  </p>
                  <p className="text-xs text-emerald-800 mb-3 leading-relaxed">
                    {locale === 'en'
                      ? 'New booking, time change, cancel, reminder — each one has an on/off switch and its own text.'
                      : 'Cita nueva, cambio de horario, cancelación, recordatorio — cada uno tiene su interruptor y su propio texto.'}
                  </p>
                  <button
                    type="button"
                    onClick={() => setAdminSubTab('mensajes')}
                    className="w-full sm:w-auto px-5 py-3 rounded-xl bg-emerald-600 text-white text-[11px] font-black uppercase shadow hover:bg-emerald-700 transition"
                  >
                    {locale === 'en' ? 'Open messages' : 'Abrir mensajes'}
                  </button>
                </div>

                {currentUserLevel <= 1 && (
                  <DemoOccupancyPanel clinicName={activeClinic} locale={locale} />
                )}
                <details className="mb-6 text-[10px] font-bold text-slate-500">
                  <summary className="cursor-pointer uppercase text-slate-400 font-black">Configuración técnica (Vercel / Resend / Twilio / SMS MX)</summary>
                  <p className="mt-2 leading-relaxed pl-2 border-l-2 border-slate-200">
                    Un solo deploy: oxy-agenda.vercel.app. Diagnóstico: /api/health/notify
                    Correo: RESEND_* · USA SMS: TWILIO_* + TWILIO_MESSAGING_SERVICE_SID (A2P) · MX SMS: LABSMOBILE_*
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
                        <input type="checkbox" checked={newUser.notify_on_booking === true} onChange={e => setNewUser({ ...newUser, notify_on_booking: e.target.checked })} className="w-4 h-4" />
                        <span className="text-[10px] font-black uppercase text-indigo-900">{L.p.admin.staffNotifyBooking}</span>
                      </label>
                      <select className="w-full p-2.5 border rounded-lg font-bold uppercase outline-none text-slate-900 bg-white" value={newUser.role} onChange={e => setNewUser({...newUser, role: e.target.value})}>
                        {(dbRoles || []).map(r => <option key={r.id} value={r.name}>{r.name} (Nivel {r.level})</option>)}
                      </select>
                      <input type="text" placeholder="Certificación (Ej. IBUM, D.O.)" className="w-full p-2.5 border rounded-lg font-bold uppercase outline-none text-slate-900 bg-white" value={newUser.cert} onChange={e => setNewUser({...newUser, cert: e.target.value})} />
                      <input type="text" placeholder="PIN Personal (6 Dígitos)" maxLength="6" className="w-full p-2.5 border border-slate-300 rounded-lg font-bold outline-none tracking-widest text-slate-900 bg-white" value={newUser.pin || ''} onChange={e => setNewUser({...newUser, pin: e.target.value})} />
                      <div className="flex gap-2">
                        {isEditingUser && <button onClick={() => {setIsEditingUser(false); setNewUser({ id: null, name: '', email: '', phone: '', notify_on_booking: false, role: dbRoles[0]?.name || '', cert: '', is_active: true, pin: '' });}} className="w-1/3 bg-slate-300 text-slate-700 font-black py-3 rounded-xl uppercase text-xs">Cancelar</button>}
                        <button onClick={async () => {
                          if (!newUser.name) return alert(L.p.admin.userName);
                          if (!newUser.pin || newUser.pin.length !== 6) return alert(L.p.admin.pinSix);
                          const email = (newUser.email || '').trim();
                          if (!email) return alert(L.p.admin.staffEmailRequired);
                          const staffPayload = {
                            name: newUser.name,
                            role: newUser.role,
                            cert: newUser.cert,
                            is_active: newUser.is_active,
                            pin: newUser.pin,
                            notify_on_booking: newUser.notify_on_booking === true,
                            email,
                          };
                          const phone = (newUser.phone || '').trim();
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
                            if (!res.error && (phone || newUser.notify_on_booking === true)) {
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
                          setNewUser({ id: null, name: '', email: '', phone: '', notify_on_booking: false, role: dbRoles[0]?.name || '', cert: '', is_active: true, pin: '' }); 
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
                <p className="text-[10px] font-black text-blue-600 mt-1 uppercase">{activeClinicDisplayName}</p>
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
                      <div>
                        <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">{L.p.admin.promoterEmail}</label>
                        <p className="text-[9px] font-bold text-slate-400 mb-1">{L.p.admin.promoterEmailHint}</p>
                        <input
                          type="email"
                          value={newPromoter.email || ''}
                          onChange={(e) => setNewPromoter({ ...newPromoter, email: e.target.value })}
                          placeholder={L.p.admin.promoterEmailPh}
                          className="w-full p-3 rounded-xl border border-slate-300 font-bold text-sm outline-none focus:border-blue-500 text-slate-900 bg-white"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">{L.p.admin.promoterNotes}</label>
                        <p className="text-[9px] font-bold text-slate-400 mb-1">{L.p.admin.promoterNotesHint}</p>
                        <textarea
                          value={newPromoter.notes || ''}
                          onChange={(e) => setNewPromoter({ ...newPromoter, notes: e.target.value })}
                          placeholder={L.p.admin.promoterNotesPh}
                          rows={3}
                          className="w-full p-3 rounded-xl border border-slate-300 font-medium text-sm outline-none focus:border-blue-500 text-slate-900 bg-white resize-y min-h-[72px]"
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
                            onClick={() => { setIsEditingPromoter(false); setNewPromoter({ id: null, code: '', name: '', email: '', notes: '', is_active: true }); }}
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
                            <th className="px-4 py-3">{L.p.admin.promoterEmail}</th>
                            <th className="px-4 py-3">{L.p.admin.promoterNotes}</th>
                            <th className="px-4 py-3">{L.p.admin.promoterLink}</th>
                            <th className="px-4 py-3">{L.p.admin.promoterCalendarLink}</th>
                            <th className="px-4 py-3 text-right">{L.p.common.edit}</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {(dbPromoters || []).map((pr) => (
                            <tr key={pr.id} className={`hover:bg-slate-50/80 ${!pr.is_active ? 'opacity-50' : ''}`}>
                              <td className="px-4 py-3 font-black text-slate-800 text-xs tracking-wider">{pr.code}</td>
                              <td className="px-4 py-3 font-bold text-slate-700 text-xs">{pr.name}</td>
                              <td className="px-4 py-3 text-xs text-slate-600 max-w-[10rem] truncate">{pr.email || '—'}</td>
                              <td className="px-4 py-3 text-xs text-slate-600 max-w-[12rem]">
                                <span className="line-clamp-2 whitespace-pre-wrap">{pr.notes || '—'}</span>
                              </td>
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
                                {dbCompanyConfig.calendar_feed_enabled ? (
                                  <div className="flex flex-col gap-1 items-start">
                                    <button
                                      type="button"
                                      onClick={() => copyPromoterCalendarFeed(pr)}
                                      disabled={!pr.calendar_feed_token}
                                      className="text-[9px] font-black uppercase text-emerald-700 hover:text-emerald-900 bg-emerald-50 px-2 py-1 rounded border border-emerald-100 disabled:opacity-40"
                                    >
                                      {L.p.admin.promoterCalendarCopy}
                                    </button>
                                    {pr.calendar_feed_token ? (
                                      <button
                                        type="button"
                                        onClick={() => regeneratePromoterCalendarToken(pr)}
                                        className="text-[9px] font-black uppercase text-amber-700 hover:text-amber-900 bg-amber-50 px-2 py-1 rounded border border-amber-100"
                                      >
                                        {L.p.admin.promoterCalendarRegenerate}
                                      </button>
                                    ) : (
                                      <button
                                        type="button"
                                        onClick={() => regeneratePromoterCalendarToken(pr)}
                                        className="text-[9px] font-black uppercase text-slate-600 hover:text-slate-800 bg-slate-50 px-2 py-1 rounded border border-slate-200"
                                      >
                                        {L.p.admin.promoterCalendarGenerate}
                                      </button>
                                    )}
                                  </div>
                                ) : (
                                  <span className="text-[9px] font-bold text-slate-400 uppercase">—</span>
                                )}
                              </td>
                              <td className="px-4 py-3">
                                <div className="flex justify-end gap-1 flex-wrap">
                                  <button
                                    type="button"
                                    onClick={() => { setNewPromoter({ ...pr, notes: pr.notes || '', email: pr.email || '' }); setIsEditingPromoter(true); }}
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
                              <td colSpan="6" className="px-4 py-10 text-center text-slate-400 font-bold uppercase text-xs">
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
          </StaffTabErrorBoundary>
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
                <span className="block text-[10px] font-bold text-slate-500 mt-1 uppercase">{selectedSlot.equipment} · {selectedSlot.time} · {formatAppointmentDateWithWeekday(selectedSlot.full_date || selectedSlot.fullDate)}</span>
              </div>
              {!isAssessmentService(selectedSlot.equipment) ? (
              <label className="flex items-start gap-3 bg-amber-50 border border-amber-200 p-4 rounded-xl cursor-pointer">
                <input type="checkbox" checked={cancelDeductSession} onChange={e => setCancelDeductSession(e.target.checked)} className="w-4 h-4 mt-0.5" />
                <span className="text-xs font-black uppercase text-amber-900">{L.p.appt.cancelDeductSession}</span>
              </label>
              ) : (
                <p className="text-[10px] font-bold text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-xl p-3 normal-case">
                  {L.modals.bitacora.assessmentDetail}
                </p>
              )}
              <div className="flex gap-2 pt-2">
                <button disabled={isSavingAppointment} onClick={() => { setShowCancelModal(false); setCancelDeductSession(false); }} className="flex-1 bg-white border border-slate-300 font-black py-3 rounded-xl uppercase text-xs hover:bg-slate-50 disabled:opacity-50">{L.p.common.cancel}</button>
                <button disabled={isSavingAppointment} onClick={handleCancelAppointment} className="flex-1 bg-red-600 text-white font-black py-3 rounded-xl uppercase text-xs hover:bg-red-700 shadow-md disabled:opacity-50">{isSavingAppointment ? L.p.common.working : L.p.appt.cancelConfirm}</button>
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
                  <h3 className="font-black text-lg uppercase text-slate-800">{L.p.audit.modalTitle}</h3>
                  <button onClick={() => setShowAudit(false)} className="text-slate-400 hover:text-slate-800 text-2xl font-black transition">&times;</button>
               </div>
               <div className="p-4 sm:p-8 overflow-y-auto flex-1 space-y-3 min-h-0">
                  {auditLogs.map(log => (
                     <div key={log.id} className="text-xs p-4 bg-slate-50 border border-slate-200 rounded-xl shadow-sm">
                        <span className="font-black text-blue-600 bg-blue-50 px-2 py-0.5 rounded">{new Date(log.timestamp).toLocaleString()}</span>
                        <div className="mt-2 text-slate-800">
                           <span className="font-black">{log.action}</span> {L.p.print.operatedBy} <span className="font-bold uppercase bg-slate-200 px-1 rounded">{log.changed_by}</span>
                        </div>
                        <p className="text-slate-500 mt-1 font-mono text-[10px]">{log.details}</p>
                     </div>
                  ))}
                  {auditLogs.length === 0 && <p className="text-sm text-slate-400 font-bold text-center py-6">{L.p.audit.noRecords}</p>}
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
          <div className={`appt-detail-panel fixed inset-0 sm:inset-y-0 sm:left-auto sm:right-0 h-[100dvh] max-h-[100dvh] w-full sm:max-w-md bg-white shadow-2xl flex flex-col overflow-hidden sm:border-l border-slate-200 text-slate-900 ${isRescheduling ? 'z-[9999]' : 'z-[9999]'}`}>
            <div className="bg-slate-50 px-4 sm:px-8 py-3 sm:py-4 border-b flex justify-between items-center shrink-0 gap-3">
              <div className="min-w-0 flex-1">
                <h3 className="text-lg font-black text-slate-800 uppercase tracking-tight truncate">
                  {isRescheduling ? L.p.appt.reschedule : L.p.appt.detail}
                </h3>
                {isShenandoah(activeClinic) && (
                  <p className="text-[8px] font-bold text-sky-600 uppercase mt-0.5">build {buildSha}</p>
                )}
                {isRescheduling && (
                  <p className="text-[9px] font-bold text-blue-600 uppercase mt-1">{L.p.appt.rescheduleHint}</p>
                )}
              </div>
              <button
                type="button"
                onClick={closeAppointmentPanel}
                aria-label={locale === 'en' ? 'Close' : 'Cerrar'}
                className="appt-detail-close text-slate-500 hover:text-slate-900 hover:bg-slate-200 text-3xl font-black transition shrink-0 leading-none"
              >
                &times;
              </button>
            </div>
            
            <div className="p-4 sm:p-8 overflow-y-auto flex-1 space-y-4 sm:space-y-5 min-h-0">
              {isCancelRequestPending(selectedSlot.check_in_status) && !isRescheduling && (
                <div className="rounded-2xl border-2 border-amber-400 bg-amber-50 p-4 space-y-3">
                  <div>
                    <p className="text-sm font-black uppercase text-amber-950 tracking-tight">
                      {L.p.appt.cancelPendingTitle}
                    </p>
                    <p className="text-xs text-amber-900/80 mt-1 leading-relaxed">
                      {selectedSlot.confirmation_status === CONFIRMATION_STATUS.DECLINED
                        ? L.p.appt.cancelPendingSmsNoHint
                        : L.p.appt.cancelPendingHint}
                    </p>
                  </div>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <button
                      type="button"
                      onClick={handleApproveCancelRequest}
                      className="flex-1 bg-red-600 text-white px-3 py-2.5 rounded-xl text-[10px] font-black uppercase hover:bg-red-700 transition"
                    >
                      {L.p.appt.cancelPendingApprove}
                    </button>
                    <button
                      type="button"
                      onClick={handleRejectCancelRequest}
                      className="flex-1 bg-white border border-amber-300 text-amber-950 px-3 py-2.5 rounded-xl text-[10px] font-black uppercase hover:bg-amber-100 transition"
                    >
                      {L.p.appt.cancelPendingReject}
                    </button>
                  </div>
                </div>
              )}
              <div className="flex flex-wrap gap-2 mb-2">
                 {!isRescheduling && !['Finalizado', 'Devuelto', 'Cancelado', CANCEL_REQUEST_STATUS].includes(selectedSlot.check_in_status) && (
                   <>
                     <button
                       onClick={() => updateAppStatus(selectedSlot.id, 'Llegó', selectedSlot.patient, selectedSlot.equipment)}
                       className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase transition ${selectedSlot.check_in_status === 'Llegó' ? 'bg-amber-500 text-white ring-2 ring-amber-300' : 'bg-amber-100 text-amber-700 hover:bg-amber-200'}`}
                     >
                       {L.p.appt.arrived}
                     </button>
                     <button
                       onClick={() => updateAppStatus(selectedSlot.id, 'En Sesión', selectedSlot.patient, selectedSlot.equipment)}
                       className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase transition ${selectedSlot.check_in_status === 'En Sesión' ? 'bg-emerald-600 text-white ring-2 ring-emerald-300' : 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'}`}
                     >
                       {L.p.appt.inSession}
                     </button>
                     <button
                       onClick={() => updateAppStatus(selectedSlot.id, 'No Asistió', selectedSlot.patient, selectedSlot.equipment)}
                       className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase transition ${selectedSlot.check_in_status === 'No Asistió' ? 'bg-red-600 text-white ring-2 ring-red-300' : 'bg-red-100 text-red-700 hover:bg-red-200'}`}
                     >
                       {L.p.appt.noShow}
                     </button>
                     <button
                       onClick={() => updateAppStatus(selectedSlot.id, 'Falta Justificada', selectedSlot.patient, selectedSlot.equipment)}
                       className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase transition ${selectedSlot.check_in_status === 'Falta Justificada' ? 'bg-orange-500 text-white ring-2 ring-orange-300' : 'bg-orange-100 text-orange-700 hover:bg-orange-200'}`}
                     >
                       {L.p.appt.excused}
                     </button>
                   </>
                 )}
                 {!isRescheduling && selectedSlot.check_in_status === 'No Asistió' && (
                   <>
                     <button
                       type="button"
                       onClick={() => restoreNoShowSession(selectedSlot)}
                       className="bg-sky-100 text-sky-800 px-3 py-1.5 rounded-lg text-[9px] font-black uppercase hover:bg-sky-200 transition border border-sky-200"
                     >
                       {L.p.appt.undoNoShow}
                     </button>
                     <button
                       type="button"
                       onClick={() => excuseNoShow(selectedSlot)}
                       className="bg-orange-100 text-orange-800 px-3 py-1.5 rounded-lg text-[9px] font-black uppercase hover:bg-orange-200 transition border border-orange-200"
                     >
                       {L.p.appt.excuseNoShow}
                     </button>
                   </>
                 )}
                 
                 {selectedSlot.check_in_status !== 'Finalizado' && selectedSlot.check_in_status !== 'Devuelto' && selectedSlot.check_in_status !== 'Cancelado' && !isCancelRequestPending(selectedSlot.check_in_status) && !isRescheduling && (
                     <button onClick={() => { setCancelDeductSession(false); setShowCancelModal(true); }} className="bg-red-100 text-red-700 px-3 py-1.5 rounded-lg text-[9px] font-black uppercase hover:bg-red-200 transition ml-auto border border-red-200">{L.p.appt.cancelAppt}</button>
                 )}
              </div>
              
              <div className="bg-white border border-slate-300 rounded-xl p-4 shadow-sm flex flex-col relative overflow-hidden">
                <span className="font-black text-slate-800 text-lg uppercase pr-6">{selectedSlot.is_new_patient ? '⭐ ' : ''}{selectedSlot.patient}</span>
                <span className="text-[10px] text-blue-600 font-black uppercase tracking-widest">{selectedSlot.protocol}</span>

                {isShenandoah(activeClinic) && selectedSlotConfirmationInfo ? (
                  <div className={`mt-3 rounded-xl border-2 p-3 space-y-2 ${
                    selectedSlot.confirmation_status && selectedSlot.confirmation_status !== CONFIRMATION_STATUS.NONE
                      ? confirmationStatusClass(selectedSlot.confirmation_status)
                      : 'bg-sky-50 text-sky-900 border-sky-400'
                  }`}>
                    <p className="text-[10px] font-black uppercase flex flex-wrap items-center gap-1.5">
                      <span aria-hidden>📱</span>
                      <span>{locale === 'en' ? 'Houston SMS confirmation (YES/NO)' : 'Houston · Confirmación SMS (SI / NO)'}</span>
                      {selectedSlot.confirmation_status && selectedSlot.confirmation_status !== CONFIRMATION_STATUS.NONE ? (
                        <span className="inline-flex items-center rounded-full bg-white/80 border px-2 py-0.5 text-[9px] font-black uppercase">
                          {confirmationStatusLabel(selectedSlot.confirmation_status, locale)}
                        </span>
                      ) : (
                        <span className="inline-flex items-center rounded-full bg-white/80 border border-sky-300 px-2 py-0.5 text-[9px] font-black uppercase text-sky-800">
                          {locale === 'en' ? 'Not sent yet' : 'Aún no enviado'}
                        </span>
                      )}
                    </p>
                    <p className="text-[10px] font-bold normal-case leading-relaxed">
                      {locale === 'en' ? selectedSlotConfirmationInfo.summaryEn : selectedSlotConfirmationInfo.summaryEs}
                    </p>
                    {selectedSlot.confirmation_status === CONFIRMATION_STATUS.PENDING ? (
                      <p className="text-[10px] font-black uppercase text-slate-700 bg-white/70 border border-slate-200 rounded-lg px-2 py-1.5">
                        {locale === 'en'
                          ? 'Waiting for patient reply: YES to confirm · NO to cancel'
                          : 'Esperando respuesta del paciente: SI para confirmar · NO para cancelar'}
                      </p>
                    ) : null}
                    {selectedSlot.confirmation_reply && (
                      <p className="text-xs font-bold normal-case">
                        {locale === 'en' ? 'Reply:' : 'Respuesta:'} &quot;{selectedSlot.confirmation_reply}&quot;
                        {selectedSlot.confirmation_replied_at && (
                          <span className="text-[10px] font-bold opacity-80 block mt-0.5">
                            {new Date(selectedSlot.confirmation_replied_at).toLocaleString(locale === 'en' ? 'en-US' : 'es-MX')}
                          </span>
                        )}
                      </p>
                    )}
                    {selectedSlot.confirmation_sent_at && (
                      <p className="text-[9px] font-bold opacity-80 normal-case">
                        {locale === 'en' ? 'Sent' : 'Enviado'}: {new Date(selectedSlot.confirmation_sent_at).toLocaleString(locale === 'en' ? 'en-US' : 'es-MX')}
                      </p>
                    )}
                    {selectedSlotConfirmationInfo.canSendManually && !isRescheduling ? (
                      <button
                        type="button"
                        onClick={handleSendConfirmationNow}
                        disabled={confirmationSending}
                        className="w-full mt-1 bg-sky-600 text-white py-2.5 rounded-xl font-black uppercase text-[10px] hover:bg-sky-700 transition disabled:opacity-60"
                      >
                        {confirmationSending
                          ? (locale === 'en' ? 'Sending…' : 'Enviando…')
                          : (locale === 'en' ? 'Send confirmation SMS now' : 'Enviar confirmación SMS ahora')}
                      </button>
                    ) : null}
                  </div>
                ) : null}

                <div className="mt-3 bg-violet-50 border border-violet-200 p-3 rounded-xl">
                  <p className="text-[10px] font-black uppercase text-violet-800">{L.p.appt.promoterSection}</p>
                  <select
                    value={selectedSlot.promoter_code || ''}
                    onChange={(e) => setSelectedSlot({ ...selectedSlot, promoter_code: normalizePromoCode(e.target.value) })}
                    className="w-full mt-2 p-2 border border-violet-200 rounded-lg text-xs font-bold bg-white text-violet-900"
                  >
                    <option value="">{L.p.appt.promoterSelect}</option>
                    {dbPromoters.filter((p) => p.is_active !== false).map((p) => (
                      <option key={p.id} value={normalizePromoCode(p.code)}>{p.name} ({p.code})</option>
                    ))}
                  </select>
                  <input
                    type="text"
                    value={selectedSlot.promoter_code || ''}
                    onChange={(e) => setSelectedSlot({ ...selectedSlot, promoter_code: normalizePromoCode(e.target.value) })}
                    placeholder={L.p.appt.promoterCodeManual}
                    className="w-full mt-2 p-2 border border-violet-200 rounded-lg text-xs font-bold uppercase bg-white text-violet-900"
                  />
                  {selectedPromoterContext ? (
                    <>
                      <p className="text-xs font-bold text-violet-900 mt-2">
                        {selectedPromoterContext.name
                          ? `${selectedPromoterContext.name} (${selectedPromoterContext.code})`
                          : selectedPromoterContext.code}
                      </p>
                      {selectedPromoterContext.notes ? (
                        <p className="text-xs text-violet-800 mt-2 whitespace-pre-wrap leading-relaxed">{selectedPromoterContext.notes}</p>
                      ) : (
                        <p className="text-[9px] font-bold text-violet-500 mt-1 uppercase">{L.p.appt.promoterNoNotes}</p>
                      )}
                      {!selectedPromoterContext.recognized && (
                        <p className="text-[9px] font-bold text-amber-700 mt-1 uppercase">{L.p.appt.promoterUnregistered}</p>
                      )}
                    </>
                  ) : null}
                </div>

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

                <PatientSessionHistory
                  className="mt-3"
                  appointments={dbAppointments}
                  patientName={selectedSlot.patient}
                  patientId={selectedSlot.patientId || dbPatients.find((p) => normalizeStr(p.patient) === normalizeStr(selectedSlot.patient))?.id}
                  maxHeightClass="max-h-44"
                />
                
                <div className="mt-4 space-y-3">
                   <div className="bg-amber-50 border border-amber-200 p-3 rounded-xl">
                      <label className="text-[10px] font-black uppercase text-amber-800 flex items-center gap-1 mb-1">{L.p.appt.notePermanent}</label>
                      <textarea 
                        value={selectedSlot.patientNotes || ''} 
                        onChange={e => {
                          slotNotesDirtyRef.current = true;
                          setSelectedSlot({...selectedSlot, patientNotes: e.target.value});
                        }}
                        className="w-full p-2 border border-amber-200 rounded-lg text-xs font-bold outline-none bg-white text-amber-900"
                        rows="2" placeholder={L.p.appt.notePermanentPh}
                      />
                   </div>
                   <div className="bg-blue-50 border border-blue-200 p-3 rounded-xl">
                      <label className="text-[10px] font-black uppercase text-blue-800 flex items-center gap-1 mb-1">{L.p.appt.noteToday}</label>
                      <textarea 
                        value={selectedSlot.notes || ''} 
                        onChange={e => {
                          slotNotesDirtyRef.current = true;
                          setSelectedSlot({...selectedSlot, notes: e.target.value});
                        }}
                        className="w-full p-2 border border-blue-200 rounded-lg text-xs font-bold outline-none bg-white text-blue-900"
                        rows="2" placeholder={L.p.appt.noteTodayPh}
                      />
                   </div>
                   <button
                     disabled={isSavingAppointment}
                     onClick={async () => {
                      await runBusyAction({
                        workingTitle: L.p.common.savingNotes,
                        workingDetail: L.p.common.pleaseWait,
                        successTitle: L.p.common.notesSavedOk,
                        autoCloseMs: 1000,
                        action: async () => {
                          const contactResult = await persistPatientContactFromSlot(selectedSlot);
                          if (contactResult.error) {
                            return { error: staffAlert(locale, 'patientFileError', contactResult.error.message) };
                          }

                          const savedPhone = contactResult.phone || selectedSlot.phone || '';
                          const savedEmail = contactResult.email || selectedSlot.email || '';
                          const savedPatientId = contactResult.patientId || selectedSlot.patientId;

                          const apptRes = await updateAppointmentNotesAndContact(activeSupabase, selectedSlot.id, {
                            notes: selectedSlot.notes,
                            phone: savedPhone,
                            email: savedEmail,
                            promoter_code: normalizePromoCode(selectedSlot.promoter_code) || null,
                          });
                          if (apptRes.error) return { error: apptRes.error.message || a('notesSaveError') };

                          if (savedPatientId) {
                            setDbPatients((prev) => prev.map((p) => (
                              String(p.id) === String(savedPatientId)
                                ? {
                                  ...p,
                                  phone: savedPhone,
                                  email: savedEmail,
                                  notes: selectedSlot.patientNotes ?? p.notes,
                                  prefers_email: selectedSlot.prefers_email !== false,
                                  prefers_sms: selectedSlot.prefers_sms !== false,
                                }
                                : p
                            )));
                          }
                          setDbAppointments((prev) => prev.map((a) => (
                            a.id === selectedSlot.id
                              ? { ...a, phone: savedPhone, email: savedEmail, notes: selectedSlot.notes }
                              : a
                          )));
                          setSelectedSlot((prev) => ({
                            ...prev,
                            phone: savedPhone,
                            email: savedEmail,
                            patientId: savedPatientId || prev.patientId,
                            patientNotes: selectedSlot.patientNotes ?? prev.patientNotes,
                          }));

                          slotNotesDirtyRef.current = false;
                          await notifyCalendarChanged();
                          return {};
                        },
                      });
                   }} className="w-full bg-slate-800 text-white font-black py-2 rounded-lg text-[10px] uppercase hover:bg-slate-700 shadow-sm transition disabled:opacity-50">{isSavingAppointment ? L.p.common.working : L.p.appt.saveNotesAndContact}</button>
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
                          <p className="mt-1 text-[10px] font-black uppercase text-blue-800">
                            {formatAppointmentDateWithWeekday(selectedSlot.fullDate || selectedSlot.full_date)}
                          </p>
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
                      <span className="text-base font-black text-slate-700 block">
                        {formatAppointmentDateWithWeekday(selectedSlot.full_date || selectedSlot.fullDate)}
                      </span>
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
                        {calculateEndTime(selectedSlot.time, (Number(selectedSlot.duration) || 60) + (Number(selectedSlot.buffer) || 0))}
                        <span className="text-[9px] font-bold text-slate-400 ml-1">
                          ({Number(selectedSlot.duration) || 60}m sesión · bloque {(Number(selectedSlot.duration) || 60) + (Number(selectedSlot.buffer) || 0)} min)
                        </span>
                      </span>
                    </div>
                  </>
                )}
              </div>

              {!isRescheduling && (
              <>
              <div className="bg-blue-50 border border-blue-200 p-5 rounded-2xl shadow-sm space-y-3">
                  {selectedSlot.sessionGroup?.name && (
                    <p className="text-[9px] font-black uppercase text-violet-800 bg-violet-100 border border-violet-200 rounded-lg px-2 py-1.5">
                      👥 {selectedSlot.sessionGroup.name} · {L.modals.bitacora.sharedLabel}
                    </p>
                  )}
                  <div className="flex justify-between items-center bg-white p-3 rounded-xl border border-blue-100">
                    <span className="text-xs font-black text-slate-500 uppercase">
                      {selectedSlotSessionSummary?.isAssessment
                        ? L.modals.bitacora.assessmentHeadline
                        : selectedSlotSessionSummary?.isDebtor
                          ? L.modals.bitacora.debtHeadline(selectedSlotSessionSummary.adeudo)
                          : L.p.appt.sessionsPaidSummary(selectedSlotSessionSummary?.used || 0, selectedSlotSessionSummary?.totalPurchased || 0)}
                    </span>
                    <span className="text-sm font-black text-slate-800 bg-slate-100 px-2 rounded">{selectedSlot.historicoSesiones || 0}</span>
                  </div>
                  {selectedSlotSessionSummary?.isAssessment ? (
                    <p className="text-[10px] font-bold text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2 normal-case">
                      {L.modals.bitacora.assessmentDetail}
                    </p>
                  ) : (
                  <>
                  <div className={`p-3 rounded-lg flex justify-between items-center text-white shadow-sm ${selectedSlotWalletBalance ? 'bg-emerald-600' : 'bg-red-600'}`}>
                    <span className="text-xs font-black uppercase">{L.p.appt.pendingForEquipment(selectedSlot.equipment)}</span>
                    <span className="text-lg font-black">
                      {selectedSlotSessionSummary?.pendingForService ?? 0}
                    </span>
                  </div>
                  {(selectedSlotSessionSummary?.adeudo || 0) > 0 && (
                    <div className="p-3 rounded-lg flex justify-between items-center bg-orange-500 text-white shadow-sm border border-orange-600">
                      <span className="text-xs font-black uppercase">{L.p.appt.adeudoLabel}</span>
                      <span className="text-lg font-black">{selectedSlotSessionSummary.adeudo}</span>
                    </div>
                  )}
                  {!selectedSlotWalletBalance && (selectedSlotSessionSummary?.adeudo || 0) === 0 && selectedSlot.check_in_status !== 'Finalizado' && (
                    <p className="text-[9px] font-bold text-amber-700 uppercase bg-amber-50 border border-amber-200 rounded-lg px-2 py-1.5">
                      ⚠️ {L.p.appt.noBalanceBitacora}
                    </p>
                  )}
                  </>
                  )}
              </div>

              <div className="pt-4 pb-2 border-t text-slate-900">
                 <label className="block text-[10px] font-black uppercase text-slate-400 mb-1">{L.p.appt.bitacoraAttendantLabel}</label>
                 {selectedSlot.check_in_status === 'Finalizado' ? (
                    <p className="font-bold text-slate-700 uppercase p-3 bg-slate-50 rounded-xl border border-slate-200 text-sm">{selectedSlot.attendant || 'N/A'}</p>
                 ) : (
                    <select value={selectedSlot.attendant || ''} onChange={(e) => setSelectedSlot({...selectedSlot, attendant: e.target.value})} className="w-full p-3 border border-slate-300 rounded-xl font-bold uppercase outline-none focus:border-blue-500 text-sm bg-white text-slate-900">
                      <option value="">{L.p.appt.selectStaff}</option>
                      {currentUser?.name && !dbUsers.some((u) => u.is_active && u.name === currentUser.name) && (
                        <option value={currentUser.name}>{currentUser.name}</option>
                      )}
                      {dbUsers.filter(u => u.is_active).map(u => <option key={u.id} value={u.name}>{u.name}</option>)}
                    </select>
                 )}
              </div>

              <div className="flex gap-3 flex-wrap">
                <button onClick={() => setShowPatientProfile(true)} className="flex-1 bg-slate-100 text-slate-700 py-4 rounded-2xl font-black uppercase text-[10px] hover:bg-slate-200 transition">{L.p.appt.openChart}</button>
                {selectedSlot.check_in_status === 'Finalizado' ? (
                   <div className="flex-1 bg-emerald-100 text-emerald-800 py-4 rounded-2xl font-black uppercase text-[10px] flex items-center justify-center text-center border border-emerald-300">{L.p.appt.bitacoraSealed}</div>
                ) : ['No Asistió', 'Falta Justificada', 'Cancelado', 'Devuelto'].includes(selectedSlot.check_in_status) ? (
                   <div className="flex-1 bg-slate-100 text-slate-600 py-4 rounded-2xl font-black uppercase text-[10px] flex items-center justify-center text-center border border-slate-200">
                     {locale === 'en' ? 'Attendance seal for completed visits only' : 'Bitácora solo para visitas atendidas'}
                   </div>
                ) : (
                   <button onClick={() => {
                      if(!selectedSlot.attendant || selectedSlot.attendant === 'Por Asignar') return alert(a('selectAttendant'));
                      setShowBitacora(true);
                   }} className="flex-1 bg-blue-600 text-white py-4 rounded-2xl font-black uppercase text-[10px] shadow-lg hover:bg-blue-700 transition">{L.p.appt.bitacoraOpen}</button>
                )}
                <button onClick={() => printPatientBitacora(selectedSlot.patient)} className="w-full bg-slate-800 text-white py-3 rounded-2xl font-black uppercase text-[10px] hover:bg-slate-700 transition mt-2">{L.p.appt.printSignatureHistory}</button>
              </div>
              
              <button onClick={() => loadAuditLogs(selectedSlot.id)} className="w-full text-slate-400 py-2 rounded-2xl font-black uppercase text-[9px] hover:text-slate-600 transition mt-1 underline">{L.p.appt.viewAudit}</button>

              <button
                type="button"
                onClick={() => notifyPatientFromSlot(selectedSlot, { showSuccess: true })}
                className="w-full bg-indigo-50 text-indigo-800 border border-indigo-200 py-3 rounded-2xl font-black uppercase text-[10px] hover:bg-indigo-100 transition mt-2"
              >
                {L.p.appt.sendInstructions}
              </button>

              <div className="mt-3 p-3 rounded-2xl border border-violet-200 bg-violet-50 space-y-2">
                <p className="text-[10px] font-black uppercase text-violet-900">
                  {locale === 'en' ? 'Send SMS to patient' : 'Enviar SMS al paciente'}
                </p>
                <p className="text-[9px] font-bold text-violet-800/90 leading-relaxed">
                  {locale === 'en'
                    ? 'Uses clinic-branded transactional templates (STOP footer). Keep custom notes short and appointment-related to stay carrier-compliant.'
                    : 'Usa plantillas transaccionales con nombre de la clínica (incluye STOP). Mantén notas cortas y relacionadas con la cita para cumplir políticas de carriers.'}
                </p>
                <select
                  value={staffSmsPreset}
                  onChange={(e) => setStaffSmsPreset(e.target.value)}
                  className="w-full p-2.5 border border-violet-200 rounded-xl font-bold text-xs bg-white text-slate-900"
                >
                  <option value="waiting">{locale === 'en' ? 'Waiting / has not arrived' : 'Esperando / no ha llegado'}</option>
                  <option value="reminder">{locale === 'en' ? 'Appointment reminder' : 'Recordatorio de cita'}</option>
                  <option value="custom">{locale === 'en' ? 'Short custom note' : 'Nota corta personalizada'}</option>
                </select>
                {staffSmsPreset === 'custom' && (
                  <textarea
                    rows={2}
                    maxLength={120}
                    value={staffSmsNote}
                    onChange={(e) => setStaffSmsNote(e.target.value)}
                    placeholder={locale === 'en' ? 'Short note (max 120 chars)' : 'Nota corta (máx. 120 caracteres)'}
                    className="w-full p-2.5 border border-violet-200 rounded-xl font-bold text-xs bg-white text-slate-900"
                  />
                )}
                <button
                  type="button"
                  disabled={staffSmsSending}
                  onClick={handleSendStaffSms}
                  className="w-full bg-violet-700 text-white py-3 rounded-2xl font-black uppercase text-[10px] hover:bg-violet-800 transition disabled:opacity-60"
                >
                  {staffSmsSending
                    ? (locale === 'en' ? 'Sending…' : 'Enviando…')
                    : (locale === 'en' ? '📱 Send SMS now' : '📱 Enviar SMS ahora')}
                </button>
              </div>
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
                  blockedBadge={locale === 'en' ? 'Patient blocked' : 'Paciente bloqueado'}
                  className="w-full p-3 border border-slate-300 rounded-xl font-bold uppercase outline-none focus:border-emerald-500 text-slate-900 bg-white mt-1"
                  onQueryChange={(pName) => {
                    const exact = dbPatients.find(x => normalizeStr(x.patient) === normalizeStr(pName));
                    setSelectedSlot((prev) => ({
                      ...(prev || createEmptyAppointmentDraft()),
                      patient: pName,
                      patientId: exact?.id || null,
                      phone: exact ? exact.phone : (prev?.phone || ''),
                      email: exact ? exact.email : (prev?.email || ''),
                      protocol: exact ? exact.protocol : (prev?.protocol || ''),
                      patientNotes: exact ? exact.notes : (prev?.patientNotes || ''),
                      prefers_email: exact ? exact.prefers_email !== false : prev?.prefers_email !== false,
                      prefers_sms: exact ? exact.prefers_sms !== false : prev?.prefers_sms !== false,
                      is_blocked: exact ? !!exact.is_blocked : false,
                    }));
                  }}
                  onSelectPatient={(p) => {
                    setSelectedSlot((prev) => ({
                      ...(prev || createEmptyAppointmentDraft()),
                      patient: p.patient,
                      patientId: p.id,
                      phone: p.phone || '',
                      email: p.email || '',
                      protocol: p.protocol || '',
                      patientNotes: p.notes || '',
                      prefers_email: p.prefers_email !== false,
                      prefers_sms: p.prefers_sms !== false,
                      is_blocked: !!p.is_blocked,
                    }));
                    if (p.is_blocked) {
                      alert(staffAlert(locale, 'patientBlocked'));
                    }
                  }}
                />
              </div>
              {newAppointmentPatientBlocked ? (
                  <div className="rounded-xl border-2 border-red-400 bg-red-50 px-3 py-2.5">
                    <p className="text-[10px] font-black uppercase text-red-800">
                      🚫 {locale === 'en' ? 'Patient blocked' : 'Paciente bloqueado'}
                    </p>
                    <p className="text-[9px] font-bold text-red-700 mt-1 normal-case leading-snug">
                      {locale === 'en'
                        ? 'You can open the chart, but you cannot book appointments for this patient.'
                        : 'Puedes consultar el expediente, pero no se puede programar una cita para este paciente.'}
                    </p>
                  </div>
                ) : null}
              {(() => {
                const last10 = digitsOnly(selectedSlot?.phone).slice(-10);
                if (last10.length !== 10) return null;
                const existing = dbPatients.find((p) => digitsOnly(p.phone).slice(-10) === last10);
                if (!existing) return null;
                if (normalizeStr(existing.patient) === normalizeStr(selectedSlot?.patient)) return null;
                return (
                  <div className="rounded-xl border-2 border-amber-400 bg-amber-50 px-3 py-2.5">
                    <p className="text-[10px] font-black uppercase text-amber-950">
                      {locale === 'en' ? 'Phone already registered' : 'Teléfono ya registrado'}
                    </p>
                    <p className="text-[9px] font-bold text-amber-900 mt-1 normal-case leading-snug">
                      {locale === 'en'
                        ? `«${existing.patient}» already has this number. On save you’ll choose: use that patient, or register another with the same phone.`
                        : `Ya tenemos a «${existing.patient}» con este número. Al guardar podrás: usar ese paciente, o dar de alta a otro con el mismo teléfono.`}
                    </p>
                  </div>
                );
              })()}
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
                      <input type="tel" value={selectedSlot?.phone || ''} onChange={e => setSelectedSlot({...selectedSlot, phone: e.target.value})} className="w-full p-2 border border-slate-200 rounded-lg font-bold text-xs outline-none text-slate-900 bg-white mt-0.5" />
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
              {selectedSlot?.patient?.trim() ? (
                <div className="rounded-xl border border-violet-200 bg-violet-50 p-3 space-y-2">
                  <p className="text-[10px] font-black uppercase text-violet-800">{L.p.appt.promoterOptional}</p>
                  <select
                    value={dbPromoters.some((p) => normalizePromoCode(p.code) === normalizePromoCode(selectedSlot?.promoter_code)) ? normalizePromoCode(selectedSlot?.promoter_code) : ''}
                    onChange={(e) => setSelectedSlot({ ...selectedSlot, promoter_code: e.target.value })}
                    className="w-full p-2 border border-violet-200 rounded-lg text-xs font-bold bg-white text-violet-900"
                  >
                    <option value="">{L.p.appt.promoterSelect}</option>
                    {dbPromoters.filter((p) => p.is_active !== false).map((p) => (
                      <option key={p.id} value={normalizePromoCode(p.code)}>{p.name} ({p.code})</option>
                    ))}
                  </select>
                  <input
                    type="text"
                    value={selectedSlot?.promoter_code || ''}
                    onChange={(e) => setSelectedSlot({ ...selectedSlot, promoter_code: normalizePromoCode(e.target.value) })}
                    placeholder={L.p.appt.promoterCodeManual}
                    className="w-full p-2 border border-violet-200 rounded-lg text-xs font-bold uppercase bg-white text-violet-900"
                  />
                  {selectedPromoterContext && (
                    <div className="rounded-lg border border-violet-300 bg-white p-2">
                      <p className="text-[9px] font-black uppercase text-violet-700">{L.p.appt.promoterSection}</p>
                      <p className="text-xs font-bold text-violet-900 mt-1">
                        {selectedPromoterContext.name
                          ? `${selectedPromoterContext.name} (${selectedPromoterContext.code})`
                          : selectedPromoterContext.code}
                      </p>
                      {selectedPromoterContext.notes ? (
                        <p className="text-xs text-violet-800 mt-2 whitespace-pre-wrap leading-relaxed">{selectedPromoterContext.notes}</p>
                      ) : (
                        <p className="text-[9px] font-bold text-violet-500 mt-1 uppercase">{L.p.appt.promoterNoNotes}</p>
                      )}
                      {!selectedPromoterContext.recognized && (
                        <p className="text-[9px] font-bold text-amber-700 mt-1 uppercase">{L.p.appt.promoterUnregistered}</p>
                      )}
                    </div>
                  )}
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
                  if (srv) {
                    setSelectedSlot((prev) => {
                      const base = prev || createEmptyAppointmentDraft();
                      if (base.extended_session) {
                        return { ...base, serviceId: sid, equipment: srv.name, time: '' };
                      }
                      const dur = Number(srv.duration) || 60;
                      const buf = Number(srv.buffer ?? 30);
                      return {
                        ...base,
                        serviceId: sid,
                        equipment: srv.name,
                        duration: dur,
                        buffer: buf,
                        sessionPreset: getPresetFromTimes(dur, buf).id,
                        time: '',
                      };
                    });
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
                onOutsideHoursChange={(checked) => setSelectedSlot((prev) => applyOutsideHours(prev, checked))}
                onExtendedChange={(checked) => setSelectedSlot((prev) => applyExtendedSession(prev, checked))}
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
                  <p className="mt-1 text-[10px] font-black uppercase text-emerald-800">
                    {formatAppointmentDateWithWeekday(selectedSlot?.fullDate || currentFullDate)}
                  </p>
                </div>
                <div className="min-w-0">
                  <label className="text-[10px] font-black uppercase text-slate-400">Hora</label>
                  <select value={selectedSlot?.time || ''} onChange={e => { 
                    setSelectedSlot((prev) => ({
                      ...(prev || createEmptyAppointmentDraft()),
                      time: e.target.value,
                    }));
                  }} className="w-full min-w-0 p-2.5 sm:p-3 border rounded-xl font-bold outline-none text-slate-900 bg-white text-sm">
                    <option value="">Hora...</option>
                    {appointmentTimeOptions.map(t => <option key={t} value={t}>{t}</option>)}
                    {appointmentTimeOptions.length === 0 && <option value="" disabled>Sin horario para este equipo</option>}
                  </select>
                </div>
              </div>

              {!selectedSlot?.id ? (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50/80 p-3 space-y-3">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={repeatBooking.enabled}
                      onChange={(e) => {
                        const enabled = e.target.checked;
                        const baseDate = selectedSlot?.fullDate || selectedSlot?.full_date || currentFullDate;
                        let dates = [];
                        if (enabled && baseDate && selectedSlot?.time) {
                          const status = getRepeatDateStatusForSlot(baseDate);
                          if (status.selectable) dates = [baseDate];
                        }
                        setRepeatBooking({ enabled, dates });
                      }}
                      className="w-4 h-4 shrink-0"
                    />
                    <span className="text-[10px] font-black uppercase text-emerald-900">{L.p.appt.repeatEnable}</span>
                  </label>
                  {repeatBooking.enabled ? (
                    <>
                      {!selectedSlot?.time ? (
                        <p className="text-[9px] font-bold text-amber-700 uppercase border border-amber-200 bg-amber-50 rounded-lg px-2 py-2">
                          {L.p.appt.repeatPickTimeFirst}
                        </p>
                      ) : null}
                      <RepeatDatesCalendar
                        selectedDates={repeatBooking.dates}
                        onChange={(dates) => setRepeatBooking((prev) => ({ ...prev, dates }))}
                        anchorDate={selectedSlot?.fullDate || selectedSlot?.full_date || currentFullDate}
                        primaryDate={selectedSlot?.fullDate || selectedSlot?.full_date || currentFullDate}
                        locale={locale}
                        getDateStatus={getRepeatDateStatusForSlot}
                        labels={{
                          calendarHint: L.p.appt.repeatCalendarHint,
                          selectedCount: L.p.appt.repeatSelectedCount,
                          clearSelection: L.p.appt.repeatClear,
                          prevMonth: L.p.appt.repeatPrevMonth,
                          nextMonth: L.p.appt.repeatNextMonth,
                          dayClosed: L.p.appt.repeatDayClosed,
                          dayOccupied: L.p.appt.repeatDayOccupied,
                          dayBlocked: L.p.appt.repeatDayBlocked,
                          dayOutsideHours: L.p.appt.repeatDayOutsideHours,
                          dayUnavailable: L.p.appt.repeatDayUnavailable,
                          legendSelected: L.p.appt.repeatLegendSelected,
                        }}
                      />
                    </>
                  ) : null}
                </div>
              ) : null}
            </div>

            <div className="bg-slate-50 px-4 sm:px-8 py-3 sm:py-5 border-t shrink-0 flex flex-col sm:flex-row gap-2 sm:gap-3 text-slate-900">
              {newAppointmentMissing.length > 0 ? (
                <p className="w-full text-[10px] font-bold text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 sm:col-span-2">
                  {staffAlert(locale, 'missingAppointmentFields', newAppointmentMissing)}
                </p>
              ) : null}
              <button
                onClick={() => { setShowNewAppointment(false); setSelectedSlot(null); }}
                disabled={isSavingAppointment}
                className="w-full sm:w-1/3 bg-white border border-slate-300 font-black py-3 sm:py-4 rounded-xl uppercase text-xs hover:bg-slate-50 transition disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => handleSaveNewAppointment()}
                disabled={isSavingAppointment || newAppointmentMissing.length > 0 || newAppointmentPatientBlocked}
                className="w-full sm:flex-1 bg-emerald-600 text-white font-black py-3 sm:py-4 rounded-xl uppercase text-xs shadow-lg hover:bg-emerald-700 transition disabled:opacity-60"
              >
                {isSavingAppointment ? L.p.appt.creatingTitle : L.p.appt.scheduleSlot}
              </button>
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
                <input type="text" value={newPatientData.phone} onChange={e => setNewPatientData({...newPatientData, phone: e.target.value})} className="w-full p-3 border rounded-xl font-bold text-sm outline-none focus:border-emerald-500 text-slate-900 bg-white" />
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
              <button
                disabled={isSavingAppointment}
                onClick={async () => {
                const trimmedName = newPatientData.name.trim();
                if (!trimmedName) return alert(a('nameRequired'));
                await runBusyAction({
                  workingTitle: L.p.common.savingPatient,
                  workingDetail: L.p.common.pleaseWait,
                  successTitle: L.p.common.patientSavedOk,
                  autoCloseMs: 1000,
                  onDone: () => {
                    setShowNewPatientModal(false);
                    setNewPatientData({ name: '', phone: '', email: '', protocol: 'Wellness', notes: '', prefers_email: true, prefers_sms: true });
                  },
                  action: async () => {
                    const result = await savePatientToDB(activeSupabase, {
                      name: trimmedName,
                      phone: newPatientData.phone.trim(),
                      email: newPatientData.email.trim(),
                      protocol: newPatientData.protocol,
                      notes: newPatientData.notes,
                      prefers_email: newPatientData.prefers_email,
                      prefers_sms: newPatientData.prefers_sms,
                    });
                    if (result.cancelled || result.error?.message === 'CANCELADO') {
                      return { cancelled: true };
                    }
                    if (result.error && result.error.message === 'CLON_DETECTADO') return { error: a('cloneDetected') };
                    if (result.error) return { error: a('saveClientError', result.error.message) };
                    await fetchAllData({ silent: true });
                    return { detail: result.data?.[0]?.patient || trimmedName };
                  },
                });
              }} className="w-full sm:w-1/2 bg-white border border-slate-300 text-slate-700 font-black py-3 sm:py-4 rounded-xl uppercase text-[10px] shadow-sm hover:bg-slate-50 disabled:opacity-50">{isSavingAppointment ? L.p.common.working : 'Solo Guardar'}</button>
              
              <button
                disabled={isSavingAppointment}
                onClick={async () => {
                const trimmedName = newPatientData.name.trim();
                if (!trimmedName) return alert(a('nameRequired'));
                await runBusyAction({
                  workingTitle: L.p.common.savingPatient,
                  workingDetail: L.p.common.pleaseWait,
                  successTitle: L.p.common.patientSavedOk,
                  autoCloseMs: 900,
                  onDone: () => {
                    setShowNewPatientModal(false);
                    setShowNewAppointment(true);
                    setNewPatientData({ name: '', phone: '', email: '', protocol: 'Wellness', notes: '', prefers_email: true, prefers_sms: true });
                  },
                  action: async () => {
                    const result = await savePatientToDB(activeSupabase, {
                      name: trimmedName,
                      phone: newPatientData.phone.trim(),
                      email: newPatientData.email.trim(),
                      protocol: newPatientData.protocol,
                      notes: newPatientData.notes,
                      prefers_email: newPatientData.prefers_email,
                      prefers_sms: newPatientData.prefers_sms,
                    });
                    if (result.cancelled || result.error?.message === 'CANCELADO') {
                      return { cancelled: true };
                    }
                    if (result.error && result.error.message === 'CLON_DETECTADO') return { error: a('cloneDetected') };
                    if (result.error) return { error: a('saveClientError', result.error.message) };
                    const savedName = result.data?.[0]?.patient || trimmedName;
                    setSelectedSlot({
                      patient: savedName,
                      patientId: result.data?.[0]?.id || null,
                      phone: newPatientData.phone.trim(),
                      email: newPatientData.email.trim(),
                      protocol: newPatientData.protocol,
                      patientNotes: newPatientData.notes,
                      prefers_email: newPatientData.prefers_email,
                      prefers_sms: newPatientData.prefers_sms,
                      status: 'available',
                      is_new_patient: !result.linkedExisting,
                    });
                    await fetchAllData({ silent: true });
                    return { detail: savedName };
                  },
                });
              }} className="w-full sm:w-1/2 bg-emerald-600 text-white font-black py-3 sm:py-4 rounded-xl uppercase text-[10px] shadow-lg hover:bg-emerald-700 disabled:opacity-50">{isSavingAppointment ? L.p.common.working : 'Guardar y Agendar'}</button>
            </div>
          </div>
        </div>
      )}

      {showOOOModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 z-50" style={{ zIndex: 9999 }}>
          <div className="bg-white rounded-t-2xl sm:rounded-3xl max-w-sm w-full max-h-[92dvh] sm:max-h-[85vh] flex flex-col border-t-8 border-red-500 shadow-2xl overflow-hidden text-slate-900">
            <div className="bg-slate-50 px-4 sm:px-8 py-3 sm:py-5 border-b shrink-0 flex justify-between items-center">
              <h3 className="text-base sm:text-xl font-black uppercase text-red-600">
                {oooData.id
                  ? (locale === 'en' ? '🚫 Edit block' : '🚫 Editar bloqueo')
                  : (locale === 'en' ? '🚫 Block agenda' : '🚫 Bloquear Agenda')}
              </h3>
              <button onClick={() => setShowOOOModal(false)} className="text-slate-400 hover:text-slate-800 text-2xl font-black transition">&times;</button>
            </div>
            
            <div className="p-4 sm:p-8 overflow-y-auto flex-1 space-y-3 sm:space-y-4 min-h-0">
              {oooData.id ? (
                <p className="text-[10px] font-bold text-slate-500 normal-case leading-snug bg-slate-100 border border-slate-200 rounded-xl px-3 py-2">
                  {locale === 'en'
                    ? 'Change the date, times, scope or reason, then save. Or remove the block completely.'
                    : 'Cambia fecha, horario, ámbito o motivo y guarda. O quita el bloqueo por completo.'}
                </p>
              ) : null}
              <div>
                <label className="text-[10px] font-black uppercase text-slate-400 ml-1">
                  {locale === 'en' ? 'Date' : 'Fecha a bloquear'}
                </label>
                <input type="date" value={oooData.date} onChange={e => setOOOData({...oooData, date: e.target.value})} className="w-full p-3 border rounded-xl font-bold text-sm outline-none text-slate-900 bg-white" />
              </div>
              <div className="flex flex-col sm:flex-row gap-3">
                <div className="flex-1 min-w-0">
                  <label className="text-[10px] font-black text-slate-400 uppercase ml-1">{locale === 'en' ? 'From' : 'Desde'}</label>
                  <input type="time" value={oooData.start_time} onChange={e => setOOOData({...oooData, start_time: e.target.value})} className="w-full min-w-0 p-2.5 sm:p-3 border rounded-xl font-bold outline-none text-slate-900 bg-white text-sm" />
                </div>
                <div className="flex-1 min-w-0">
                  <label className="text-[10px] font-black text-slate-400 uppercase ml-1">{locale === 'en' ? 'Until' : 'Hasta'}</label>
                  <input type="time" value={oooData.end_time} onChange={e => setOOOData({...oooData, end_time: e.target.value})} className="w-full min-w-0 p-2.5 sm:p-3 border rounded-xl font-bold outline-none text-slate-900 bg-white text-sm" />
                </div>
              </div>
              <div>
                <label className="text-[10px] font-black uppercase text-slate-400 ml-1 mb-2 block">{L.blockScopeLabel}</label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setOOOData({ ...oooData, is_global: true })}
                    className={`text-left p-3 rounded-xl border-2 transition ${oooData.is_global ? 'border-red-500 bg-red-50 shadow-sm' : 'border-slate-200 bg-white hover:border-red-200'}`}
                  >
                    <span className="block text-xs font-black uppercase text-red-900">{L.blockScopeClinic}</span>
                    <span className="block text-[10px] font-bold text-slate-500 mt-1 normal-case leading-snug">{L.blockScopeClinicHint}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setOOOData({
                      ...oooData,
                      is_global: false,
                      equipment: oooData.equipment || dynamicColumns[0] || '',
                    })}
                    className={`text-left p-3 rounded-xl border-2 transition ${!oooData.is_global ? 'border-red-500 bg-red-50 shadow-sm' : 'border-slate-200 bg-white hover:border-red-200'}`}
                  >
                    <span className="block text-xs font-black uppercase text-red-900">{L.blockScopeEquipment}</span>
                    <span className="block text-[10px] font-bold text-slate-500 mt-1 normal-case leading-snug">{L.blockScopeEquipmentHint}</span>
                  </button>
                </div>
              </div>
              {!oooData.is_global && (
                <div>
                  <label className="text-[10px] font-black uppercase text-slate-400 ml-1">{L.blockSelectEquipment}</label>
                  <select value={oooData.equipment} onChange={e => setOOOData({...oooData, equipment: e.target.value})} className="w-full p-3 border rounded-xl font-bold text-sm uppercase outline-none text-slate-900 bg-white">
                    {dynamicColumns.map(e => <option key={e} value={e}>{e}</option>)}
                  </select>
                </div>
              )}
              <div className="pb-2">
                <label className="text-[10px] font-black uppercase text-slate-400 ml-1">{locale === 'en' ? 'Reason' : 'Motivo'}</label>
                <input type="text" placeholder={locale === 'en' ? 'e.g. Preventive maintenance' : 'Ej. Mantenimiento Preventivo'} value={oooData.reason} onChange={e => setOOOData({...oooData, reason: e.target.value})} className="w-full p-3 border rounded-xl font-bold text-sm uppercase outline-none text-slate-900 bg-white" />
              </div>
            </div>
            
            <div className="bg-slate-50 px-4 sm:px-8 py-3 sm:py-5 border-t shrink-0 flex flex-col gap-2">
              {oooData.id ? (
                <button
                  type="button"
                  disabled={isSavingAppointment}
                  onClick={async () => {
                    if (!window.confirm(locale === 'en'
                      ? 'Remove this block from the calendar?'
                      : '¿Quitar este bloqueo del calendario?')) {
                      return;
                    }
                    await runBusyAction({
                      workingTitle: locale === 'en' ? 'Removing block…' : 'Quitando bloqueo…',
                      workingDetail: L.p.common.pleaseWait,
                      successTitle: locale === 'en' ? 'Block removed' : 'Bloqueo quitado',
                      autoCloseMs: 900,
                      onDone: () => setShowOOOModal(false),
                      action: async () => {
                        const { error } = await activeSupabase.from('blocked_slots').delete().eq('id', oooData.id);
                        if (error) return { error: error.message };
                        await notifyCalendarChanged();
                        return { detail: oooData.date };
                      },
                    });
                  }}
                  className="w-full bg-white border-2 border-red-300 text-red-700 font-black py-3 rounded-xl uppercase text-xs hover:bg-red-50 disabled:opacity-50"
                >
                  {locale === 'en' ? 'Remove block' : 'Quitar bloqueo'}
                </button>
              ) : null}
              <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
                <button disabled={isSavingAppointment} onClick={() => setShowOOOModal(false)} className="w-full sm:w-1/3 bg-white border border-slate-300 font-black py-3 sm:py-4 rounded-xl uppercase text-xs hover:bg-slate-50 disabled:opacity-50">
                  {locale === 'en' ? 'Close' : 'Cerrar'}
                </button>
                <button
                  disabled={isSavingAppointment}
                  onClick={async () => {
                  if (!oooData.date) return alert(a('selectDate'));
                  if (!oooData.is_global && !oooData.equipment) return alert(L.blockSelectEquipmentRequired);
                  if (oooData.start_time >= oooData.end_time) {
                    return alert(locale === 'en'
                      ? 'End time must be after start time.'
                      : 'La hora final debe ser después de la hora de inicio.');
                  }
                  const isEdit = !!oooData.id;
                  await runBusyAction({
                    workingTitle: isEdit
                      ? (locale === 'en' ? 'Saving block…' : 'Guardando bloqueo…')
                      : L.p.common.blockingTitle,
                    workingDetail: L.p.common.pleaseWait,
                    successTitle: isEdit
                      ? (locale === 'en' ? 'Block updated' : 'Bloqueo actualizado')
                      : L.p.common.blockedOk,
                    autoCloseMs: 1000,
                    onDone: () => setShowOOOModal(false),
                    action: async () => {
                      const payload = {
                        date: oooData.date,
                        start_time: oooData.start_time,
                        end_time: oooData.end_time,
                        equipment: oooData.is_global ? null : oooData.equipment,
                        reason: oooData.reason,
                        is_global: oooData.is_global,
                        clinic: normalizeClinicId(activeClinic),
                      };
                      const { error } = isEdit
                        ? await activeSupabase.from('blocked_slots').update(payload).eq('id', oooData.id)
                        : await activeSupabase.from('blocked_slots').insert([payload]);
                      if (error) return { error: error.message };
                      await notifyCalendarChanged();
                      return { detail: oooData.date };
                    },
                  });
                }} className="w-full sm:flex-1 bg-red-600 text-white font-black py-3 sm:py-4 rounded-xl uppercase text-xs shadow-lg hover:bg-red-700 disabled:opacity-50">
                  {isSavingAppointment
                    ? L.p.common.working
                    : oooData.id
                      ? (locale === 'en' ? 'Save changes' : 'Guardar cambios')
                      : (locale === 'en' ? 'Apply block' : 'Aplicar Bloqueo')}
                </button>
              </div>
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
            {moveConfirmation.outsideNormalHours && (
              <div className="bg-amber-50 border border-amber-300 rounded-xl p-3 mb-6 text-center">
                <p className="text-xs font-black text-amber-700 uppercase">🟡 Fuera de horario definido</p>
                <p className="text-[10px] font-bold text-amber-600 mt-1">Esta cita quedará marcada como fuera del horario normal del equipo.</p>
              </div>
            )}
            {moveConfirmation.pastOverride && (
              <div className="bg-orange-50 border border-orange-300 rounded-xl p-3 mb-6 text-center">
                <p className="text-xs font-black text-orange-800 uppercase">{a('pastMoveOverrideHint')}</p>
              </div>
            )}
            <div className="flex flex-col sm:flex-row gap-2 sm:space-x-3 sm:gap-0">
              <button disabled={isSavingAppointment} onClick={() => setMoveConfirmation(null)} className="w-full sm:flex-1 bg-slate-100 font-black py-3 sm:py-4 rounded-2xl uppercase text-xs hover:bg-slate-200 disabled:opacity-50">Cancelar</button>
              <button disabled={isSavingAppointment} onClick={confirmMove} className="w-full sm:flex-1 bg-blue-600 text-white font-black py-3 sm:py-4 rounded-2xl uppercase text-xs shadow-lg hover:bg-blue-700 disabled:opacity-50">{isSavingAppointment ? L.p.common.working : 'Confirmar'}</button>
            </div>
          </div>
        </div>
      )}

      {showPatientProfile && selectedSlot && (
        <div className="relative z-50" style={{ zIndex: 9999 }}>
          <PatientProfileModal 
            initialData={(() => {
              const profilePatient = (selectedSlot.patientId
                ? dbPatients.find((p) => String(p.id) === String(selectedSlot.patientId))
                : null)
                || dbPatients.find((x) => normalizeStr(x.patient) === normalizeStr(selectedSlot.patient))
                || resolvePatientForAppointment(selectedSlot, dbPatients);
              return {
                ...selectedSlot,
                ...profilePatient,
                id: profilePatient?.id || selectedSlot.patientId || null,
                patientId: profilePatient?.id || selectedSlot.patientId || null,
                patient: profilePatient?.patient || selectedSlot.patient,
                phone: profilePatient?.phone || selectedSlot.phone || '',
                email: profilePatient?.email || selectedSlot.email || '',
                patientNotes: sanitizePatientNotesForDisplay(profilePatient?.notes || selectedSlot.patientNotes || ''),
                prefers_email: profilePatient?.prefers_email !== false && selectedSlot.prefers_email !== false,
                prefers_sms: profilePatient?.prefers_sms !== false && selectedSlot.prefers_sms !== false,
              };
            })()}
            appointments={dbAppointments}
            servicios={dbServices} 
            companyConfig={dbCompanyConfig}
            activeClinic={activeClinic}
            currentUserLevel={currentUserLevel}
            sessionGroupsEnabled={sessionGroupsEnabled}
            allPatients={dbPatients}
            sessionGroup={(() => {
              const profilePat = (selectedSlot.patientId
                ? dbPatients.find((p) => String(p.id) === String(selectedSlot.patientId))
                : null)
                || resolvePatientForAppointment(selectedSlot, dbPatients);
              return selectedSlot.sessionGroup || getPatientSessionGroup(profilePat);
            })()}
            onSessionUpdated={applySessionDataToSelectedSlot}
            onCreateSessionGroup={async ({ name, titularPatient }) => {
              await createSessionGroup(activeSupabase, { name, titularPatient, patients: dbPatients });
              await fetchAllData();
            }}
            onAddGroupMember={async ({ groupId, memberPatient }) => {
              const group = dbSessionGroups.find((g) => g.id === groupId);
              await addSessionGroupMember(activeSupabase, group, memberPatient);
              await fetchAllData();
            }}
            onRemoveGroupMember={async ({ groupId, memberId }) => {
              await removeSessionGroupMember(activeSupabase, memberId);
              await fetchAllData();
            }}
            onGroupPurchase={async ({ groupId, wallets, adeudo, transaction, adjustOnly }) => {
              const group = dbSessionGroups.find((g) => g.id === groupId);
              const history = adjustOnly || !transaction
                ? (group?.packageHistory || [])
                : [transaction, ...(group?.packageHistory || [])];
              await activeSupabase.from('session_groups').update({
                wallets,
                adeudo,
                package_history: history,
              }).eq('id', groupId);
              const updatedGroup = { ...(group || { id: groupId }), wallets, adeudo, packageHistory: history };
              setDbSessionGroups((prev) => prev.map((g) => (
                g.id === groupId ? { ...g, wallets, adeudo, packageHistory: history } : g
              )));
              applySessionDataToSelectedSlot({
                patientId: selectedSlot?.patientId,
                sessionGroup: updatedGroup,
              });
              broadcastLiveDataUpdated(activeClinic);
              await fetchAllData({ silent: true });
            }}
            onGroupCancelSale={async ({ groupId, transaction }) => {
              const group = dbSessionGroups.find((g) => g.id === groupId);
              if (!group) return;
              const reversed = reverseGroupPurchase(group, transaction);
              const history = (group.packageHistory || []).filter((t) => t.id !== transaction.id);
              await activeSupabase.from('session_groups').update({
                wallets: reversed.wallets,
                adeudo: reversed.adeudo,
                package_history: history,
              }).eq('id', groupId);
              const updatedGroup = { ...group, wallets: reversed.wallets, adeudo: reversed.adeudo, packageHistory: history };
              setDbSessionGroups((prev) => prev.map((g) => (
                g.id === groupId
                  ? { ...g, wallets: reversed.wallets, adeudo: reversed.adeudo, packageHistory: history }
                  : g
              )));
              applySessionDataToSelectedSlot({
                patientId: selectedSlot?.patientId,
                sessionGroup: updatedGroup,
              });
              broadcastLiveDataUpdated(activeClinic);
              await fetchAllData({ silent: true });
            }}
            onAllocateTicketNumber={async () => {
              const next = resolveNextTicketNumber({
                ticketCounter: dbCompanyConfig.ticket_counter,
                patients: dbPatients,
              });
              if (dbCompanyConfig.id) {
                const { error } = await activeSupabase
                  .from('company_config')
                  .update({ ticket_counter: next + 1 })
                  .eq('id', dbCompanyConfig.id);
                if (!error) {
                  setDbCompanyConfig((prev) => ({ ...prev, ticket_counter: next + 1 }));
                }
              }
              return next;
            }}
            onClose={() => {
              const patientId = selectedSlot?.patientId;
              const pat = patientId
                ? dbPatients.find((p) => String(p.id) === String(patientId))
                : dbPatients.find((p) => normalizeStr(p.patient) === normalizeStr(selectedSlot?.patient));
              if (pat) {
                applySessionDataToSelectedSlot({
                  patientId: pat.id,
                  wallets: pat.wallets,
                  adeudo: pat.adeudo,
                  packageHistory: pat.packageHistory,
                  sessionGroup: selectedSlot?.sessionGroup?.id
                    ? selectedSlot.sessionGroup
                    : getPatientSessionGroup(pat),
                });
              }
              setShowPatientProfile(false);
            }}
            onLogSale={(tx, patientName) => {
              logAudit(null, patientName, 'VENTA POS', formatSaleAuditDetail(tx, currencyStr));
            }}
            onPersistPurchase={async ({ patientId, wallets, adeudo, packageHistory }) => {
              const id = patientId || selectedSlot.patientId;
              if (!id) throw new Error(locale === 'en' ? 'Save the patient profile first (missing ID).' : 'Guarda el expediente del paciente primero (falta ID).');
              const repaired = repairLegacyWalletKeys(wallets, packageHistory);
              let res = await activeSupabase.from('patients').update({
                wallets: repaired.wallets,
                adeudo: adeudo ?? 0,
                package_history: packageHistory,
              }).eq('id', id);
              if (res.error && /column|adeudo/i.test(res.error.message || '')) {
                res = await activeSupabase.from('patients').update({
                  wallets: repaired.wallets,
                  package_history: packageHistory,
                }).eq('id', id);
              }
              if (res.error) throw new Error(res.error.message);
              setDbPatients((prev) => prev.map((p) => (
                String(p.id) === String(id)
                  ? { ...p, wallets: repaired.wallets, adeudo: adeudo ?? 0, packageHistory }
                  : p
              )));
              applySessionDataToSelectedSlot({
                patientId: id,
                wallets: repaired.wallets,
                adeudo: adeudo ?? 0,
                packageHistory,
              });
              broadcastLiveDataUpdated(activeClinic);
            }}
            onCancelSale={(tx, patientName) => {
              logAudit(null, patientName, 'REVERSIÓN DE VENTA', formatSaleCancelAuditDetail(tx, currencyStr));
            }}
            onSave={async (ud) => {
              const activeSupabase = createStaffDb(activeClinic);
              const patientDbId = ud.id || selectedSlot.patientId;
              const existingPatient = patientDbId
                ? dbPatients.find((p) => String(p.id) === String(patientDbId))
                : resolvePatientForAppointment(selectedSlot, dbPatients);
              const oldPatientName = existingPatient?.patient || selectedSlot.patient;
              const repairedWallets = repairLegacyWalletKeys(ud.wallets, ud.packageHistory).wallets;
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
                  wallets: repairedWallets, 
                  package_history: ud.packageHistory, 
                  historico_sesiones: ud.historicoSesiones,
                  adeudo: ud.adeudo ?? 0,
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
                    wallets: repairedWallets, 
                    package_history: ud.packageHistory, 
                    historico_sesiones: ud.historicoSesiones,
                  }).eq('id', patientDbId);
                  await activeSupabase.from('patients').update({ adeudo: ud.adeudo ?? 0 }).eq('id', patientDbId);
                } else if (res.error) {
                  return alert(a('saveClientError', res.error.message));
                }

                if (normalizeStr(oldPatientName) !== normalizeStr(ud.patient)) {
                  try {
                    const renamed = await renamePatientAcrossClinic(activeSupabase, {
                      oldName: oldPatientName,
                      newName: ud.patient,
                      phone: ud.phone,
                    });
                    await logAudit(
                      selectedSlot?.id || null,
                      ud.patient,
                      'RENOMBRAR PACIENTE',
                      `«${oldPatientName}» → «${ud.patient}». Citas: ${renamed.appointments}, auditoría: ${renamed.auditLogs}`,
                    );
                  } catch (renameErr) {
                    return alert(a('saveClientError', renameErr.message));
                  }
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

              if (selectedSlot?.id) {
                setSelectedSlot((prev) => (
                  prev && prev.id === selectedSlot.id
                    ? {
                      ...prev,
                      patient: ud.patient,
                      patientId: patientDbId || prev.patientId,
                      phone: ud.phone,
                      email: ud.email,
                      protocol: ud.protocol,
                      patientNotes: ud.notes,
                      prefers_email: ud.prefers_email,
                      prefers_sms: ud.prefers_sms,
                    }
                    : prev
                ));
              }
              broadcastLiveDataUpdated(activeClinic);
              flashSaveToast(locale === 'en' ? 'Profile saved' : 'Expediente guardado');
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
            onSeal={async (sd, vt, summaryLines) => {
              const appointmentId = selectedSlot?.id;
              if (!appointmentId) {
                throw new Error(locale === 'en'
                  ? 'Missing appointment ID. Close and open the visit again.'
                  : 'Falta el ID de la cita. Cierra y vuelve a abrir la visita.');
              }

              const eq = selectedSlot.equipment;
              const servicePrice = selectedSlot.servicePrice || getServicePrice(dbServices, eq);
              const pat = (selectedSlot.patientId
                ? dbPatients.find((x) => String(x.id) === String(selectedSlot.patientId))
                : null)
                || dbPatients.find((x) => normalizeStr(x.patient) === normalizeStr(selectedSlot.patient))
                || resolvePatientForAppointment(selectedSlot, dbPatients);
              if (!pat?.id) {
                throw new Error(locale === 'en'
                  ? 'Patient record not found (missing ID). Open the chart and save the profile first.'
                  : 'No se encontró el expediente (falta ID). Abre el expediente y guárdalo primero.');
              }

              const sealPatientName = pat.patient || selectedSlot.patient;
              const attendantName = selectedSlot.attendant || currentUser?.name || '';

              await runBusyAction({
                workingTitle: locale === 'en' ? 'Sealing attendance…' : 'Sellando asistencia…',
                workingDetail: L.p.common.pleaseWait,
                successTitle: locale === 'en' ? 'Attendance sealed' : 'Asistencia sellada',
                autoCloseMs: 1200,
                onDone: () => {
                  setShowBitacora(false);
                  setSelectedSlot(null);
                },
                action: async () => {
                  // Adeudo / empty wallet must not block seal — records debt if no paid balance.
                  const { deducted, nextAdeudo, consumed, skippedAssessment } = await processSessionDeduction(
                    pat,
                    eq,
                    servicePrice,
                  );

                  const sealPayload = {
                    check_in_status: 'Finalizado',
                    attendant: attendantName,
                    signature: sd,
                  };
                  let sealRes = await activeSupabase
                    .from('appointments')
                    .update(sealPayload)
                    .eq('id', appointmentId);

                  // Fallback if signature column is missing (do NOT treat trigger WHERE errors as signature issues).
                  if (sealRes.error && /signature|column|schema cache/i.test(sealRes.error.message || '')
                    && !/WHERE clause/i.test(sealRes.error.message || '')) {
                    const noteLine = `[FIRMA ${new Date().toLocaleString()}] Bitácora sellada (firma en auditoría).`;
                    const prevNotes = String(selectedSlot.notes || '').trim();
                    sealRes = await activeSupabase
                      .from('appointments')
                      .update({
                        check_in_status: 'Finalizado',
                        attendant: attendantName,
                        notes: prevNotes ? `${prevNotes}\n${noteLine}` : noteLine,
                      })
                      .eq('id', appointmentId);
                  }
                  if (sealRes.error) throw sealRes.error;

                  let auditStr = a('bitacoraSealedAuditDetail', attendantName);
                  if (summaryLines?.headline) auditStr += ` ${summaryLines.headline}.`;
                  if (skippedAssessment) {
                    auditStr += locale === 'en'
                      ? ' Assessment: no wallet or debt movement.'
                      : ' Valoración: sin movimiento de cartera ni adeudo.';
                  } else if (!deducted) {
                    auditStr += locale === 'en'
                      ? ` No paid balance: debt +1 (total debt: ${nextAdeudo}).`
                      : ` Sin saldo pagado: adeudo +1 (total adeudo: ${nextAdeudo}).`;
                  } else {
                    auditStr += locale === 'en'
                      ? ` Deducted 1 session from wallet (${consumed?.walletKey || eq}).`
                      : ` Se descontó 1 sesión de cartera (${consumed?.walletKey || eq}).`;
                  }
                  if (selectedSlot.protocol === 'Médico' && vt) {
                    auditStr += locale === 'en'
                      ? ` Vitals: BP ${vt.pa}, Temp ${vt.temp}, HR ${vt.hr}.`
                      : ` Signos: PA ${vt.pa}, Temp ${vt.temp}, HR ${vt.hr}.`;
                  }
                  // Keep a short fingerprint of the signature in audit (not the full PNG).
                  if (sd) {
                    auditStr += locale === 'en'
                      ? ` Signature captured (${Math.round(String(sd).length / 1024)} KB).`
                      : ` Firma capturada (${Math.round(String(sd).length / 1024)} KB).`;
                  }
                  await logAudit(appointmentId, sealPatientName, a('bitacoraSealedAuditAction'), auditStr);
                  await notifyCalendarChanged();
                  return { detail: sealPatientName };
                },
              });
            }} 
          />
        </div>
      )}

      <AppointmentSavingOverlay
        open={Boolean(appointmentSaveFeedback)}
        phase={appointmentSaveFeedback?.phase || 'creating'}
        title={appointmentSaveFeedback?.title || L.p.appt.creatingTitle}
        detail={appointmentSaveFeedback?.detail || ''}
        closeLabel={L.modals.patient.close}
        autoCloseMs={appointmentSaveFeedback?.autoCloseMs || 0}
        onClose={appointmentSaveFeedback?.phase === 'creating' ? undefined : closeAppointmentSaveFeedback}
      />

      <StaffSaveToast message={saveToast} />

      {showScreenshotIntake && (
        <ScreenshotAppointmentModal
          open={showScreenshotIntake}
          onClose={() => setShowScreenshotIntake(false)}
          locale={locale}
          labels={screenshotIntakeLabels}
          activeClinic={activeClinic}
          services={dbServices}
          defaultEquipment={screenshotDefaultEquipment}
          referenceDate={clinicNow.dateStr || currentFullDate}
          onSchedule={async (form) => {
            const draft = buildDraftFromScreenshot(form);
            const missing = getMissingAppointmentFields(draft, locale);
            if (missing.length) {
              throw new Error(staffAlert(locale, 'missingAppointmentFields', missing));
            }
            await handleSaveNewAppointment(draft);
            setShowScreenshotIntake(false);
          }}
        />
      )}

      <StaffAgentChat
        open={showAgentChat}
        onClose={() => setShowAgentChat(false)}
        activeClinic={activeClinic}
        locale={locale}
        labels={agentChatLabels}
        isMaster={currentUserLevel <= 1}
      />

      {/* Navegación inferior móvil — iconos */}
      {currentUser && (
        <>
          {mobileMoreOpen && (
            <div className="lg:hidden fixed inset-0 z-[60] bg-slate-900/50" onClick={() => setMobileMoreOpen(false)} />
          )}
          {mobileMoreOpen && mobileAdminTabs.length > 0 && (
            <div className="lg:hidden fixed bottom-[calc(3.5rem+env(safe-area-inset-bottom,0px))] inset-x-2 z-[70] bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl p-2">
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
          <nav className="lg:hidden fixed bottom-0 inset-x-0 z-[65] bg-slate-950 border-t border-slate-800 pb-[env(safe-area-inset-bottom,0px)]">
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
              <button
                type="button"
                onClick={() => {
                  setMobileMoreOpen(false);
                  setShowAgentChat(true);
                }}
                className={`flex-1 flex flex-col items-center justify-center gap-0.5 min-w-0 px-1 ${showAgentChat ? 'text-violet-400' : 'text-slate-500'}`}
                aria-label={locale === 'en' ? 'Assistant' : 'Asistente'}
              >
                <span className="text-base leading-none">🤖</span>
                <span className="text-[8px] font-black uppercase truncate max-w-full">{locale === 'en' ? 'Agent' : 'Agente'}</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setMobileMoreOpen(false);
                  setShowScreenshotIntake(true);
                }}
                className={`flex-1 flex flex-col items-center justify-center gap-0.5 min-w-0 px-1 ${showScreenshotIntake ? 'text-indigo-400' : 'text-slate-500'}`}
                aria-label={L.ariaScreenshotCapture}
              >
                <span className="text-base leading-none">📷</span>
                <span className="text-[8px] font-black uppercase truncate max-w-full">{L.mobileTabs.Captura}</span>
              </button>
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
    <AppSymbolLegend open={showSymbolLegend} onClose={() => setShowSymbolLegend(false)} />
    <PosReceiptModal
      open={Boolean(reportReceipt)}
      receipt={reportReceipt}
      phone={reportReceiptPhone}
      companyConfig={dbCompanyConfig}
      activeClinic={activeClinic}
      locale={locale}
      labels={L.modals.patient}
      onClose={() => {
        setReportReceipt(null);
        setReportReceiptPhone('');
      }}
    />
    </StaffLocaleProvider>
  );
}
