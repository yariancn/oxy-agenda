import { toE164Phone } from './appointmentNotify.js';
import { sendStaffTextMessages } from './clinicMessaging.js';
import { mergeStaffAlertRecipients } from './staffBookingAlert.js';
import { getSupabaseAdmin } from './supabaseAdmin.js';

const CLINIC = 'Shenandoah';
const DEFAULT_PREDICTACORE_OXY_LEADS_URL = 'https://predictacore.ai/ads/api/oxy/funnel-leads';

export function buildFunnelLeadSmsBody(lead) {
  const goal = lead.goal ? ` Goal: ${String(lead.goal).slice(0, 80)}` : '';
  return [
    'OxyHyperbaric funnel lead — no online booking yet.',
    `${lead.name}. ${lead.phone}. ${lead.email}.${goal}`,
    'Follow up if they do not book on oxy-agenda.',
  ]
    .join(' ')
    .slice(0, 1500);
}

function parseFallbackPhones() {
  const raw = process.env.FUNNEL_LEAD_NOTIFY_PHONES || process.env.LEAD_NOTIFY_SMS_TO || '+17135913379';
  return String(raw)
    .split(/[,;\n]+/)
    .map((item) => toE164Phone(item.trim(), CLINIC))
    .filter(Boolean);
}

async function persistLeadToPredictacore(lead) {
  const secret = String(process.env.FUNNEL_LEAD_SECRET || process.env.OXY_LEADS_SECRET || '').trim();
  if (!secret) return { ok: false, skipped: true, reason: 'no_secret' };

  const url = String(
    process.env.PREDICTACORE_OXY_LEADS_URL || DEFAULT_PREDICTACORE_OXY_LEADS_URL,
  ).trim();

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${secret}`,
      'x-oxy-leads-secret': secret,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      event: 'funnel_lead',
      ...lead,
    }),
  });

  if (!res.ok) {
    const detail = (await res.text().catch(() => '')).slice(0, 160);
    return { ok: false, status: res.status, detail };
  }

  const data = await res.json().catch(() => ({}));
  return { ok: Boolean(data.ok), id: data.id || null };
}

export async function notifyFunnelLead(lead) {
  const supabase = getSupabaseAdmin(CLINIC);
  const [configRes, staffRes] = await Promise.all([
    supabase
      .from('company_config')
      .select('staff_alert_phones, staff_alert_emails, notify_staff_on_booking, clinic')
      .eq('clinic', CLINIC)
      .maybeSingle(),
    supabase.from('users_staff').select('phone, email, is_active, notify_on_booking'),
  ]);

  if (configRes.error) throw configRes.error;
  if (staffRes.error && !/users_staff|schema cache/i.test(staffRes.error.message || '')) {
    throw staffRes.error;
  }

  let { phones } = mergeStaffAlertRecipients(configRes.data || {}, staffRes.data || [], CLINIC);
  if (!phones.length) {
    phones = [...new Set(parseFallbackPhones())];
  }

  const persist = await persistLeadToPredictacore(lead).catch((error) => ({
    ok: false,
    error: error?.message || 'persist_failed',
  }));

  if (!phones.length) {
    return { ok: Boolean(persist.ok), error: 'no_recipients', channel: 'sms', persist };
  }

  const smsBody = buildFunnelLeadSmsBody(lead);
  const sms = await sendStaffTextMessages({
    phones,
    smsBody,
    clinicName: CLINIC,
    locale: 'en',
  });

  return {
    ...sms,
    ok: Boolean(sms?.ok || persist?.ok),
    persist,
  };
}
