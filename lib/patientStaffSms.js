import { sendPatientTextMessage } from './clinicMessaging.js';
import { toE164Phone } from './appointmentNotify.js';

const MAX_CUSTOM_CHARS = 120;

const PRESETS = {
  waiting: {
    id: 'waiting',
    es: {
      label: 'Esperando / no ha llegado',
      body: (ctx) =>
        `Hola ${ctx.name}, te esperamos en tu cita de hoy ${ctx.time} en ${ctx.clinic}. `
        + `Si necesitas ayuda, llama al ${ctx.phone}.`,
    },
    en: {
      label: 'Waiting / has not arrived',
      body: (ctx) =>
        `Hi ${ctx.name}, we are expecting you for today's ${ctx.time} appointment at ${ctx.clinic}. `
        + `If you need help, call ${ctx.phone}.`,
    },
  },
  reminder: {
    id: 'reminder',
    es: {
      label: 'Recordatorio de cita',
      body: (ctx) =>
        `Recordatorio: tu cita en ${ctx.clinic} es el ${ctx.date} a las ${ctx.time}`
        + (ctx.service ? ` (${ctx.service})` : '')
        + `. Tel: ${ctx.phone}.`,
    },
    en: {
      label: 'Appointment reminder',
      body: (ctx) =>
        `Reminder: your appointment at ${ctx.clinic} is ${ctx.date} at ${ctx.time}`
        + (ctx.service ? ` (${ctx.service})` : '')
        + `. Call ${ctx.phone}.`,
    },
  },
  custom: {
    id: 'custom',
    es: {
      label: 'Nota corta personalizada',
      body: (ctx) =>
        `${ctx.clinic}: ${ctx.customNote} — Tel ${ctx.phone}.`,
    },
    en: {
      label: 'Short custom note',
      body: (ctx) =>
        `${ctx.clinic}: ${ctx.customNote} — Call ${ctx.phone}.`,
    },
  },
};

function optOutFooter(locale = 'es') {
  return locale === 'en'
    ? ' Reply STOP to opt out.'
    : ' Responde STOP para no recibir SMS.';
}

export function listPatientSmsPresets(locale = 'es') {
  const lang = locale === 'en' ? 'en' : 'es';
  return Object.values(PRESETS).map((p) => ({
    id: p.id,
    label: p[lang].label,
  }));
}

export function sanitizeCustomSmsNote(note = '') {
  return String(note || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_CUSTOM_CHARS);
}

/**
 * Builds a carrier-friendly transactional SMS:
 * clinic identified, appointment context, short optional note, STOP footer.
 * Avoids marketing claims / URL shorteners / spam patterns.
 */
export function buildPatientSmsMessage({
  preset = 'reminder',
  locale = 'es',
  patientName = '',
  clinicDisplayName = '',
  date = '',
  time = '',
  equipment = '',
  clinicPhone = '',
  customNote = '',
} = {}) {
  const lang = locale === 'en' ? 'en' : 'es';
  const entry = PRESETS[preset] || PRESETS.reminder;
  const note = sanitizeCustomSmsNote(customNote);

  if (preset === 'custom' && !note) {
    return { ok: false, error: 'custom_note_required' };
  }

  // Block obvious spam patterns in free text
  if (note) {
    const lower = note.toLowerCase();
    if (/bit\.ly|tinyurl|t\.co|goo\.gl|free money|crypto|viagra|casino/i.test(lower)) {
      return { ok: false, error: 'custom_note_blocked' };
    }
  }

  const firstName = String(patientName || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)[0] || (lang === 'en' ? 'there' : 'hola');

  const ctx = {
    name: firstName,
    clinic: String(clinicDisplayName || 'Clinic').trim().slice(0, 40) || 'Clinic',
    date: String(date || '').trim(),
    time: String(time || '').trim(),
    service: String(equipment || '').trim().slice(0, 40),
    phone: String(clinicPhone || '').trim() || (lang === 'en' ? 'the clinic' : 'la clínica'),
    customNote: note,
  };

  let body = entry[lang].body(ctx).replace(/\s+/g, ' ').trim();
  if (!body.includes('STOP')) {
    body += optOutFooter(lang);
  }

  if (body.length > 320) {
    body = `${body.slice(0, 317)}...`;
  }

  return { ok: true, body, preset: entry.id };
}

export async function sendStaffPatientSms({
  clinicName,
  phone,
  locale = 'es',
  preset = 'reminder',
  patientName,
  clinicDisplayName,
  date,
  time,
  equipment,
  clinicPhone,
  customNote,
}) {
  const built = buildPatientSmsMessage({
    preset,
    locale,
    patientName,
    clinicDisplayName,
    date,
    time,
    equipment,
    clinicPhone,
    customNote,
  });
  if (!built.ok) return built;

  const e164 = toE164Phone(phone, clinicName);
  if (!e164) return { ok: false, error: 'invalid_phone' };

  const sent = await sendPatientTextMessage({
    clinicName,
    phone,
    smsBody: built.body,
    notifyType: 'booking',
    locale,
  });

  if (!sent?.ok) {
    return { ok: false, error: sent?.error || 'sms_failed', channel: sent?.channel };
  }

  return {
    ok: true,
    body: built.body,
    preset: built.preset,
    channel: sent.channel || 'sms',
    to: e164,
  };
}
