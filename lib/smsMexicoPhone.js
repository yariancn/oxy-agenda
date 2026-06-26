import { toE164Phone } from './appointmentNotify.js';

/** 12-digit MSISDN: 52 + 10-digit mobile (402T / LabsMobile style). */
export function toMexicoSmsMsisdn(phone, clinicName = 'Guadalajara') {
  const e164 = toE164Phone(phone, clinicName);
  if (!e164) return '';
  const digits = e164.replace(/\D/g, '');
  if (digits.length === 10) return `52${digits}`;
  if (digits.length === 12 && digits.startsWith('52')) return digits;
  if (digits.length === 13 && digits.startsWith('521')) return `52${digits.slice(-10)}`;
  return digits.startsWith('52') ? digits : '';
}

/** 13-digit format: 521 + 10-digit mobile (SMS Masivos API). */
export function toMexicoSmsMasivosNumber(phone, clinicName = 'Guadalajara') {
  const msisdn = toMexicoSmsMsisdn(phone, clinicName);
  if (!msisdn || msisdn.length < 12) return '';
  return `521${msisdn.slice(-10)}`;
}
