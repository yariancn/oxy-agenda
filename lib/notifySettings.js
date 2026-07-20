import { isShenandoah } from './clinicRegistry.js';

export const GDL_SESSION_URL = 'https://oxygengdl.com/indicaciones-para-sesiones/';
export const HOUSTON_SESSION_URL = 'https://oxyhyperbaric.com/session-instructions/';

/** URL editable a la página de indicaciones, según clínica. */
export function getSessionInstructionsUrl(companyConfig = {}, clinicName = '') {
  const custom = String(companyConfig.notify_session_url ?? '').trim();
  if (custom) return custom;
  return isShenandoah(clinicName) ? HOUSTON_SESSION_URL : GDL_SESSION_URL;
}

export function findServiceByEquipment(equipment, services = []) {
  const key = String(equipment || '').trim().toLowerCase();
  if (!key) return null;
  return (services || []).find(
    (s) => String(s.name || '').trim().toLowerCase() === key,
  ) || null;
}

/** Texto vacío o marcador sin contenido real (no mostrar bloque amarillo). */
export function isMeaningfulSessionInstruction(text) {
  const trimmed = String(text || '').trim();
  if (!trimmed) return false;
  return !/^[.\-–—_]+$/.test(trimmed);
}

export function resolveSessionInstructions(
  companyConfig = {},
  locale = 'es',
  { equipment = '', services = [], isFirstSession = false } = {},
) {
  // Las notas de primera sesión solo se envían cuando el paciente es nuevo en la clínica.
  // El resto de mensajes (programación, reprogramación, cancelación) no llevan notas.
  if (!isFirstSession) return '';

  // Override por equipo: si el equipo define sus propias notas de primera
  // sesión (ej. Red Light), esas sustituyen a las generales.
  if (equipment) {
    const svc = findServiceByEquipment(equipment, services);
    if (svc?.use_custom_notes) {
      const perService = String(svc?.first_session_notes ?? '').trim();
      if (isMeaningfulSessionInstruction(perService)) return perService;
    }
  }

  const stored = String(companyConfig.notify_session_default ?? '').trim();
  if (locale === 'en') {
    if (!isMeaningfulSessionInstruction(stored)) return '';
    if (stored === ES_SESSION_DEFAULT) return EN_SESSION_DEFAULT;
    return stored;
  }
  if (!isMeaningfulSessionInstruction(stored)) return ES_SESSION_DEFAULT;
  return stored;
}

export const ES_TICKET_DEFAULT = 'Gracias por su preferencia';
export const EN_TICKET_DEFAULT = 'Thank you for choosing us';
export const ES_SESSION_DEFAULT = 'Evitar comidas pesadas 2 horas antes de la sesión.';
export const EN_SESSION_DEFAULT = 'Avoid heavy meals 2 hours before your session.';
export const ES_SESSION_LABEL = 'Indicaciones para tu sesión';
export const EN_SESSION_LABEL = 'Instructions for your session';

export function getSessionInstructionsLabel(companyConfig = {}, locale = 'es') {
  const custom = String(companyConfig.notify_session_label ?? '').trim();
  if (locale === 'en') {
    if (!custom || custom === ES_SESSION_LABEL) return EN_SESSION_LABEL;
    return custom;
  }
  if (!custom) return ES_SESSION_LABEL;
  return custom;
}

export function resolveTicketMessage(ticketMessage = '', locale = 'es') {
  const stored = String(ticketMessage || '').trim();
  if (locale === 'en') {
    if (!stored || stored === ES_TICKET_DEFAULT) return EN_TICKET_DEFAULT;
    return stored;
  }
  if (!stored) return ES_TICKET_DEFAULT;
  return stored;
}

export function localizeNotifyFooterText({ instructions = '', instructionsLabel = '', ticketMessage = '', locale = 'es' } = {}) {
  const trimmedInstructions = String(instructions || '').trim();
  const localizedInstructions = locale === 'en' && trimmedInstructions === ES_SESSION_DEFAULT
    ? EN_SESSION_DEFAULT
    : trimmedInstructions;

  const trimmedLabel = String(instructionsLabel || '').trim();
  const localizedLabel = locale === 'en' && (!trimmedLabel || trimmedLabel === ES_SESSION_LABEL)
    ? EN_SESSION_LABEL
    : (trimmedLabel || (locale === 'en' ? EN_SESSION_LABEL : ES_SESSION_LABEL));

  return {
    instructions: localizedInstructions,
    instructionsLabel: localizedLabel,
    ticketMessage: resolveTicketMessage(ticketMessage, locale),
  };
}

const NOTIFY_TYPE_KEYS = {
  first: 'notify_auto_first',
  booking: 'notify_auto_booking',
  reschedule: 'notify_auto_reschedule',
  cancel: 'notify_auto_cancel',
  reminder: 'notify_auto_reminder',
};

const NOTIFY_TYPES = ['first', 'booking', 'reschedule', 'cancel', 'reminder'];

export function normalizeNotifyType(notifyType = 'booking') {
  return NOTIFY_TYPES.includes(notifyType) ? notifyType : 'booking';
}

/**
 * Clinic-wide channel kill-switches + per-event Correo/SMS.
 * First appointment (`first`) always uses both email and SMS when clinic-wide allows.
 * Prefer resolveNotifyChannelsForPatient when a patient record is available —
 * patient prefers_* override per-event Admin → Messages checkboxes (except first).
 */
export function resolveNotifyChannels(companyConfig = {}, notifyType = 'booking') {
  const type = normalizeNotifyType(notifyType);
  const clinicEmail = companyConfig.notify_channel_email !== false;
  const clinicSms = companyConfig.notify_channel_sms !== false;
  if (type === 'first') {
    return {
      sendEmail: clinicEmail,
      sendSms: clinicSms,
    };
  }
  const useEmail = companyConfig[`notify_use_email_${type}`] !== false;
  const useSms = companyConfig[`notify_use_sms_${type}`] !== false;
  return {
    sendEmail: clinicEmail && useEmail,
    sendSms: clinicSms && useSms,
  };
}

/**
 * Patient notification prefs dominate Admin → Messages per-event Correo/SMS.
 * Exception: first appointment always sends both SMS and email (clinic-wide kills still apply).
 * Example: Admin set reminder to email-only, but patient has SMS checked → SMS is sent.
 * Opt-out (prefers_* === false) blocks that channel for non-first notices.
 * Clinic-wide "Permitir correo/SMS" remain hard kill-switches.
 */
export function resolveNotifyChannelsForPatient(
  companyConfig = {},
  notifyType = 'booking',
  { prefers_email, prefers_sms } = {},
) {
  const type = normalizeNotifyType(notifyType);
  const clinicWideEmail = companyConfig.notify_channel_email !== false;
  const clinicWideSms = companyConfig.notify_channel_sms !== false;

  // Primera cita: siempre correo + SMS (si la clínica tiene el canal permitido).
  if (type === 'first') {
    return {
      sendEmail: clinicWideEmail,
      sendSms: clinicWideSms,
      clinicDefault: resolveNotifyChannels(companyConfig, type),
    };
  }

  const wantsEmail = prefers_email !== false;
  const wantsSms = prefers_sms !== false;
  return {
    sendEmail: clinicWideEmail && wantsEmail,
    sendSms: clinicWideSms && wantsSms,
    // Keep clinic defaults for UI/diagnostics (what Admin configured for the event).
    clinicDefault: resolveNotifyChannels(companyConfig, type),
  };
}

export function getAutoNotifyBlockReason(companyConfig = {}, notifyType, locale = 'es') {
  const es = locale !== 'en';
  if (companyConfig.notify_on_booking === false) {
    return es
      ? 'Notificaciones automáticas desactivadas (master en Admin).'
      : 'Automatic notifications disabled (master switch in Admin).';
  }

  const type = normalizeNotifyType(notifyType);
  const typeKey = NOTIFY_TYPE_KEYS[type];
  if (typeKey) {
    // Reminder is opt-in (default off). Other types stay on unless explicitly false.
    const disabled = type === 'reminder'
      ? companyConfig[typeKey] !== true
      : companyConfig[typeKey] === false;
    if (disabled) {
      const labels = es
        ? { first: 'primera cita', booking: 'programación', reschedule: 'reprogramación', cancel: 'cancelación', reminder: 'recordatorio' }
        : { first: 'first appointment', booking: 'booking', reschedule: 'reschedule', cancel: 'cancellation', reminder: 'reminder' };
      return es
        ? `Notificaciones de ${labels[type] || type} desactivadas en Admin.`
        : `${labels[type] || type} notifications disabled in Admin.`;
    }
  }

  // Per-event Correo/SMS are defaults only; patient prefs can still enable a channel.
  // Block only when clinic-wide email AND SMS are both off.
  const clinicWideEmail = companyConfig.notify_channel_email !== false;
  const clinicWideSms = companyConfig.notify_channel_sms !== false;
  if (!clinicWideEmail && !clinicWideSms) {
    return es
      ? 'Permitir correo y Permitir SMS están apagados en Admin → Mensajes.'
      : 'Allow email and Allow SMS are both off in Admin → Messages.';
  }

  return null;
}

export function isAutoNotifyEnabled(companyConfig = {}, notifyType, { manual = false } = {}) {
  if (manual) return true;
  return !getAutoNotifyBlockReason(companyConfig, notifyType);
}

export const SMS_INTRO_FIELDS = {
  first: 'notify_sms_first',
  booking: 'notify_sms_booking',
  reschedule: 'notify_sms_reschedule',
  cancel: 'notify_sms_cancel',
  reminder: 'notify_sms_reminder',
};

/** Saludo/intro editable del SMS por evento. Fecha, hora y servicio se agregan solos. */
export function defaultSmsIntros(locale = 'es') {
  if (locale === 'en') {
    return {
      first: 'Hi {{nombre}}, first appointment at {{clinica}}.',
      booking: 'Hi {{nombre}}, appointment confirmed at {{clinica}}.',
      reschedule: 'Hi {{nombre}}, appointment rescheduled at {{clinica}}.',
      cancel: 'Hi {{nombre}}, your appointment at {{clinica}} was cancelled.',
      reminder: 'Hi {{nombre}}, reminder of your appointment at {{clinica}}.',
    };
  }
  return {
    first: 'Hola {{nombre}}, primera cita en {{clinica}}.',
    booking: 'Hola {{nombre}}, cita confirmada en {{clinica}}.',
    reschedule: 'Hola {{nombre}}, cita reprogramada en {{clinica}}.',
    cancel: 'Hola {{nombre}}, tu cita en {{clinica}} fue cancelada.',
    reminder: 'Hola {{nombre}}, recordatorio de tu cita en {{clinica}}.',
  };
}

export const NOTIFY_SETTING_FIELDS = [
  'notify_session_label',
  'notify_session_default',
  'notify_session_url',
  'notify_auto_first',
  'notify_auto_booking',
  'notify_auto_reschedule',
  'notify_auto_cancel',
  'notify_auto_reminder',
  'notify_channel_email',
  'notify_channel_sms',
  'notify_use_email_first',
  'notify_use_sms_first',
  'notify_use_email_booking',
  'notify_use_sms_booking',
  'notify_use_email_reschedule',
  'notify_use_sms_reschedule',
  'notify_use_email_cancel',
  'notify_use_sms_cancel',
  'notify_use_email_reminder',
  'notify_use_sms_reminder',
  'notify_sms_first',
  'notify_sms_booking',
  'notify_sms_reschedule',
  'notify_sms_cancel',
  'notify_sms_reminder',
];

export function defaultNotifySettings(locale = 'es') {
  const smsIntros = defaultSmsIntros(locale);
  return {
    notify_session_label: locale === 'en' ? 'Instructions for your session' : 'Indicaciones para tu sesión',
    notify_session_default: locale === 'en'
      ? 'Avoid heavy meals 2 hours before your session.'
      : 'Evitar comidas pesadas 2 horas antes de la sesión.',
    notify_session_url: locale === 'en' ? HOUSTON_SESSION_URL : GDL_SESSION_URL,
    notify_auto_first: true,
    notify_auto_booking: true,
    notify_auto_reschedule: true,
    notify_auto_cancel: true,
    notify_auto_reminder: false,
    notify_channel_email: true,
    notify_channel_sms: true,
    notify_use_email_first: true,
    notify_use_sms_first: true,
    notify_use_email_booking: true,
    notify_use_sms_booking: true,
    notify_use_email_reschedule: true,
    notify_use_sms_reschedule: true,
    notify_use_email_cancel: true,
    notify_use_sms_cancel: true,
    notify_use_email_reminder: true,
    notify_use_sms_reminder: true,
    notify_sms_first: smsIntros.first,
    notify_sms_booking: smsIntros.booking,
    notify_sms_reschedule: smsIntros.reschedule,
    notify_sms_cancel: smsIntros.cancel,
    notify_sms_reminder: smsIntros.reminder,
    notify_staff_on_booking: false,
    staff_alert_first_sessions_only: false,
    staff_alert_phones: '',
    staff_alert_emails: '',
  };
}
