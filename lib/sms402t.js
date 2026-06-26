import { toMexicoSmsMsisdn } from './smsMexicoPhone.js';

export { toMexicoSmsMsisdn };

/** @returns {{ username: string, apiToken: string, apiUrl: string, sender: string, testMode: boolean } | null} */
export function getSms402tConfig() {
  const username = String(process.env.SMS_402T_USERNAME || '').trim();
  const apiToken = String(
    process.env.SMS_402T_API_TOKEN || process.env.SMS_402T_API_KEY || '',
  ).trim();
  const apiUrl = String(process.env.SMS_402T_API_URL || '').trim();
  const sender = String(process.env.SMS_402T_SENDER || 'OXYGENDL').trim().slice(0, 11);
  const testMode = process.env.SMS_402T_TEST === '1' || process.env.SMS_402T_SANDBOX === '1';

  if (!username || !apiToken || !apiUrl) return null;
  return { username, apiToken, apiUrl, sender, testMode };
}

export function isSms402tConfigured() {
  return Boolean(getSms402tConfig());
}

export async function sendSms402t({ to, body }) {
  const config = getSms402tConfig();
  if (!config) {
    return { ok: false, error: 'Missing SMS_402T credentials', channel: 'sms', provider: '402t' };
  }

  const msisdn = toMexicoSmsMsisdn(to);
  if (!msisdn || msisdn.length < 12) {
    return { ok: false, error: 'Invalid Mexico phone number', channel: 'sms', provider: '402t' };
  }

  const payload = {
    message: String(body || '').slice(0, 1500),
    tpoa: config.sender,
    recipient: [{ msisdn }],
  };
  if (config.testMode) payload.test = '1';

  const auth = Buffer.from(`${config.username}:${config.apiToken}`).toString('base64');

  let res;
  try {
    res = await fetch(config.apiUrl, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${auth}`,
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
      provider: '402t',
    };
  }

  const data = await res.json().catch(() => ({}));
  const topError = data?.error?.message || data?.error || data?.message;

  if (res.ok && !topError) {
    return { ok: true, channel: 'sms', provider: '402t', data };
  }

  return {
    ok: false,
    error: String(topError || JSON.stringify(data).slice(0, 200) || res.statusText),
    channel: 'sms',
    provider: '402t',
    status: res.status,
  };
}
