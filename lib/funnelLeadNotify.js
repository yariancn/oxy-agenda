import { toE164Phone } from './appointmentNotify.js';
import { sendStaffTextMessages } from './clinicMessaging.js';
import { mergeStaffAlertRecipients } from './staffBookingAlert.js';
import { getSupabaseAdmin } from './supabaseAdmin.js';
import { sendFunnelVisitorEmail } from './funnelVisitorEmail.js';
import { hasRecentAgendaAppointment } from './funnelAgendaLookup.js';

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

  const isGetList = action === 'list';
  const res = await fetch(getFollowupUrl(), {
    method: isGetList ? 'GET' : 'POST',
    headers: {
      Authorization: `Bearer ${secret}`,
      'x-oxy-leads-secret': secret,
      ...(isGetList ? {} : { 'Content-Type': 'application/json' }),
    },
    ...(isGetList ? {} : { body: JSON.stringify({ action, ...payload }) }),
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

export async function markFunnelLeadBooked({
  email = '',
  phone = '',
  name = '',
  source = '',
} = {}) {
  const marked = await predictacoreFollowup('mark_booked', { email, phone });
  if (marked?.updated > 0) return marked;
  // Booking happened without a prior form lead (or mismatch) — still reflect it in Ads.
  return predictacoreFollowup('record_booking', {
    email,
    phone,
    name,
    source: source || 'oxy-agenda',
  });
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

  const mergedLead = {
    ...claimed.lead,
    name: lead.name || claimed.lead.name,
    email: lead.email || claimed.lead.email,
    phone: lead.phone || claimed.lead.phone,
    goal: lead.goal || claimed.lead.goal,
    source: lead.source || claimed.lead.source,
  };

  // Visitor nudge email (Resend) — independent of staff SMS.
  const visitorEmail = await sendFunnelVisitorEmail(mergedLead, 'nudge').catch((error) => ({
    ok: false,
    error: error?.message || 'visitor_email_failed',
  }));

  const phones = await resolveStaffPhones().catch(() => []);
  let sms = { ok: true, skipped: true, reason: 'no_recipients' };
  if (phones.length) {
    const smsBody = buildFunnelLeadSmsBody(mergedLead);
    sms = await sendStaffTextMessages({
      phones,
      smsBody,
      clinicName: CLINIC,
      locale: 'en',
    });
  }

  if (!sms?.ok && !visitorEmail?.ok) {
    await predictacoreFollowup('release_abandon', { id: String(claimed.lead.id) }).catch(() => null);
    return { ok: false, immediate: true, sms, visitorEmail, leadId: claimed.lead.id };
  }

  return {
    ok: true,
    immediate: true,
    sms,
    visitorEmail,
    leadId: claimed.lead.id,
  };
}

export async function processDueFunnelFollowups() {
  const listed = await predictacoreFollowup('list');
  if (listed?.skipped) return { ok: false, ...listed };
  if (!listed?.ok) return { ok: false, error: listed?.detail || listed?.error || 'list_failed' };

  const leads = Array.isArray(listed.leads) ? listed.leads : [];
  if (!leads.length) return { ok: true, sent: 0, checked: 0, emails: 0 };

  const phones = await resolveStaffPhones().catch(() => []);

  let sent = 0;
  let emails = 0;
  const failures = [];

  for (const lead of leads) {
    try {
      const visitorEmail = await sendFunnelVisitorEmail(lead, 'nudge').catch((error) => ({
        ok: false,
        error: error?.message || 'visitor_email_failed',
      }));
      if (visitorEmail?.ok) emails += 1;

      let sms = { ok: true, skipped: true, reason: 'no_recipients' };
      if (phones.length) {
        const smsBody = buildFunnelLeadSmsBody(lead);
        sms = await sendStaffTextMessages({
          phones,
          smsBody,
          clinicName: CLINIC,
          locale: 'en',
        });
      }

      if (!sms?.ok && !visitorEmail?.ok) {
        failures.push({
          id: lead.id,
          error: sms?.error || visitorEmail?.error || visitorEmail?.detail || 'followup_failed',
        });
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
    emails,
    failures: failures.length ? failures : undefined,
  };
}

/**
 * ~24h invitation email: verify Shenandoah appointments first, then Resend invite.
 */
export async function processDueFunnel24hEmails() {
  const listed = await predictacoreFollowup('list_24h');
  if (listed?.skipped) return { ok: false, ...listed };
  if (!listed?.ok) return { ok: false, error: listed?.detail || listed?.error || 'list_24h_failed' };

  const leads = Array.isArray(listed.leads) ? listed.leads : [];
  if (!leads.length) {
    return { ok: true, checked: 0, emailed: 0, markedBooked: 0 };
  }

  let emailed = 0;
  let markedBooked = 0;
  const failures = [];

  for (const lead of leads) {
    try {
      const agenda = await hasRecentAgendaAppointment({
        email: lead.email,
        phone: lead.phone,
      }).catch((error) => ({
        booked: false,
        error: error?.message || 'agenda_lookup_failed',
      }));

      if (agenda?.booked) {
        await predictacoreFollowup('mark_booked', {
          email: lead.email,
          phone: lead.phone,
        });
        markedBooked += 1;
        continue;
      }

      if (agenda?.error) {
        failures.push({ id: lead.id, error: agenda.error });
        continue;
      }

      const visitorEmail = await sendFunnelVisitorEmail(lead, 'day');
      if (visitorEmail?.skipped && visitorEmail.reason === 'no_email') {
        await predictacoreFollowup('mark_24h_sent', { id: String(lead.id) });
        continue;
      }
      if (!visitorEmail?.ok) {
        failures.push({
          id: lead.id,
          error: visitorEmail?.error || visitorEmail?.detail || visitorEmail?.reason || 'day_email_failed',
        });
        continue;
      }

      await predictacoreFollowup('mark_24h_sent', { id: String(lead.id) });
      emailed += 1;
    } catch (error) {
      failures.push({ id: lead.id, error: error?.message || 'day_followup_failed' });
    }
  }

  return {
    ok: failures.length === 0,
    checked: leads.length,
    emailed,
    markedBooked,
    failures: failures.length ? failures : undefined,
  };
}

/** Short (~20m) SMS/nudge + ~24h invitation email. */
export async function processAllFunnelFollowups() {
  const short = await processDueFunnelFollowups();
  const day = await processDueFunnel24hEmails();
  return {
    ok: Boolean(short?.ok) && Boolean(day?.ok),
    short,
    day,
  };
}
