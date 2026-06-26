import { toMexicoSmsMasivosNumber } from './smsMexicoPhone.js';

const DEFAULT_API_URL = 'https://api.smsmasivos.com.mx/sms/send';

/** @returns {{ apiKey: string, apiUrl: string, sandbox: boolean } | null} */
export function getSmsMasivosConfig() {
  const apiKey = String(
    process.env.SMS_MASIVOS_API_KEY || process.env.SMS_MX_API_KEY || '',
  ).trim();
  const apiUrl = String(process.env.SMS_MASIVOS_API_URL || DEFAULT_API_URL).trim();
  const sandbox = process.env.SMS_MASIVOS_SANDBOX === '1' || process.env.SMS_MX_SANDBOX === '1';

  if (!apiKey) return null;
  return { apiKey, apiUrl, sandbox };
}

export function isSmsMasivosConfigured() {
  return Boolean(getSmsMasivosConfig());
}

export async function sendSmsMasivos({ to, body, clinicName = 'Guadalajara' }) {
  const config = getSmsMasivosConfig();
  if (!config) {
    return { ok: false, error: 'Missing SMS_MASIVOS_API_KEY', channel: 'sms', provider: 'smsmasivos' };
  }

  const numbers = toMexicoSmsMasivosNumber(to, clinicName);
  if (!numbers || numbers.length < 12) {
    return { ok: false, error: 'Invalid Mexico phone number', channel: 'sms', provider: 'smsmasivos' };
  }

  const payload = {
    message: String(body || '').slice(0, 1500),
    numbers,
  };
  if (config.sandbox) payload.sandbox = true;

  let res;
  try {
    res = await fetch(config.apiUrl, {
      method: 'POST',
      headers: {
        apikey: config.apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    return {
      ok: false,
      error: err.message || 'SMS request failed',
      channel: 'sms',
      provider: 'smsmasivos',
    };
  }

  const data = await res.json().catch(() => ({}));
  const success = data?.success === true || (res.ok && !data?.error);

  if (success) {
    return { ok: true, channel: 'sms', provider: 'smsmasivos', data };
  }

  const errMsg = data?.message || data?.error || data?.errors?.[0]?.message;
  return {
    ok: false,
    error: String(errMsg || JSON.stringify(data).slice(0, 200) || res.statusText),
    channel: 'sms',
    provider: 'smsmasivos',
    status: res.status,
  };
}
