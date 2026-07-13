import { formatNotifyDate } from './appointmentNotify.js';
import { getResendApiKey, getResendFromAddress } from './resendConfig.js';
import { isShenandoah, normalizeClinicId, resolveNotifyClinicDisplayName } from './clinicRegistry.js';
import { normalizePromoCode } from './promoters.js';

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export function buildPromoterNoShowEmail({
  patientName,
  date,
  time,
  equipment,
  clinicName,
  clinicDisplayName,
  promoterName,
  promoterCode,
  locale,
}) {
  const clinicId = normalizeClinicId(clinicName);
  const en = locale === 'en' || isShenandoah(clinicId);
  const clinic = resolveNotifyClinicDisplayName(clinicId, clinicDisplayName) || (en ? 'Clinic' : 'Clínica');
  const formattedDate = formatNotifyDate(date, en ? 'en' : 'es');
  const code = normalizePromoCode(promoterCode);
  const greetingName = String(promoterName || '').trim() || code || (en ? 'there' : '');

  const subject = en
    ? `No-show: ${patientName} — ${formattedDate} ${time || ''}`.trim()
    : `Falta: ${patientName} — ${formattedDate} ${time || ''}`.trim();

  const emailHtml = en
    ? `
    <div style="font-family:system-ui,sans-serif;max-width:520px;color:#0f172a;line-height:1.5;">
      <p style="margin:0 0 12px;">Hi ${escapeHtml(greetingName)},</p>
      <p style="margin:0 0 12px;">Your referred patient <strong>${escapeHtml(patientName)}</strong> was marked as a <strong>no-show</strong> and did not attend their appointment.</p>
      <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:12px;padding:14px 16px;margin:0 0 12px;">
        <p style="margin:0 0 6px;"><strong>Date:</strong> ${escapeHtml(formattedDate)}</p>
        <p style="margin:0 0 6px;"><strong>Time:</strong> ${escapeHtml(time || '')}</p>
        <p style="margin:0 0 6px;"><strong>Service:</strong> ${escapeHtml(equipment || '')}</p>
        <p style="margin:0;"><strong>Referral code:</strong> ${escapeHtml(code)}</p>
      </div>
      <p style="margin:0;font-size:13px;color:#64748b;">${escapeHtml(clinic)} · automated notice</p>
    </div>
  `
    : `
    <div style="font-family:system-ui,sans-serif;max-width:520px;color:#0f172a;line-height:1.5;">
      <p style="margin:0 0 12px;">Hola ${escapeHtml(greetingName)},</p>
      <p style="margin:0 0 12px;">Tu paciente referido <strong>${escapeHtml(patientName)}</strong> fue marcado como <strong>no asistió</strong> a su cita.</p>
      <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:12px;padding:14px 16px;margin:0 0 12px;">
        <p style="margin:0 0 6px;"><strong>Fecha:</strong> ${escapeHtml(formattedDate)}</p>
        <p style="margin:0 0 6px;"><strong>Hora:</strong> ${escapeHtml(time || '')}</p>
        <p style="margin:0 0 6px;"><strong>Servicio:</strong> ${escapeHtml(equipment || '')}</p>
        <p style="margin:0;"><strong>Código:</strong> ${escapeHtml(code)}</p>
      </div>
      <p style="margin:0;font-size:13px;color:#64748b;">${escapeHtml(clinic)} · aviso automático</p>
    </div>
  `;

  return { subject: subject.slice(0, 180), emailHtml };
}

export async function sendPromoterNoShowEmail({
  to,
  patientName,
  date,
  time,
  equipment,
  clinicName,
  clinicDisplayName,
  promoterName,
  promoterCode,
  locale,
}) {
  const email = String(to || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, skipped: true, reason: 'no_email' };
  }

  const resendKey = getResendApiKey();
  if (!resendKey) return { ok: false, error: 'Missing RESEND_API_KEY' };

  const { subject, emailHtml } = buildPromoterNoShowEmail({
    patientName,
    date,
    time,
    equipment,
    clinicName,
    clinicDisplayName,
    promoterName,
    promoterCode,
    locale,
  });

  const fromEmail = getResendFromAddress(clinicName);
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${resendKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: fromEmail,
      to: [email],
      subject,
      html: emailHtml,
    }),
  });

  if (!res.ok) {
    const errBody = await res.text().catch(() => '');
    return { ok: false, error: errBody.slice(0, 200) || 'Resend error' };
  }

  return { ok: true, to: email };
}

export async function notifyPromoterNoShow({
  supabase,
  appointment,
  clinicName,
  companyConfig = {},
}) {
  const code = normalizePromoCode(appointment?.promoter_code);
  if (!code) return { ok: true, skipped: true, reason: 'no_promoter' };

  let promoter = null;
  const { data, error } = await supabase
    .from('promoters')
    .select('code, name, email, is_active')
    .eq('code', code)
    .maybeSingle();

  if (!error && data) promoter = data;
  if (error && /email|column|schema cache/i.test(error.message || '')) {
    const fallback = await supabase
      .from('promoters')
      .select('code, name, is_active')
      .eq('code', code)
      .maybeSingle();
    if (!fallback.error && fallback.data) promoter = { ...fallback.data, email: '' };
  } else if (error) {
    return { ok: false, error: error.message };
  }

  if (!promoter || promoter.is_active === false) {
    return { ok: true, skipped: true, reason: 'promoter_inactive' };
  }

  const locale = isShenandoah(clinicName) ? 'en' : 'es';
  return sendPromoterNoShowEmail({
    to: promoter.email,
    patientName: appointment.patient,
    date: appointment.full_date,
    time: appointment.time,
    equipment: appointment.equipment,
    clinicName,
    clinicDisplayName: companyConfig.name,
    promoterName: promoter.name,
    promoterCode: code,
    locale,
  });
}
