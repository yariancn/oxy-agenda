import { getResendApiKey, getResendFromAddress } from './resendConfig.js';

const CLINIC = 'Shenandoah';
const DEFAULT_PHONE = '(713) 591-3379';

export function bookingUrlForSource(source) {
  return String(source || '').trim() === 'infrabaldan'
    ? 'https://oxy-agenda.vercel.app/booking/us?service=red%20light'
    : 'https://oxy-agenda.vercel.app/booking/us';
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function firstName(name) {
  const part = String(name || '').trim().split(/\s+/)[0];
  return part || 'there';
}

/**
 * Immediate thank-you after the visitor leaves name/phone/email.
 */
export function buildAckEmail(lead) {
  const name = firstName(lead.name);
  const bookingUrl = bookingUrlForSource(lead.source);
  const subject = 'Thanks — pick your time at OxyHyperbaric';
  const text = [
    `Hi ${name},`,
    '',
    'Thanks for sharing your details with OxyHyperbaric.',
    'Your next step is to choose an available time so we can hold your visit.',
    '',
    `Book here: ${bookingUrl}`,
    '',
    `Questions? Call or text ${DEFAULT_PHONE}.`,
    '',
    '— OxyHyperbaric team',
  ].join('\n');
  const html = `
    <p>Hi ${escapeHtml(name)},</p>
    <p>Thanks for sharing your details with OxyHyperbaric. Your next step is to choose an available time so we can hold your visit.</p>
    <p><a href="${escapeHtml(bookingUrl)}" style="display:inline-block;padding:12px 18px;background:#0f766e;color:#fff;text-decoration:none;border-radius:6px;font-weight:600;">Pick your time</a></p>
    <p>Or open this link:<br/><a href="${escapeHtml(bookingUrl)}">${escapeHtml(bookingUrl)}</a></p>
    <p>Questions? Call or text ${DEFAULT_PHONE}.</p>
    <p>— OxyHyperbaric team</p>
  `.trim();
  return { subject, text, html, bookingUrl };
}

/**
 * Nudge when they left info but still have not booked (abandon beacon or cron).
 */
export function buildNudgeEmail(lead) {
  const name = firstName(lead.name);
  const bookingUrl = bookingUrlForSource(lead.source);
  const subject = 'Still want your session? Finish booking in one click';
  const text = [
    `Hi ${name},`,
    '',
    'You started booking with OxyHyperbaric but have not picked a time yet.',
    'Times fill up — finish in about a minute with the link below.',
    '',
    `Book here: ${bookingUrl}`,
    '',
    `Prefer help from us? Call or text ${DEFAULT_PHONE} and we will get you scheduled.`,
    '',
    '— OxyHyperbaric team',
  ].join('\n');
  const html = `
    <p>Hi ${escapeHtml(name)},</p>
    <p>You started booking with OxyHyperbaric but have not picked a time yet. Times fill up — finish in about a minute:</p>
    <p><a href="${escapeHtml(bookingUrl)}" style="display:inline-block;padding:12px 18px;background:#0f766e;color:#fff;text-decoration:none;border-radius:6px;font-weight:600;">Finish booking</a></p>
    <p>Prefer help from us? Call or text ${DEFAULT_PHONE} and we will get you scheduled.</p>
    <p>— OxyHyperbaric team</p>
  `.trim();
  return { subject, text, html, bookingUrl };
}

/**
 * ~24h invitation if they still have not booked (after agenda DB check).
 */
export function buildDayInviteEmail(lead) {
  const name = firstName(lead.name);
  const bookingUrl = bookingUrlForSource(lead.source);
  const subject = 'Your OxyHyperbaric session is still open — book today';
  const text = [
    `Hi ${name},`,
    '',
    'Just a quick note: we still have your details from yesterday, but we do not see a booked time yet.',
    'If you still want your session, pick a slot with the link below — it only takes a minute.',
    '',
    `Book here: ${bookingUrl}`,
    '',
    `Need help choosing a time? Call or text ${DEFAULT_PHONE} and we will take care of it.`,
    '',
    '— OxyHyperbaric team',
  ].join('\n');
  const html = `
    <p>Hi ${escapeHtml(name)},</p>
    <p>Just a quick note: we still have your details from yesterday, but we do not see a booked time yet.</p>
    <p>If you still want your session, pick a slot below — it only takes a minute.</p>
    <p><a href="${escapeHtml(bookingUrl)}" style="display:inline-block;padding:12px 18px;background:#0f766e;color:#fff;text-decoration:none;border-radius:6px;font-weight:600;">Book your session</a></p>
    <p>Need help choosing a time? Call or text ${DEFAULT_PHONE} and we will take care of it.</p>
    <p>— OxyHyperbaric team</p>
  `.trim();
  return { subject, text, html, bookingUrl };
}

/**
 * @param {'ack'|'nudge'|'day'} kind
 */
export async function sendFunnelVisitorEmail(lead, kind = 'ack') {
  const to = String(lead.email || '').trim();
  if (!to) return { ok: false, skipped: true, reason: 'no_email' };

  const resendKey = getResendApiKey();
  if (!resendKey) return { ok: false, skipped: true, reason: 'no_resend_key' };

  const built =
    kind === 'day'
      ? buildDayInviteEmail(lead)
      : kind === 'nudge'
        ? buildNudgeEmail(lead)
        : buildAckEmail(lead);
  const from = getResendFromAddress(CLINIC);

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${resendKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: [to],
      subject: built.subject,
      text: built.text,
      html: built.html,
    }),
  });

  if (!res.ok) {
    const detail = (await res.text().catch(() => '')).slice(0, 160);
    return { ok: false, kind, status: res.status, detail, from };
  }

  const data = await res.json().catch(() => ({}));
  return {
    ok: true,
    kind,
    id: data.id || null,
    from,
    bookingUrl: built.bookingUrl,
  };
}
