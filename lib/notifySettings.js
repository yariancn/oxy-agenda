export function findServiceByEquipment(equipment, services = []) {
  const key = String(equipment || '').trim().toLowerCase();
  if (!key) return null;
  return (services || []).find(
    (s) => String(s.name || '').trim().toLowerCase() === key,
  ) || null;
}

export function resolveSessionInstructions(
  slotNotes,
  companyConfig = {},
  locale = 'es',
  { equipment = '', notifyType = 'booking', services = [] } = {},
) {
  const fromSlot = String(slotNotes ?? '').trim();
  if (fromSlot) return fromSlot;

  if (notifyType === 'first' && equipment) {
    const svc = findServiceByEquipment(equipment, services);
    const perService = String(svc?.first_session_notes ?? '').trim();
    if (perService) return perService;
  }

  const stored = String(companyConfig.notify_session_default ?? '').trim();
  if (locale === 'en') {
    if (!stored || stored === ES_SESSION_DEFAULT) return EN_SESSION_DEFAULT;
    return stored;
  }
  if (!stored) return ES_SESSION_DEFAULT;
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
};

export function getAutoNotifyBlockReason(companyConfig = {}, notifyType, locale = 'es') {
  const es = locale !== 'en';
  if (companyConfig.notify_on_booking === false) {
    return es
      ? 'Notificaciones automáticas desactivadas (master en Admin).'
      : 'Automatic notifications disabled (master switch in Admin).';
  }

  const typeKey = NOTIFY_TYPE_KEYS[notifyType];
  if (typeKey && companyConfig[typeKey] === false) {
    const labels = es
      ? { first: 'primera cita', booking: 'programación', reschedule: 'reprogramación', cancel: 'cancelación' }
      : { first: 'first appointment', booking: 'booking', reschedule: 'reschedule', cancel: 'cancellation' };
    return es
      ? `Notificaciones de ${labels[notifyType] || notifyType} desactivadas en Admin.`
      : `${labels[notifyType] || notifyType} notifications disabled in Admin.`;
  }

  return null;
}

export function isAutoNotifyEnabled(companyConfig = {}, notifyType, { manual = false } = {}) {
  if (manual) return true;
  return !getAutoNotifyBlockReason(companyConfig, notifyType);
}

export const NOTIFY_SETTING_FIELDS = [
  'notify_session_label',
  'notify_session_default',
  'notify_auto_first',
  'notify_auto_booking',
  'notify_auto_reschedule',
  'notify_auto_cancel',
  'notify_channel_email',
  'notify_channel_sms',
];

export function defaultNotifySettings(locale = 'es') {
  return {
    notify_session_label: locale === 'en' ? 'Instructions for your session' : 'Indicaciones para tu sesión',
    notify_session_default: locale === 'en'
      ? 'Avoid heavy meals 2 hours before your session.'
      : 'Evitar comidas pesadas 2 horas antes de la sesión.',
    notify_auto_first: true,
    notify_auto_booking: true,
    notify_auto_reschedule: true,
    notify_auto_cancel: true,
    notify_channel_email: true,
    notify_channel_sms: true,
    notify_staff_on_booking: false,
    staff_alert_phones: '',
    staff_alert_emails: '',
  };
}
