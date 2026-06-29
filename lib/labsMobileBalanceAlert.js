import { getSupabaseAdmin } from './supabaseAdmin.js';
import {
  fetchLabsMobileBalance,
  isSmsLabsMobileConfigured,
  sendSmsLabsMobile,
} from './smsLabsMobile.js';

const DEFAULT_THRESHOLD = 100;
const DEFAULT_ALERT_PHONE = '3328332686';
const ALERT_COOLDOWN_MS = 24 * 60 * 60 * 1000;

export function getLabsMobileLowBalanceThreshold() {
  const raw = Number(process.env.LABSMOBILE_LOW_BALANCE_THRESHOLD || DEFAULT_THRESHOLD);
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_THRESHOLD;
}

export function getLabsMobileAlertPhone() {
  return String(process.env.LABSMOBILE_ALERT_PHONE || DEFAULT_ALERT_PHONE).trim();
}

function shouldSendAlert(lastAlertAt) {
  if (!lastAlertAt) return true;
  const last = new Date(lastAlertAt).getTime();
  if (!Number.isFinite(last)) return true;
  return Date.now() - last >= ALERT_COOLDOWN_MS;
}

export async function runLabsMobileBalanceAlert() {
  if (!isSmsLabsMobileConfigured()) {
    return { ok: false, skipped: true, reason: 'labsmobile_not_configured' };
  }

  const balance = await fetchLabsMobileBalance();
  if (!balance.ok) {
    return { ok: false, error: balance.error || 'balance_check_failed' };
  }

  const threshold = getLabsMobileLowBalanceThreshold();
  const credits = balance.credits;
  const result = {
    ok: true,
    credits,
    threshold,
    alertSent: false,
  };

  if (credits > threshold) {
    return { ...result, skipped: true, reason: 'above_threshold' };
  }

  const supabase = getSupabaseAdmin('Guadalajara');
  const { data: configRow, error: configError } = await supabase
    .from('company_config')
    .select('id, sms_balance_alert_at')
    .eq('clinic', 'Guadalajara')
    .maybeSingle();

  const columnMissing = Boolean(configError && /sms_balance_alert_at|schema cache/i.test(configError.message || ''));
  if (configError && !columnMissing) {
    return { ...result, ok: false, error: configError.message };
  }

  const lastAlertAt = columnMissing ? null : (configRow?.sms_balance_alert_at || null);
  if (!shouldSendAlert(lastAlertAt)) {
    return { ...result, skipped: true, reason: 'cooldown', lastAlertAt };
  }

  const alertPhone = getLabsMobileAlertPhone();
  const message = `Oxygengdl agenda: quedan ${Math.floor(credits)} SMS en LabsMobile (umbral ${threshold}). Recarga saldo en websms.labsmobile.com para no interrumpir avisos de cita.`;

  const send = await sendSmsLabsMobile({
    to: alertPhone,
    body: message,
    clinicName: 'Guadalajara',
  });

  if (!send.ok) {
    return { ...result, ok: false, error: send.error, alertPhone };
  }

  const now = new Date().toISOString();
  if (configRow?.id && !columnMissing) {
    await supabase
      .from('company_config')
      .update({ sms_balance_alert_at: now })
      .eq('id', configRow.id);
  }

  return { ...result, alertSent: true, alertPhone, alertedAt: now };
}
