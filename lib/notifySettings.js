export function resolveSessionInstructions(slotNotes, companyConfig = {}) {
  const fromSlot = String(slotNotes ?? '').trim();
  if (fromSlot) return fromSlot;
  return String(companyConfig.notify_session_default ?? '').trim();
}

export function getSessionInstructionsLabel(companyConfig = {}, locale = 'es') {
  const custom = String(companyConfig.notify_session_label ?? '').trim();
  if (custom) return custom;
  return locale === 'en' ? 'Instructions for your session' : 'Indicaciones para tu sesión';
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
