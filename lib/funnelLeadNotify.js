import { toE164Phone } from './appointmentNotify.js';
import { sendStaffTextMessages } from './clinicMessaging.js';
import { mergeStaffAlertRecipients } from './staffBookingAlert.js';
import { getSupabaseAdmin } from './supabaseAdmin.js';

const CLINIC = 'Shenandoah';

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

  if (!phones.length) {
    return { ok: false, error: 'no_recipients', channel: 'sms' };
  }

  const smsBody = buildFunnelLeadSmsBody(lead);
  return sendStaffTextMessages({
    phones,
    smsBody,
    clinicName: CLINIC,
    locale: 'en',
  });
}
