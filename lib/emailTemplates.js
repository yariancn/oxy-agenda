import { buildLocationTemplateVars } from './clinicLocation.js';
import { patientHasPriorClinicVisits } from './patientFirstVisit.js';

export const NOTIFY_TYPES = ['first', 'booking', 'reschedule', 'cancel', 'reminder'];

export const EMAIL_TEMPLATE_FIELDS = {
  first: { subject: 'notify_subject_first', body: 'notify_body_first' },
  booking: { subject: 'notify_subject_booking', body: 'notify_body_booking' },
  reschedule: { subject: 'notify_subject_reschedule', body: 'notify_body_reschedule' },
  cancel: { subject: 'notify_subject_cancel', body: 'notify_body_cancel' },
  reminder: { subject: 'notify_subject_reminder', body: 'notify_body_reminder' },
};

export const EMAIL_EXTRA_INFO_FIELD = 'notify_extra_info';

const DEFAULTS_ES = {
  first: {
    subject: 'Bienvenido — tu primera cita en {{clinica}}',
    body: `Hola {{nombre}},

¡Gracias por confiar en nosotros! Tu primera cita quedó confirmada.

Recuerda llegar unos minutos antes y traer identificación oficial. Si tienes dudas antes de tu sesión, contáctanos.`,
  },
  booking: {
    subject: 'Cita confirmada — {{clinica}}',
    body: `Hola {{nombre}},

Tu cita quedó agendada correctamente. Te esperamos en la fecha y hora indicadas abajo.`,
  },
  reschedule: {
    subject: 'Cita reprogramada — {{clinica}}',
    body: `Hola {{nombre}},

Tu cita fue reprogramada. A continuación encontrarás la nueva fecha y hora.`,
  },
  cancel: {
    subject: 'Cita cancelada — {{clinica}}',
    body: `Hola {{nombre}},

Te confirmamos que tu cita fue cancelada. Si deseas agendar de nuevo, contáctanos con gusto.`,
  },
  reminder: {
    subject: 'Recordatorio de cita — {{clinica}}',
    body: `Hola {{nombre}},

Te recordamos tu cita próxima. Revisa fecha y hora abajo. Si no puedes asistir, avísanos con anticipación.`,
  },
  extraInfo: '',
};

const DEFAULTS_EN = {
  first: {
    subject: 'Welcome — your first appointment at {{clinica}}',
    body: `Hello {{nombre}},

Thank you for choosing us! Your first appointment is confirmed.

Please arrive a few minutes early and bring a valid ID. For any questions, please contact us at 7135913379.`,
  },
  booking: {
    subject: 'Appointment confirmed — {{clinica}}',
    body: `Hello {{nombre}},

Your appointment has been scheduled. See the details below.

For any questions, please contact us at 7135913379.`,
  },
  reschedule: {
    subject: 'Appointment rescheduled — {{clinica}}',
    body: `Hello {{nombre}},

Your appointment has been rescheduled. Your new date and time are below.

For any questions, please contact us at 7135913379.`,
  },
  cancel: {
    subject: 'Appointment cancelled — {{clinica}}',
    body: `Hello {{nombre}},

Your appointment has been cancelled. For any questions, or to book again, please contact us at 7135913379.`,
  },
  reminder: {
    subject: 'Appointment reminder — {{clinica}}',
    body: `Hello {{nombre}},

This is a reminder of your upcoming appointment. See the details below. For any questions, please contact us at 7135913379.`,
  },
  extraInfo: '',
};

export function defaultEmailTemplates(locale = 'es') {
  return locale === 'en' ? { ...DEFAULTS_EN } : { ...DEFAULTS_ES };
}

export function emptyEmailTemplateState(locale = 'es') {
  const d = defaultEmailTemplates(locale);
  return {
    notify_subject_first: d.first.subject,
    notify_body_first: d.first.body,
    notify_subject_booking: d.booking.subject,
    notify_body_booking: d.booking.body,
    notify_subject_reschedule: d.reschedule.subject,
    notify_body_reschedule: d.reschedule.body,
    notify_subject_cancel: d.cancel.subject,
    notify_body_cancel: d.cancel.body,
    notify_subject_reminder: d.reminder.subject,
    notify_body_reminder: d.reminder.body,
    notify_extra_info: d.extraInfo,
  };
}

export function mergeEmailTemplates(config = {}, locale = 'es') {
  const defaultsEs = defaultEmailTemplates('es');
  const defaultsEn = defaultEmailTemplates('en');
  const defaults = locale === 'en' ? defaultsEn : defaultsEs;

  const pick = (key, fallback, esFallback) => {
    const v = String(config[key] ?? '').trim();
    if (!v) return fallback;
    if (locale === 'en' && esFallback && v === esFallback) return fallback;
    return v;
  };

  return {
    first: {
      subject: pick('notify_subject_first', defaults.first.subject, defaultsEs.first.subject),
      body: pick('notify_body_first', defaults.first.body, defaultsEs.first.body),
    },
    booking: {
      subject: pick('notify_subject_booking', defaults.booking.subject, defaultsEs.booking.subject),
      body: pick('notify_body_booking', defaults.booking.body, defaultsEs.booking.body),
    },
    reschedule: {
      subject: pick('notify_subject_reschedule', defaults.reschedule.subject, defaultsEs.reschedule.subject),
      body: pick('notify_body_reschedule', defaults.reschedule.body, defaultsEs.reschedule.body),
    },
    cancel: {
      subject: pick('notify_subject_cancel', defaults.cancel.subject, defaultsEs.cancel.subject),
      body: pick('notify_body_cancel', defaults.cancel.body, defaultsEs.cancel.body),
    },
    reminder: {
      subject: pick('notify_subject_reminder', defaults.reminder.subject, defaultsEs.reminder.subject),
      body: pick('notify_body_reminder', defaults.reminder.body, defaultsEs.reminder.body),
    },
    extraInfo: pick('notify_extra_info', defaults.extraInfo, defaultsEs.extraInfo),
  };
}

export function buildTemplateVars({
  patientName,
  clinicDisplayName,
  clinicName,
  date,
  time,
  equipment,
  instructions = '',
  address = '',
  mapsUrl = '',
  clinicPhone = '',
  formattedDate,
}) {
  const locationVars = buildLocationTemplateVars({ address, mapsUrl });
  return {
    nombre: patientName || '',
    patientName: patientName || '',
    clinica: clinicDisplayName || clinicName || '',
    clinicName: clinicDisplayName || clinicName || '',
    fecha: formattedDate || date || '',
    date: formattedDate || date || '',
    hora: time || '',
    time: time || '',
    servicio: equipment || '',
    service: equipment || '',
    ...locationVars,
    telefono: clinicPhone || '',
    phone: clinicPhone || '',
    instrucciones: String(instructions || '').trim(),
    instructions: String(instructions || '').trim(),
  };
}

export function applyEmailTemplate(template, vars) {
  if (!template) return '';
  return String(template).replace(/\{\{\s*(\w+)\s*\}\}/g, (_, key) => {
    const value = vars[key];
    return value != null ? String(value) : '';
  });
}

export function resolveAppointmentNotifyType({
  notifyReason,
  isNewPatient,
  patientName,
  appointments = [],
  excludeAppointmentId,
  normalize = (s) => String(s || '').trim().toLowerCase(),
}) {
  if (notifyReason === 'cancel') return 'cancel';
  if (notifyReason === 'reschedule') return 'reschedule';
  if (isNewPatient) return 'first';

  const key = normalize(patientName);
  if (!key) return 'booking';

  const prior = appointments.filter((a) => {
    if (excludeAppointmentId && a.id === excludeAppointmentId) return false;
    if (a.check_in_status === 'Cancelado') return false;
    return normalize(a.patient) === key;
  });

  return prior.length === 0 ? 'first' : 'booking';
}

/**
 * Tipo de aviso efectivo: primera cita (plantilla completa de la clínica) cuando
 * es la primera sesión del paciente en la clínica (no por equipo/cámara).
 */
export function resolveEffectiveNotifyType({
  notifyReason,
  isNewPatient,
  patientName,
  equipment,
  appointments = [],
  excludeAppointmentId,
  fullDate = null,
  time = null,
  normalize = (s) => String(s || '').trim().toLowerCase(),
}) {
  if (notifyReason === 'cancel') return 'cancel';
  if (notifyReason === 'reschedule') return 'reschedule';

  if (isFirstSessionAppointment({
    isNewPatient,
    patientName,
    equipment,
    appointments,
    excludeAppointmentId,
    fullDate,
    time,
    normalize,
  })) {
    return 'first';
  }

  return resolveAppointmentNotifyType({
    notifyReason,
    isNewPatient,
    patientName,
    appointments,
    excludeAppointmentId,
    normalize,
  });
}

/**
 * ¿Primera sesión del paciente en la clínica?
 * Only appointments that start *before* this one count as prior — a later Friday
 * booking must not block today’s first-visit confirmation SMS.
 */
export function isFirstSessionAppointment({
  isNewPatient: _isNewPatient,
  patientName,
  patientId = null,
  equipment: _equipment,
  appointments = [],
  excludeAppointmentId,
  fullDate = null,
  time = null,
  normalize = (s) => String(s || '').trim().toLowerCase(),
}) {
  return !patientHasPriorClinicVisits({
    patientName,
    patientId,
    appointments,
    excludeAppointmentId,
    beforeFullDate: fullDate,
    beforeTime: time,
    normalize,
  });
}

export const EMAIL_PLACEHOLDER_HINT =
  '{{nombre}} {{fecha}} {{hora}} {{servicio}} {{clinica}} {{direccion}} {{ubicacion_link}} {{direccion_link}} {{telefono}} {{instrucciones}}';
