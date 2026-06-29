import { toMexicoSmsMsisdn } from './smsMexicoPhone.js';

const DEFAULT_API_URL = 'https://api.labsmobile.com/json/send';
const BALANCE_API_URL = 'https://api.labsmobile.com/json/balance';

function labsMobileAuthHeader(config) {
  return `Basic ${Buffer.from(`${config.username}:${config.apiToken}`).toString('base64')}`;
}

/** @returns {{ username: string, apiToken: string, apiUrl: string, sender: string, testMode: boolean } | null} */
export function getSmsLabsMobileConfig() {
  const username = String(
    process.env.LABSMOBILE_USERNAME || process.env.SMS_LABSMOBILE_USERNAME || '',
  ).trim();
  const apiToken = String(
    process.env.LABSMOBILE_API_TOKEN
      || process.env.LABSMOBILE_TOKEN
      || process.env.SMS_LABSMOBILE_API_TOKEN
      || '',
  ).trim();
  const apiUrl = String(
    process.env.LABSMOBILE_API_URL || DEFAULT_API_URL,
  ).trim();
  const sender = String(
    process.env.LABSMOBILE_SENDER || process.env.SMS_LABSMOBILE_SENDER || 'OXYGENDL',
  ).trim().slice(0, 11);
  const testMode = process.env.LABSMOBILE_TEST === '1'
    || process.env.LABSMOBILE_SANDBOX === '1'
    || process.env.SMS_LABSMOBILE_TEST === '1';

  if (!username || !apiToken) return null;
  return { username, apiToken, apiUrl, sender, testMode };
}

export function isSmsLabsMobileConfigured() {
  return Boolean(getSmsLabsMobileConfig());
}

export async function sendSmsLabsMobile({ to, body, clinicName = 'Guadalajara', forceTest = false }) {
  const config = getSmsLabsMobileConfig();
  if (!config) {
    return { ok: false, error: 'Missing LABSMOBILE credentials', channel: 'sms', provider: 'labsmobile' };
  }

  const msisdn = toMexicoSmsMsisdn(to, clinicName);
  if (!msisdn || msisdn.length < 12) {
    return { ok: false, error: 'Invalid Mexico phone number', channel: 'sms', provider: 'labsmobile' };
  }

  const payload = {
    message: String(body || '').slice(0, 1500),
    tpoa: config.sender,
    recipient: [{ msisdn }],
  };
  if (config.testMode || forceTest) payload.test = '1';

  const auth = labsMobileAuthHeader(config);

  let res;
  try {
    res = await fetch(config.apiUrl, {
      method: 'POST',
      headers: {
        Authorization: auth,
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache',
      },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    return {
      ok: false,
      error: err.message || 'SMS request failed',
      channel: 'sms',
      provider: 'labsmobile',
    };
  }

  const data = await res.json().catch(() => ({}));
  const code = data?.code != null ? String(data.code) : '';
  const ok = res.ok && (code === '0' || code === '');

  if (ok) {
    return { ok: true, channel: 'sms', provider: 'labsmobile', data };
  }

  const errMsg = data?.message || data?.error?.message || data?.error;
  return {
    ok: false,
    error: String(errMsg || JSON.stringify(data).slice(0, 200) || res.statusText),
    channel: 'sms',
    provider: 'labsmobile',
    status: res.status,
    code: code || undefined,
  };
}

/** @returns {{ ok: boolean, credits?: number, error?: string, data?: object }>} */
export async function fetchLabsMobileBalance() {
  const config = getSmsLabsMobileConfig();
  if (!config) {
    return { ok: false, error: 'Missing LABSMOBILE credentials' };
  }

  let res;
  try {
    res = await fetch(BALANCE_API_URL, {
      method: 'GET',
      headers: {
        Authorization: labsMobileAuthHeader(config),
        'Cache-Control': 'no-cache',
      },
    });
  } catch (err) {
    return { ok: false, error: err.message || 'Balance request failed' };
  }

  const data = await res.json().catch(() => ({}));
  const code = data?.code != null ? String(data.code) : '';
  const credits = Number(data?.credits);

  if (res.ok && (code === '0' || code === '') && Number.isFinite(credits)) {
    return { ok: true, credits, data };
  }

  return {
    ok: false,
    error: String(data?.message || JSON.stringify(data).slice(0, 200) || res.statusText),
    data,
  };
}
