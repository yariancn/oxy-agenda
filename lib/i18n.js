import { MODAL_COPY } from './i18n/modals.js';
import { PAGES_COPY } from './i18n/pages.js';
import { formatClinicDateIso } from './clinicClock.js';
import { CLINIC_OXYGENDGL, CLINIC_OXYGENDGL2, localeForClinic as localeForClinicRegistry } from './clinicRegistry.js';

/** Idioma por clínica: TX → inglés, GDL → español */
export function localeForClinic(clinic) {
  return localeForClinicRegistry(clinic);
}

export function localeFromPathname(pathname = '') {
  if (pathname.includes('/booking/us')) return 'en';
  if (pathname.includes('/booking/mx')) return 'es';
  return 'es';
}

export function getWeekdayNames(locale) {
  return locale === 'en'
    ? ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
    : ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
}

export function getDayNameFromDate(locale, date) {
  const d = date instanceof Date ? date : new Date(date);
  const names = locale === 'en'
    ? ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
    : ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
  return names[d.getDay()];
}

export function formatShortDate(locale, date) {
  return date.toLocaleDateString(locale === 'en' ? 'en-US' : 'es-MX', {
    day: '2-digit',
    month: 'short',
  });
}

export function buildCalendarWeek(locale, currentDate, clinic = CLINIC_OXYGENDGL) {
  const anchorIso = formatClinicDateIso(currentDate, clinic);
  const start = new Date(`${anchorIso}T12:00:00`);
  const day = start.getDay();
  const diff = start.getDate() - day + (day === 0 ? -6 : 1);
  start.setDate(diff);
  const weekdayNames = getWeekdayNames(locale);

  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return {
      name: weekdayNames[i],
      date: formatShortDate(locale, d),
      fullDate: formatClinicDateIso(d, clinic),
    };
  });
}

export const PUBLIC_BOOKING_COPY = {
  es: {
    back: 'Volver',
    step1Title: '¿Qué servicio buscas?',
    step2Title: 'Selecciona fecha y hora',
    slotLegendAvailable: 'Disponible',
    slotLegendOccupied: 'Ocupado',
    slotLegendBlocked: 'Bloqueado',
    noSlotsDay: 'No hay horarios para este día. Prueba otra fecha.',
    dayClosed: 'La clínica no labora este día. Elige otra fecha.',
    contactNoSlotPrefix: '¿No encuentras el horario que buscas?',
    contactNoSlotAction: 'Contáctanos al',
    availableCount: (n) => `${n} horario${n === 1 ? '' : 's'} disponible${n === 1 ? '' : 's'}`,
    step3Title: 'Tus datos',
    step3Summary: 'Resumen',
    name: 'Nombre completo',
    phone: 'Número (10 dígitos)',
    email: 'Correo electrónico',
    commentsTitle: 'Comentarios para la clínica',
    commentsHint: 'Motivo de consulta, alergias, preferencias… Esto aparece en la nota de tu cita en agenda.',
    commentsPlaceholder: 'Escribe aquí lo que quieras que vea el equipo al recibirte…',
    promoterPageLabel: 'Página de reserva personal',
    promoterWith: 'Te atiende',
    promoterCode: 'Código',
    promoterUnknown: 'Asesor de referidos',
    promoterOptional: '¿Tienes código de referido? (opcional)',
    promoterOptionalHint: 'Si no tienes código, déjalo vacío.',
    confirm: 'Confirmar cita',
    processing: 'Procesando…',
    creatingTitle: 'Creando cita…',
    creatingHint: 'Estamos confirmando tu reserva y enviando avisos.',
    phoneRule: 'Se requiere un número de 10 dígitos para confirmar.',
    doneTitle: '¡Cita confirmada!',
    doneBody: 'Te esperamos en la clínica. Revisa tu correo si lo indicaste.',
    bookAnother: 'Agendar otra cita',
    phoneError: '⚠️ El número celular debe tener exactamente 10 dígitos.',
    slotUnavailable: '⚠️ Ese horario ya no está disponible. Elige otro en la lista actualizada.',
    genericError: 'Error al confirmar la cita.',
    loading: 'Cargando horarios…',
    noServices: 'No hay servicios disponibles en este momento. Contacta a la clínica.',
    bookingWith: (name) => `Agenda tu cita con ${name}`,
    notesSaved: 'Tus comentarios quedaron guardados en la nota de la cita.',
    promoterPending: 'pendiente de alta',
    smsConsentLabel: 'Acepto recibir SMS de la clínica sobre mi cita.',
    smsConsentHint: 'Opcional. Casilla sin marcar por defecto.',
    privacyLink: 'Aviso de privacidad',
    termsLink: 'Términos y condiciones',
    smsTermsLink: 'Términos SMS',
  },
  en: {
    back: 'Back',
    step1Title: 'What service do you need?',
    step2Title: 'Pick date and time',
    slotLegendAvailable: 'Available',
    slotLegendOccupied: 'Booked',
    slotLegendBlocked: 'Blocked',
    noSlotsDay: 'No time slots for this day. Try another date.',
    dayClosed: 'The clinic is closed on this day. Choose another date.',
    contactNoSlotPrefix: "Don't see the time you need?",
    contactNoSlotAction: 'Call us at',
    availableCount: (n) => `${n} slot${n === 1 ? '' : 's'} available`,
    step3Title: 'Your details',
    step3Summary: 'Summary',
    name: 'Full name',
    phone: 'Phone (10 digits)',
    email: 'Email',
    commentsTitle: 'Notes for the clinic',
    commentsHint: 'Reason for visit, allergies, preferences… This appears on your appointment note in the schedule.',
    commentsPlaceholder: 'Write anything you want the team to see when you arrive…',
    promoterPageLabel: 'Personal booking page',
    promoterWith: 'Your advisor',
    promoterCode: 'Code',
    promoterUnknown: 'Referral advisor',
    promoterOptional: 'Referral code (optional)',
    promoterOptionalHint: 'Leave blank if you do not have one.',
    confirm: 'Confirm appointment',
    processing: 'Processing…',
    creatingTitle: 'Creating appointment…',
    creatingHint: 'Confirming your booking and sending notifications.',
    phoneRule: 'A 10-digit phone number is required.',
    doneTitle: 'Appointment confirmed!',
    doneBody: 'We look forward to seeing you at the clinic.',
    bookAnother: 'Book another',
    phoneError: '⚠️ Phone number must be exactly 10 digits.',
    slotUnavailable: '⚠️ That time slot is no longer available. Pick another from the updated list.',
    genericError: 'Could not confirm the appointment.',
    loading: 'Loading schedule…',
    noServices: 'No services are available right now. Please contact the clinic.',
    bookingWith: (name) => `Book your appointment with ${name}`,
    notesSaved: 'Your notes were saved on the appointment.',
    promoterPending: 'pending registration',
    smsConsentLabel: 'I agree to receive appointment-related text messages from REGENOXY LLC at the phone number provided. Message frequency varies. Msg & data rates may apply. Reply STOP to opt out, HELP for help.',
    smsConsentHint: 'Optional. This box is unchecked by default. Uncheck to book without SMS.',
    privacyLink: 'Privacy Policy',
    termsLink: 'Terms & Conditions',
    smsTermsLink: 'SMS Terms',
  },
};

export const IOS_WIZARD_UI = {
  es: {
    header: (n, total) => `Instalar en iPhone · Paso ${n} de ${total}`,
    later: 'Después',
    shareTip: 'Tip: toca «Después» arriba a la derecha para ver la barra de Safari.',
    opening: 'Abriendo…',
    next: 'Listo, siguiente paso →',
    doneInApp: 'Entendido — continuaré en Safari',
    doneInstalled: '✓ Ya la instalé — Entrar',
    linkCopied: 'Enlace copiado — pégalo en Safari',
    prev: '← Paso anterior',
  },
  en: {
    header: (n, total) => `Install on iPhone · Step ${n} of ${total}`,
    later: 'Later',
    shareTip: 'Tip: tap “Later” top right to see the Safari toolbar.',
    opening: 'Opening…',
    next: 'Done, next step →',
    doneInApp: 'Got it — I will continue in Safari',
    doneInstalled: '✓ Installed — Continue',
    linkCopied: 'Link copied — paste in Safari',
    prev: '← Previous step',
  },
};

export const INSTALL_GUIDE_COPY = {
  es: {
    firstTime: 'Primera vez aquí',
    close: 'Cerrar',
    installing: 'Instalando…',
    installNow: '⚡ Instalar ahora (recomendado)',
    copied: '✓ Dirección copiada',
    copyUrl: '📋 Copiar dirección de la app',
    tip: 'Tip: ',
    afterInstall: 'Después de instalar',
    afterInstallBody: 'Abre desde el ícono la agenda en oxy-agenda.vercel.app (no el link de reservas) e ingresa tu NIP de 6 dígitos.',
    understood: 'Entendido, continuar',
    dismiss: 'No volver a mostrar',
    fab: 'Instalar app',
    fabAria: 'Cómo instalar OXY Agenda',
    link: '📲 ¿Cómo instalar la app en tu celular o computadora?',
  },
  en: {
    firstTime: 'First time here',
    close: 'Close',
    installing: 'Installing…',
    installNow: '⚡ Install now (recommended)',
    copied: '✓ Address copied',
    copyUrl: '📋 Copy app address',
    tip: 'Tip: ',
    afterInstall: 'After installing',
    afterInstallBody: 'Open the schedule from the home screen icon at oxy-agenda.vercel.app (not the booking link) and enter your 6-digit PIN.',
    understood: 'Got it, continue',
    dismiss: "Don't show again",
    fab: 'Install app',
    fabAria: 'How to install OXY Agenda',
    link: '📲 How to install the app on your phone or computer?',
  },
};

export const PUBLIC_SLOT_STATUS = {
  es: { occupied: 'Ocupado', blocked: 'Bloqueado', too_soon: '—' },
  en: { occupied: 'Booked', blocked: 'Blocked', too_soon: '—' },
};

const STAFF = {
  es: {
    loginTitle: '🔒 Acceso',
    loginHint: 'Correo institucional y NIP de 6 dígitos',
    loginEmail: 'Correo electrónico',
    loginEmailPh: 'tu@correo.com',
    loginTrustedHint: 'Dispositivo recordado',
    loginTrustedPinHint: 'Dispositivo recordado · confirma tu NIP (cada 24 h)',
    loginRestoring: 'Restaurando sesión…',
    loginRememberDevice: 'Recordar este dispositivo (90 días)',
    loginUseOtherAccount: 'Usar otra cuenta',
    loginEnter: 'Entrar',
    loginVerifying: 'Verificando…',
    logout: 'Salir',
    accessLevel: 'NIVEL DE ACCESO',
    clinics: 'CLÍNICAS',
    activeLocation: 'Ubicación Activa',
    location: 'Ubicación',
    newAppointment: 'Nueva Cita',
    operation: 'Operación',
    administration: 'Administración',
    more: 'Más',
    tabs: {
      Agenda: 'Agenda',
      Pacientes: 'Clientes',
      GFE: 'Consultas GFE',
      Servicios: 'Catálogo Operativo',
      Reportes: 'Reportes y Ventas',
      Admin: 'Ajustes de Clínica',
    },
    mobileTabs: {
      Servicios: 'Catálogo',
      Reportes: 'Reportes',
      Admin: 'Ajustes',
    },
    viewDay: 'Día',
    viewWeek: 'Semana',
    viewWeekShort: 'Sem',
    today: 'Hoy',
    scrollLeft: 'Desplazar izquierda',
    scrollRight: 'Desplazar derecha',
    scrollHorizontal: 'Desplazamiento horizontal',
    scrollBackToToday: 'Volver a hoy',
    time: 'Hora',
    zoom: 'Zoom',
    allEquipment: 'Todos',
    showAllEquipment: 'Ver todos los equipos',
    blockSlot: 'Bloquear Espacio',
    blockScopeLabel: 'Ámbito del bloqueo',
    blockScopeClinic: 'Toda la clínica',
    blockScopeClinicHint: 'Cierra las 3 cámaras y reservas en ese horario',
    blockScopeEquipment: 'Un equipo específico',
    blockScopeEquipmentHint: 'Solo bloquea la cámara o servicio elegido',
    blockSelectEquipment: 'Equipo a bloquear',
    blockSelectEquipmentRequired: 'Selecciona el equipo que quieres bloquear.',
    directory: 'Directorio',
    newPatient: 'Nuevo Paciente',
    searchPatients: '🔍 Buscar por nombre o teléfono...',
    noPhone: 'Sin teléfono',
    sessions: 'SESIONES',
    chart: 'Expediente',
    schedule: 'Agendar',
    noPatients: 'No se encontraron clientes.',
    clinicGdl: '🇲🇽 Oxygengdl',
    clinicGdl2: '🇲🇽 Oxygengdl2',
    clinicTx: '🇺🇸 Shenandoah, TX',
    ariaNewAppt: 'Nueva cita',
    clickToBook: 'Clic para agendar',
    agendaSummaryToday: 'Hoy',
    agendaSummaryView: 'En vista',
    agendaSummaryAppts: 'citas',
    agendaSummaryExtended: 'extendidas',
    agendaSummaryOutside: 'fuera horario',
    weekFilterHint: 'Vista semana con varios equipos: puedes filtrar uno o ver todos con el selector.',
    weekFilterApply: 'Filtrar 1.er equipo',
    weekFilterDismiss: 'Ver todos',
    calendarLegend: 'Leyenda',
    legendAvailable: 'Hueco libre (clic = nueva cita)',
    legendOutsideHours: 'Fuera de horario del equipo',
    legendExtended: 'Sesión extendida 3h',
    legendNewPatient: 'Paciente nueva',
    shortcutsHint: 'Atajos: H hoy · D día · S semana · + nueva cita',
    dbLoading: 'Cargando datos de la clínica…',
    dbErrorTitle: 'No se pudieron cargar los datos',
    dbErrorHint: 'Tras el bloqueo de seguridad (RLS), la app necesita sesión staff y las claves service role en el servidor. Vuelve a entrar con tu NIP o recarga la página.',
    dbErrorRetry: 'Reintentar',
    dbErrorUnauthorized: 'Sesión expirada o inválida — vuelve a entrar con tu NIP.',
    dbErrorServer: 'Error del servidor al conectar con la base de datos. Si estás en local, revisa .env.local (SUPABASE_*_SERVICE_ROLE_KEY y STAFF_SESSION_SECRET).',
    symbolLegendBtn: 'Símbolos de la app',
    patientsPackagesHint: 'Paquetes compartidos y cobros: abre el expediente (💳) del paciente titular → sección «Paquetes, cartera compartida y cobros».',
    legendViewAll: 'Ver leyenda completa',
    symbolLegend: {
      title: 'ℹ️ Símbolos de la app',
      intro: 'Referencia rápida de iconos y colores en agenda, expediente y portal.',
      close: 'Cerrar',
      viewAll: 'Ver todos',
      shortcutsHint: 'Atajos: H hoy · D día · S semana · + nueva cita',
      sectionAgenda: 'Agenda',
      sectionStatus: 'Estado de cita',
      sectionPatients: 'Expediente y clientes',
      sectionPortal: 'Portal de reservas (clientes)',
      legendAvailable: 'Hueco libre — clic para nueva cita',
      legendOutsideHours: 'Fuera del horario del equipo',
      legendExtended: 'Sesión extendida (3 h en agenda)',
      legendNewPatient: 'Paciente nueva (primera visita)',
      legendSharedWallet: 'Cartera compartida / grupo familiar',
      statusArrived: 'Llegó — paciente en recepción',
      statusInSession: 'En sesión — tratamiento en curso',
      statusDone: 'Finalizado — sesión completada',
      statusNoShow: 'No asistió o cancelado',
      statusExcused: 'Falta justificada',
      statusReturned: 'Sesión devuelta a cartera',
      chartPackages: 'Expediente — paquetes, cobros e historial',
      sharedPackagesWhere: 'Paquete compartido — saldo grupal',
      patientBlocked: 'Paciente bloqueado por administración',
      debtSessions: 'Adeudo — sesiones sin pago',
      portalAvailable: 'Horario disponible para reservar',
      portalOccupied: 'Horario ocupado',
      portalBlocked: 'Horario bloqueado',
    },
  },
  en: {
    loginTitle: '🔒 Sign in',
    loginHint: 'Work email and 6-digit PIN',
    loginEmail: 'Email',
    loginEmailPh: 'you@clinic.com',
    loginTrustedHint: 'Remembered device',
    loginTrustedPinHint: 'Remembered device · confirm PIN (every 24 h)',
    loginRestoring: 'Restoring session…',
    loginRememberDevice: 'Remember this device (90 days)',
    loginUseOtherAccount: 'Use another account',
    loginEnter: 'Enter',
    loginVerifying: 'Verifying…',
    logout: 'Log out',
    accessLevel: 'ACCESS LEVEL',
    clinics: 'CLINICS',
    activeLocation: 'Active location',
    location: 'Location',
    newAppointment: 'New appointment',
    operation: 'Operations',
    administration: 'Administration',
    more: 'More',
    tabs: {
      Agenda: 'Schedule',
      Pacientes: 'Clients',
      GFE: 'GFE visits',
      Servicios: 'Service catalog',
      Reportes: 'Reports & sales',
      Admin: 'Clinic settings',
    },
    mobileTabs: {
      Servicios: 'Catalog',
      Reportes: 'Reports',
      Admin: 'Settings',
    },
    viewDay: 'Day',
    viewWeek: 'Week',
    viewWeekShort: 'Wk',
    today: 'Today',
    scrollLeft: 'Scroll left',
    scrollRight: 'Scroll right',
    scrollHorizontal: 'Horizontal scroll',
    scrollBackToToday: 'Back to today',
    time: 'Time',
    zoom: 'Zoom',
    allEquipment: 'All',
    showAllEquipment: 'Show all equipment',
    blockSlot: 'Block time',
    blockScopeLabel: 'Block scope',
    blockScopeClinic: 'Entire clinic',
    blockScopeClinicHint: 'Blocks all chambers and booking in that time window',
    blockScopeEquipment: 'Specific equipment',
    blockScopeEquipmentHint: 'Only blocks the selected chamber or service',
    blockSelectEquipment: 'Equipment to block',
    blockSelectEquipmentRequired: 'Select the equipment you want to block.',
    directory: 'Directory',
    newPatient: 'New client',
    searchPatients: '🔍 Search by name or phone...',
    noPhone: 'No phone',
    sessions: 'SESSIONS',
    chart: 'Chart',
    schedule: 'Book',
    noPatients: 'No clients found.',
    clinicGdl: '🇲🇽 Oxygengdl',
    clinicGdl2: '🇲🇽 Oxygengdl2',
    clinicTx: '🇺🇸 Shenandoah, TX',
    ariaNewAppt: 'New appointment',
    clickToBook: 'Click to book',
    agendaSummaryToday: 'Today',
    agendaSummaryView: 'In view',
    agendaSummaryAppts: 'appts',
    agendaSummaryExtended: 'extended',
    agendaSummaryOutside: 'off-hours',
    weekFilterHint: 'Week view with multiple rooms: filter one or use the selector to show all.',
    weekFilterApply: 'Filter 1st room',
    weekFilterDismiss: 'Show all',
    calendarLegend: 'Legend',
    legendAvailable: 'Open slot (click = new appt)',
    legendOutsideHours: 'Outside equipment hours',
    legendExtended: 'Extended 3h session',
    legendNewPatient: 'New patient',
    shortcutsHint: 'Shortcuts: H today · D day · S week · + new appt',
    dbLoading: 'Loading clinic data…',
    dbErrorTitle: 'Could not load data',
    dbErrorHint: 'After the security lockdown (RLS), the app needs a staff session and service role keys on the server. Sign in again or reload the page.',
    dbErrorRetry: 'Retry',
    dbErrorUnauthorized: 'Session expired or invalid — sign in again with your PIN.',
    dbErrorServer: 'Server error connecting to the database. If running locally, check .env.local (SUPABASE_*_SERVICE_ROLE_KEY and STAFF_SESSION_SECRET).',
    symbolLegendBtn: 'App symbols',
    patientsPackagesHint: 'Shared packages & payments: open the owner\'s chart (💳) → «Packages, shared wallet & payments» section.',
    legendViewAll: 'Full legend',
    symbolLegend: {
      title: 'ℹ️ App symbols',
      intro: 'Quick reference for icons and colors in schedule, charts, and booking portal.',
      close: 'Close',
      viewAll: 'View all',
      shortcutsHint: 'Shortcuts: H today · D day · S week · + new appt',
      sectionAgenda: 'Schedule',
      sectionStatus: 'Appointment status',
      sectionPatients: 'Charts & clients',
      sectionPortal: 'Booking portal (clients)',
      legendAvailable: 'Open slot — click for new appointment',
      legendOutsideHours: 'Outside equipment hours',
      legendExtended: 'Extended session (3h block)',
      legendNewPatient: 'New patient (first visit)',
      legendSharedWallet: 'Shared wallet / family group',
      statusArrived: 'Arrived — client at front desk',
      statusInSession: 'In session — treatment in progress',
      statusDone: 'Completed — session finished',
      statusNoShow: 'No-show or cancelled',
      statusExcused: 'Excused absence',
      statusReturned: 'Session returned to wallet',
      chartPackages: 'Chart — packages, payments & history',
      sharedPackagesWhere: 'Shared package — group balance',
      patientBlocked: 'Client blocked by administration',
      debtSessions: 'Debt — unpaid sessions',
      portalAvailable: 'Time slot available to book',
      portalOccupied: 'Time slot occupied',
      portalBlocked: 'Time slot blocked',
    },
  },
};

const ALERTS = {
  es: {
    pinInvalid: 'Correo o NIP incorrectos, o usuario inactivo',
    loginFailed: 'No se pudo verificar el acceso. Intenta de nuevo.',
    emailRequired: 'Ingresa tu correo electrónico.',
    emailInvalid: 'Correo electrónico no válido.',
    loginLocked: (mins) => `Demasiados intentos fallidos. Espera ${mins} minuto(s) e intenta de nuevo.`,
    noClinicAccess: 'No tienes acceso a esta clínica.',
    financialPin: 'NIP Financiero Incorrecto',
    patientBlocked: '🚫 Paciente Bloqueado por Administración. No se pueden agendar citas ni servicios. Requiere desbloqueo de Superusuario en su Expediente.',
    patientBlockedShort: '🚫 Paciente Bloqueado.',
    overlap: '🔒 Empalme de horario.',
    pastSchedule: '🔒 No puedes agendar en el pasado.',
    pastMove: '🔒 No puedes reubicar citas al pasado.',
    phoneRequired: 'Ingresa un teléfono de 10 dígitos para crear el expediente.',
    patientFileError: (m) => `Error con expediente: ${m}`,
    missingData: 'Faltan datos.',
    connectionError: 'Error de conexión.',
    auditReadError: 'Error leyendo auditoría',
    patientNotFound: 'Paciente no encontrado.',
    saleCancelled: 'Venta cancelada exitosamente.',
    saleCancelError: 'Error al cancelar la venta.',
    alreadyAtTime: 'La cita ya está en ese horario.',
    overlapLong: '🔒 Empalme de horario: Ya hay una cita que choca con ese espacio en esa cámara.',
    completeDateTimeService: 'Completa fecha, hora y servicio.',
    moveError: (m) => `Error al mover la cita: ${m}`,
    connectionErrorMsg: (m) => `Error de conexión: ${m}`,
    apptNotFound: 'Cita no encontrada.',
    alreadyNoShow: 'Esta cita ya está marcada como No Asistió.',
    alreadyExcused: 'Esta cita ya está marcada como Falta Justificada.',
    statusUpdateError: 'Error actualizando estatus.',
    noFinishedAppts: 'Este paciente no tiene citas finalizadas.',
    pastScheduleAppt: '🔒 No puedes agendar citas en el pasado.',
    selectAttendant: 'Por favor selecciona responsable antes de firmar.',
    notesSavedOk: 'Notas guardadas y sincronizadas correctamente.',
    notesSaveError: 'Error guardando notas.',
    notifySent: (detail) => `Indicaciones enviadas.\n${detail || ''}`,
    notifyFailed: (detail) => `No se pudieron enviar todas las notificaciones.\n${detail || ''}`,
    nameRequired: 'El nombre es obligatorio.',
    cloneDetected: 'El paciente o teléfono ya existe en el directorio.',
    saveClientError: (m) => `Error guardando cliente: ${m}`,
    selectDate: 'Selecciona una fecha',
    saveError: (m) => `Error al guardar: ${m}`,
    cancelSaleConfirm: (name, price, sessions, service) =>
      `¿ESTÁS SEGURO? Estás a punto de CANCELAR el ticket de $${price} y revertirle a ${name} sus ${sessions} sesiones de ${service}. Esta acción es irreversible y quedará auditada.`,
    patientBlockedMove: '🚫 Paciente Bloqueado por Administración. No se pueden reubicar ni alterar sus citas.',
    configSaveError: (m) => `Error guardando configuración: ${m}`,
    genericError: (m) => `Error: ${m}`,
    noShowConfirm: 'Marcar NO ASISTIÓ: se descontará 1 sesión pagada de la cartera. Si no hay saldo, se registrará adeudo. ¿Continuar?',
    bitacoraNoBalanceConfirm: (nextDebt) =>
      `Sin sesiones pagadas en cartera. Al sellar la bitácora se registrará 1 sesión en ADEUDO (total adeudo: ${nextDebt}). ¿Continuar?`,
    bitacoraSealedAuditAction: 'BITÁCORA SELLADA',
    bitacoraSealedAuditDetail: (attendant) => `Bitácora sellada y firmada por ${attendant}.`,
    refundConfirm: '¿Seguro que deseas cancelar el cobro y devolver la sesión a la cartera del paciente?',
    deleteEquipment: '¿Borrar este equipo?',
    deleteEquipmentHasAppts: (n) => `Este equipo tiene ${n} cita(s) activa(s). No se puede borrar. Ocúltalo (inactivo) o renómbralo para conservar el historial.`,
    renameEquipmentConfirm: (oldName, newName, n) =>
      `Renombrar «${oldName}» a «${newName}» actualizará ${n} cita(s) activa(s), bloqueos y carteras de pacientes. ¿Continuar?`,
    renameEquipmentDone: (n) => `Listo. Se actualizaron ${n} cita(s) al nuevo nombre de equipo.`,
    serviceDurationLocked: (n) =>
      `Este equipo tiene ${n} cita(s) activa(s). No puedes cambiar duración ni buffer: crea un NUEVO servicio y deja este para el historial.`,
    serviceRepairsDone: (n) => `Se reasignaron ${n} cita(s) al nombre correcto del equipo.`,
    deleteProtocol: '¿Borrar protocolo?',
    deleteRole: '¿Borrar rol?',
  },
  en: {
    pinInvalid: 'Incorrect email or PIN, or inactive user',
    loginFailed: 'Could not verify access. Try again.',
    emailRequired: 'Enter your email address.',
    emailInvalid: 'Invalid email address.',
    loginLocked: (mins) => `Too many failed attempts. Wait ${mins} minute(s) and try again.`,
    noClinicAccess: 'You do not have access to this clinic.',
    financialPin: 'Incorrect financial PIN',
    patientBlocked: '🚫 Client blocked by administration. Appointments cannot be booked until a superuser unblocks the chart.',
    patientBlockedShort: '🚫 Client blocked.',
    overlap: '🔒 Time slot conflict.',
    pastSchedule: '🔒 Cannot book in the past.',
    pastMove: '🔒 Cannot move appointments to the past.',
    phoneRequired: 'Enter a 10-digit phone number to create the chart.',
    patientFileError: (m) => `Chart error: ${m}`,
    missingData: 'Missing required fields.',
    connectionError: 'Connection error.',
    auditReadError: 'Error reading audit trail',
    patientNotFound: 'Client not found.',
    saleCancelled: 'Sale cancelled successfully.',
    saleCancelError: 'Error cancelling sale.',
    alreadyAtTime: 'Appointment is already at that time.',
    overlapLong: '🔒 Time conflict: another appointment overlaps this slot on that chamber.',
    completeDateTimeService: 'Complete date, time, and service.',
    moveError: (m) => `Error moving appointment: ${m}`,
    connectionErrorMsg: (m) => `Connection error: ${m}`,
    apptNotFound: 'Appointment not found.',
    alreadyNoShow: 'This appointment is already marked no-show.',
    alreadyExcused: 'This appointment is already marked excused absence.',
    statusUpdateError: 'Error updating status.',
    noFinishedAppts: 'This client has no completed appointments.',
    pastScheduleAppt: '🔒 Cannot book appointments in the past.',
    selectAttendant: 'Please select staff before signing.',
    notesSavedOk: 'Notes saved and synced successfully.',
    notesSaveError: 'Error saving notes.',
    notifySent: (detail) => `Instructions sent.\n${detail || ''}`,
    notifyFailed: (detail) => `Could not send all notifications.\n${detail || ''}`,
    nameRequired: 'Name is required.',
    cloneDetected: 'Client or phone already exists in the directory.',
    saveClientError: (m) => `Error saving client: ${m}`,
    selectDate: 'Select a date',
    saveError: (m) => `Error saving: ${m}`,
    cancelSaleConfirm: (name, price, sessions, service) =>
      `Are you sure? You are about to CANCEL the $${price} ticket and reverse ${sessions} sessions of ${service} for ${name}. This cannot be undone and will be audited.`,
    patientBlockedMove: '🚫 Client blocked by administration. Appointments cannot be moved or changed.',
    configSaveError: (m) => `Error saving settings: ${m}`,
    genericError: (m) => `Error: ${m}`,
    noShowConfirm: 'Mark NO-SHOW: 1 paid session will be deducted from the wallet. If none remain, debt will be recorded. Continue?',
    bitacoraNoBalanceConfirm: (nextDebt) =>
      `No paid sessions in wallet. Sealing the log will add 1 session to DEBT (total debt: ${nextDebt}). Continue?`,
    bitacoraSealedAuditAction: 'ATTENDANCE SEALED',
    bitacoraSealedAuditDetail: (attendant) => `Attendance sealed and signed by ${attendant}.`,
    refundConfirm: 'Cancel the charge and return the session to the client wallet?',
    deleteEquipment: 'Delete this equipment?',
    deleteEquipmentHasAppts: (n) => `This equipment has ${n} active appointment(s). It cannot be deleted. Hide it (inactive) or rename it to keep history.`,
    renameEquipmentConfirm: (oldName, newName, n) =>
      `Rename «${oldName}» to «${newName}» will update ${n} active appointment(s), blocks, and client wallets. Continue?`,
    renameEquipmentDone: (n) => `Done. ${n} appointment(s) were updated to the new equipment name.`,
    serviceDurationLocked: (n) =>
      `This equipment has ${n} active appointment(s). You cannot change duration or buffer — create a NEW service and keep this one for history.`,
    serviceRepairsDone: (n) => `Reassigned ${n} appointment(s) to the correct equipment name.`,
    deleteProtocol: 'Delete this protocol?',
    deleteRole: 'Delete this role?',
  },
};

const STATUS_LABELS = {
  es: {
    Agendado: 'Agendado',
    'Llegó': 'Llegó',
    'En Sesión': 'En Sesión',
    Finalizado: 'Finalizado',
    'No Asistió': 'No Asistió',
    'Falta Justificada': 'Falta Justificada',
    Devuelto: 'Devuelto',
    Cancelado: 'Cancelado',
  },
  en: {
    Agendado: 'Scheduled',
    'Llegó': 'Arrived',
    'En Sesión': 'In session',
    Finalizado: 'Completed',
    'No Asistió': 'No-show',
    'Falta Justificada': 'Excused',
    Devuelto: 'Refunded',
    Cancelado: 'Cancelled',
  },
};

const SESSION_PRESET_LABELS = {
  es: {
    standard: {
      label: 'Estándar — 60 min sesión (1h 30 en agenda)',
      selectLabel: 'Estándar 60 min · 1h 30 bloque',
      shortLabel: '60 min',
    },
    extended: {
      label: 'Extendida — 90 min sesión (3h en agenda)',
      selectLabel: 'Extendida 90 min · 3h bloque',
      shortLabel: '90 min',
    },
  },
  en: {
    standard: {
      label: 'Standard — 60 min session (1h 30 on schedule)',
      selectLabel: 'Standard 60 min · 1h 30 block',
      shortLabel: '60 min',
    },
    extended: {
      label: 'Extended — 90 min session (3h on schedule)',
      selectLabel: 'Extended 90 min · 3h block',
      shortLabel: '90 min',
    },
  },
};

export function translateCheckInStatus(locale, status) {
  if (!status) return '';
  return STATUS_LABELS[locale]?.[status] || STATUS_LABELS.es[status] || status;
}

export function getSessionPresetLabels(locale) {
  return SESSION_PRESET_LABELS[locale] || SESSION_PRESET_LABELS.es;
}

export function staffStrings(locale) {
  const loc = locale === 'en' ? 'en' : 'es';
  return {
    ...(STAFF[loc] || STAFF.es),
    modals: MODAL_COPY[loc] || MODAL_COPY.es,
    p: PAGES_COPY[loc] || PAGES_COPY.es,
  };
}

export function staffAlert(locale, key, ...args) {
  const pack = ALERTS[locale] || ALERTS.es;
  const val = pack[key];
  if (typeof val === 'function') return val(...args);
  return val || key;
}

export function portalNotesLabels(locale) {
  return locale === 'en'
    ? { portal: 'Portal', promoter: 'Promoter', promoterCode: 'Promoter (code)', comments: 'Comments' }
    : { portal: 'Portal', promoter: 'Promotor', promoterCode: 'Promotor (código)', comments: 'Comentarios' };
}
