import { toE164Phone } from './appointmentNotify.js';
import { sendStaffTextMessages } from './clinicMessaging.js';
import { mergeStaffAlertRecipients } from './staffBookingAlert.js';
import { getSupabaseAdmin } from './supabaseAdmin.js';

const CLINIC = 'Shenandoah';
const DEFAULT_PREDICTACORE_OXY_LEADS_URL = 'https://predictacore.ai/ads/api/oxy/funnel-leads';
const DEFAULT_FOLLOWUP_URL = 'https://predictacore.ai/ads/api/oxy/funnel-leads/followup';

export function buildFunnelLeadSmsBody(lead) {
  const goal = lead.goal ? ` Goal: ${String(lead.goal).slice(0, 80)}` : '';
  return [
    'OxyHyperbaric funnel lead — left info but did not book.',
    `${lead.name}. ${lead.phone}. ${lead.email}.${goal}`,
    'Please call/text to help them schedule.',
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

function getLeadsSecret() {
  return String(process.env.FUNNEL_LEAD_SECRET || process.env.OXY_LEADS_SECRET || '').trim();
}

function getFollowupUrl() {
  return String(process.env.PREDICTACORE_OXY_LEADS_FOLLOWUP_URL || DEFAULT_FOLLOWUP_URL).trim();
}

async function persistLeadToPredictacore(lead) {
  const secret = getLeadsSecret();
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
  return { ok: Boolean(data.ok), id: data.id || null, duplicate: Boolean(data.duplicate), created: data.created };
}

async function predictacoreFollowup(action, payload = {}) {
  const secret = getLeadsSecret();
  if (!secret) return { ok: false, skipped: true, reason: 'no_secret' };

  const res = await fetch(getFollowupUrl(), {
    method: action === 'list' ? 'GET' : 'POST',
    headers: {
      Authorization: `Bearer ${secret}`,
      'x-oxy-leads-secret': secret,
      ...(action === 'list' ? {} : { 'Content-Type': 'application/json' }),
    },
    ...(action === 'list' ? {} : { body: JSON.stringify({ action, ...payload }) }),
  });

  if (!res.ok) {
    const detail = (await res.text().catch(() => '')).slice(0, 160);
    return { ok: false, status: res.status, detail };
  }
  return res.json().catch(() => ({ ok: false }));
}

async function resolveStaffPhones() {
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
  return phones;
}

/**
 * Register lead only — no SMS yet.
 * Prefer Worker → Predictacore persist as the single insert path.
 * This endpoint is kept for compatibility; Persist is idempotent (24h email/phone dedupe).
 * SMS is sent later by processDueFunnelFollowups / abandon if they do not book.
 */
export async function notifyFunnelLead(lead) {
  const persist = await persistLeadToPredictacore(lead).catch((error) => ({
    ok: false,
    error: error?.message || 'persist_failed',
  }));

  return {
    ok: Boolean(persist.ok),
    deferred: true,
    persist,
    duplicate: Boolean(persist?.duplicate),
    message: 'Lead saved. Staff SMS only if they do not book within the follow-up window.',
  };
}

export async function markFunnelLeadBooked({ email = '', phone = '' } = {}) {
  return predictacoreFollowup('mark_booked', { email, phone });
}

/**
 * Immediate staff SMS when the visitor leaves without booking (browser abandon beacon).
 */
export async function sendFunnelAbandonSms(lead = {}) {
  const email = String(lead.email || '').trim();
  const phone = String(lead.phone || '').trim();
  if (!email && !phone) {
    return { ok: false, error: 'email_or_phone_required' };
  }

  const claimed = await predictacoreFollowup('claim_abandon', { email, phone });
  if (claimed?.skipped) return { ok: false, ...claimed };
  if (!claimed?.ok) {
    return { ok: false, error: claimed?.detail || claimed?.error || 'claim_failed' };
  }
  if (!claimed.claimed || !claimed.lead) {
    return { ok: true, skipped: true, reason: 'already_handled' };
  }

  const phones = await resolveStaffPhones();
  if (!phones.length) {
    await predictacoreFollowup('release_abandon', { id: String(claimed.lead.id) }).catch(() => null);
    return { ok: false, error: 'no_recipients', claimed: true };
  }

  const smsBody = buildFunnelLeadSmsBody({
    ...claimed.lead,
    name: lead.name || claimed.lead.name,
    goal: lead.goal || claimed.lead.goal,
  });
  const sms = await sendStaffTextMessages({
    phones,
    smsBody,
    clinicName: CLINIC,
    locale: 'en',
  });

  if (!sms?.ok) {
    await predictacoreFollowup('release_abandon', { id: String(claimed.lead.id) }).catch(() => null);
    return { ok: false, immediate: true, sms, leadId: claimed.lead.id };
  }

  return {
    ok: true,
    immediate: true,
    sms,
    leadId: claimed.lead.id,
  };
}

export async function processDueFunnelFollowups() {
  const listed = await predictacoreFollowup('list');
  if (listed?.skipped) return { ok: false, ...listed };
  if (!listed?.ok) return { ok: false, error: listed?.detail || listed?.error || 'list_failed' };

  const leads = Array.isArray(listed.leads) ? listed.leads : [];
  if (!leads.length) return { ok: true, sent: 0, checked: 0 };

  const phones = await resolveStaffPhones();
  if (!phones.length) return { ok: false, error: 'no_recipients', checked: leads.length };

  let sent = 0;
  const failures = [];

  for (const lead of leads) {
    try {
      const smsBody = buildFunnelLeadSmsBody(lead);
      const sms = await sendStaffTextMessages({
        phones,
        smsBody,
        clinicName: CLINIC,
        locale: 'en',
      });
      if (!sms?.ok) {
        failures.push({ id: lead.id, error: sms?.error || 'sms_failed' });
        continue;
      }
      await predictacoreFollowup('mark_sent', { id: String(lead.id) });
      sent += 1;
    } catch (error) {
      failures.push({ id: lead.id, error: error?.message || 'send_failed' });
    }
  }

  return {
    ok: failures.length === 0,
    checked: leads.length,
    sent,
    failures: failures.length ? failures : undefined,
  };
}
