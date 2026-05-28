/** Idioma por clínica: TX → inglés, GDL → español */
export function localeForClinic(clinic) {
  return clinic === 'Shenandoah' ? 'en' : 'es';
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

export function buildCalendarWeek(locale, currentDate) {
  const start = new Date(currentDate);
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
      fullDate: d.toISOString().split('T')[0],
    };
  });
}

export const PUBLIC_BOOKING_COPY = {
  es: {
    staff: 'Staff · NIP',
    back: 'Volver',
    step1Title: '¿Qué servicio buscas?',
    step2Title: 'Selecciona fecha y hora',
    slotLegendAvailable: 'Disponible',
    slotLegendOccupied: 'Ocupado',
    slotLegendBlocked: 'Bloqueado',
    noSlotsDay: 'No hay horarios para este día. Prueba otra fecha.',
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
    phoneRule: 'Se requiere un número de 10 dígitos para confirmar.',
    doneTitle: '¡Cita confirmada!',
    doneBody: 'Te esperamos en la clínica. Revisa tu correo si lo indicaste.',
    bookAnother: 'Agendar otra cita',
    phoneError: '⚠️ El número celular debe tener exactamente 10 dígitos.',
    genericError: 'Error al confirmar la cita.',
    loading: 'Cargando horarios…',
    bookingWith: (name) => `Agenda tu cita con ${name}`,
    notesSaved: 'Tus comentarios quedaron guardados en la nota de la cita.',
    promoterPending: 'pendiente de alta',
  },
  en: {
    staff: 'Staff · PIN',
    back: 'Back',
    step1Title: 'What service do you need?',
    step2Title: 'Pick date and time',
    slotLegendAvailable: 'Available',
    slotLegendOccupied: 'Booked',
    slotLegendBlocked: 'Blocked',
    noSlotsDay: 'No time slots for this day. Try another date.',
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
    phoneRule: 'A 10-digit phone number is required.',
    doneTitle: 'Appointment confirmed!',
    doneBody: 'We look forward to seeing you at the clinic.',
    bookAnother: 'Book another',
    phoneError: '⚠️ Phone number must be exactly 10 digits.',
    genericError: 'Could not confirm the appointment.',
    loading: 'Loading schedule…',
    bookingWith: (name) => `Book your appointment with ${name}`,
    notesSaved: 'Your notes were saved on the appointment.',
    promoterPending: 'pending registration',
  },
};

export const PUBLIC_SLOT_STATUS = {
  es: { occupied: 'Ocupado', blocked: 'Bloqueado', too_soon: '—' },
  en: { occupied: 'Booked', blocked: 'Blocked', too_soon: '—' },
};

const STAFF = {
  es: {
    loginTitle: '🔒 Acceso',
    loginHint: 'Ingresa tu NIP de 6 dígitos',
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
    time: 'Hora',
    zoom: 'Zoom',
    allEquipment: 'Todos',
    blockSlot: 'Bloquear Espacio',
    directory: 'Directorio',
    newPatient: 'Nuevo Paciente',
    searchPatients: '🔍 Buscar por nombre o teléfono...',
    noPhone: 'Sin teléfono',
    sessions: 'SESIONES',
    chart: 'Expediente',
    schedule: 'Agendar',
    noPatients: 'No se encontraron clientes.',
    clinicGdl: '🇲🇽 Guadalajara',
    clinicTx: '🇺🇸 Shenandoah, TX',
    ariaNewAppt: 'Nueva cita',
  },
  en: {
    loginTitle: '🔒 Sign in',
    loginHint: 'Enter your 6-digit PIN',
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
    time: 'Time',
    zoom: 'Zoom',
    allEquipment: 'All',
    blockSlot: 'Block time',
    directory: 'Directory',
    newPatient: 'New client',
    searchPatients: '🔍 Search by name or phone...',
    noPhone: 'No phone',
    sessions: 'SESSIONS',
    chart: 'Chart',
    schedule: 'Book',
    noPatients: 'No clients found.',
    clinicGdl: '🇲🇽 Guadalajara',
    clinicTx: '🇺🇸 Shenandoah, TX',
    ariaNewAppt: 'New appointment',
  },
};

const ALERTS = {
  es: {
    pinInvalid: 'PIN incorrecto o usuario inactivo',
    loginFailed: 'No se pudo verificar el acceso. Intenta de nuevo.',
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
  },
  en: {
    pinInvalid: 'Incorrect PIN or inactive user',
    loginFailed: 'Could not verify access. Try again.',
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
  },
};

export function staffStrings(locale) {
  return STAFF[locale] || STAFF.es;
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
