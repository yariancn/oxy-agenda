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

export function isAutoNotifyEnabled(companyConfig = {}, notifyType, { manual = false } = {}) {
  if (manual) return true;
  if (companyConfig.notify_on_booking === false) return false;

  const typeKey = {
    first: 'notify_auto_first',
    booking: 'notify_auto_booking',
    reschedule: 'notify_auto_reschedule',
    cancel: 'notify_auto_cancel',
  }[notifyType];

  if (!typeKey) return true;
  return companyConfig[typeKey] !== false;
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
  };
}
