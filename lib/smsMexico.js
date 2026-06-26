import { isSms402tConfigured, sendSms402t } from './sms402t.js';
import { isSmsMasivosConfigured, sendSmsMasivos } from './smsMasivos.js';
import { isSmsLabsMobileConfigured, sendSmsLabsMobile } from './smsLabsMobile.js';

export { toMexicoSmsMsisdn, toMexicoSmsMasivosNumber } from './smsMexicoPhone.js';

/** @returns {'labsmobile' | 'smsmasivos' | '402t' | null} */
export function getMexicoSmsProvider() {
  const forced = String(process.env.SMS_MX_PROVIDER || '').trim().toLowerCase();
  if (forced === 'labsmobile' && isSmsLabsMobileConfigured()) return 'labsmobile';
  if (forced === 'smsmasivos' && isSmsMasivosConfigured()) return 'smsmasivos';
  if (forced === '402t' && isSms402tConfigured()) return '402t';
  if (forced && forced !== 'auto') return null;

  if (isSmsLabsMobileConfigured()) return 'labsmobile';
  if (isSmsMasivosConfigured()) return 'smsmasivos';
  if (isSms402tConfigured()) return '402t';
  return null;
}

export function isMexicoSmsConfigured() {
  return Boolean(getMexicoSmsProvider());
}

export async function sendMexicoSms({ to, body, clinicName = 'Guadalajara' }) {
  const provider = getMexicoSmsProvider();
  if (provider === 'labsmobile') {
    return sendSmsLabsMobile({ to, body, clinicName });
  }
  if (provider === 'smsmasivos') {
    return sendSmsMasivos({ to, body, clinicName });
  }
  if (provider === '402t') {
    return sendSms402t({ to, body });
  }
  return { ok: false, error: 'not_configured', channel: 'sms', skipped: true };
}

export function mexicoSmsProviderLabel(locale = 'es') {
  const provider = getMexicoSmsProvider();
  if (provider === 'labsmobile') return 'LabsMobile';
  if (provider === 'smsmasivos') return 'SMS Masivos';
  if (provider === '402t') return '402T';
  return locale === 'en' ? 'SMS (Mexico)' : 'SMS (México)';
}
