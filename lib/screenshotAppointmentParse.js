import { digitsOnly } from './ensurePatient.js';
import { resolveScreenshotEquipment } from './screenshotEquipment.js';

/** Normaliza hora a formato de agenda: "09:00 AM" */
export function normalizeAppointmentTime(raw) {
  const text = String(raw || '').trim();
  if (!text) return '';

  const twelve = text.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (twelve) {
    const h = Number(twelve[1]);
    const m = Number(twelve[2]);
    if (h >= 1 && h <= 12 && m >= 0 && m <= 59) {
      return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')} ${twelve[3].toUpperCase()}`;
    }
  }

  const twentyFour = text.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (twentyFour) {
    let h = Number(twentyFour[1]);
    const m = Number(twentyFour[2]);
    if (h >= 0 && h <= 23 && m >= 0 && m <= 59 && (h === 0 || h > 12)) {
      const ampm = h >= 12 ? 'PM' : 'AM';
      if (h === 0) h = 12;
      else if (h > 12) h -= 12;
      return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')} ${ampm}`;
    }
  }

  const loose = text.match(/(\d{1,2})\s*[:.h]\s*(\d{2})\s*(am|pm|a\.?m\.?|p\.?m\.?)?/i);
  if (loose) {
    let h = Number(loose[1]);
    const m = Number(loose[2]);
    let meridiem = String(loose[3] || '').toUpperCase().replace(/\./g, '');
    if (!meridiem) {
      // Sin am/pm en WhatsApp MX/US: 1–7 suele ser tarde (cita clínica).
      if (h >= 1 && h <= 7) meridiem = 'PM';
      else meridiem = h >= 12 ? 'PM' : 'AM';
    }
    if (meridiem.startsWith('P') && h < 12) h += 12;
    if (meridiem.startsWith('A') && h === 12) h = 0;
    const ampm = h >= 12 ? 'PM' : 'AM';
    const disp = h > 12 ? h - 12 : h === 0 ? 12 : h;
    return `${String(disp).padStart(2, '0')}:${String(m).padStart(2, '0')} ${ampm}`;
  }

  return '';
}

/** ISO YYYY-MM-DD */
export function normalizeAppointmentDate(raw, referenceIso) {
  const text = String(raw || '').trim();
  if (!text) return '';

  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;

  const dmy = text.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/);
  if (dmy) {
    const a = Number(dmy[1]);
    const b = Number(dmy[2]);
    let y = Number(dmy[3]);
    if (y < 100) y += 2000;
    const day = a > 12 ? a : b;
    const month = a > 12 ? b : a;
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return `${y}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }
  }

  const mdy = text.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/);
  if (mdy) {
    const month = Number(mdy[1]);
    const day = Number(mdy[2]);
    const y = Number(mdy[3]);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return `${y}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }
  }

  const ref = referenceIso ? new Date(`${referenceIso}T12:00:00`) : new Date();
  const lower = text.toLowerCase();
  const addDays = (n) => {
    const d = new Date(ref);
    d.setDate(d.getDate() + n);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };

  if (/\b(hoy|today)\b/i.test(lower)) return addDays(0);
  if (/\b(mañana|manana|tomorrow)\b/i.test(lower)) return addDays(1);
  if (/\b(pasado mañana|pasado manana|day after tomorrow)\b/i.test(lower)) return addDays(2);

  const weekdayMap = {
    domingo: 0, sunday: 0,
    lunes: 1, monday: 1,
    martes: 2, tuesday: 2,
    miércoles: 3, miercoles: 3, wednesday: 3,
    jueves: 4, thursday: 4,
    viernes: 5, friday: 5,
    sábado: 6, sabado: 6, saturday: 6,
  };
  for (const [word, targetDow] of Object.entries(weekdayMap)) {
    if (lower.includes(word)) {
      const d = new Date(ref);
      const diff = (targetDow - d.getDay() + 7) % 7 || 7;
      d.setDate(d.getDate() + diff);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    }
  }

  return '';
}

export function normalizeScreenshotPhone(raw, locale = 'es') {
  const digits = digitsOnly(raw).slice(-10);
  if (digits.length !== 10) return String(raw || '').trim();
  const prefix = locale === 'en' ? '+1' : '+52';
  return `${prefix} ${digits}`;
}

const WEEKDAY_TO_DOW = {
  domingo: 0, sunday: 0,
  lunes: 1, monday: 1,
  martes: 2, tuesday: 2,
  miércoles: 3, miercoles: 3, wednesday: 3,
  jueves: 4, thursday: 4,
  viernes: 5, friday: 5,
  sábado: 6, sabado: 6, saturday: 6,
};

function toIsoDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** "martes 14" → próxima fecha válida desde referencia */
export function parseWeekdayDayFromText(blob, referenceIso) {
  const m = String(blob || '').match(
    /\b(lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado|domingo|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\s+(\d{1,2})\b/i,
  );
  if (!m) return '';

  const weekdayKey = m[1].toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const targetDow = WEEKDAY_TO_DOW[weekdayKey];
  const dayNum = Number(m[2]);
  if (targetDow == null || !dayNum) return '';

  const ref = referenceIso ? new Date(`${referenceIso}T12:00:00`) : new Date();
  ref.setHours(12, 0, 0, 0);

  for (let monthOffset = 0; monthOffset < 4; monthOffset += 1) {
    const base = new Date(ref.getFullYear(), ref.getMonth() + monthOffset, 1, 12);
    const candidate = new Date(base.getFullYear(), base.getMonth(), dayNum, 12);
    if (candidate.getMonth() !== base.getMonth()) continue;
    if (candidate.getDay() !== targetDow) continue;
    if (candidate < ref && monthOffset === 0) continue;
    return toIsoDate(candidate);
  }
  return '';
}

function extractPhoneFromText(blob) {
  const labeled = blob.match(/(?:tel[eé]fono|cel|m[oó]vil|phone|whatsapp)[:\s]*([+\d\s().-]{10,})/i);
  if (labeled) return labeled[1];
  const ten = blob.match(/\b(\d{10})\b/);
  if (ten) return ten[1];
  const spaced = blob.match(/(?:\+?52|\+?1)?[\s.-]*(\d{3})[\s.-]*(\d{3})[\s.-]*(\d{4})/);
  if (spaced) return `${spaced[1]}${spaced[2]}${spaced[3]}`;
  return '';
}

function extractPatientFromLines(lines) {
  const intro = lines.join('\n').match(
    /(?:me llamo|soy|mi nombre es|my name is|i am|i'm)\s+([A-Za-zÁÉÍÓÚÑáéíóúñ][A-Za-zÁÉÍÓÚÑáéíóúñ\s.'-]{2,50})/i,
  );
  if (intro) return intro[1].trim();

  const skip = /^(hola|buenos|buenas|gracias|ok|si|sí|oye|perfecto|cita|oxigen|hyperbaric|session|sesi[oó]n|\d)/i;
  for (const line of lines) {
    if (skip.test(line)) continue;
    if (/^[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+(?:\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+){1,3}$/.test(line)) {
      return line;
    }
  }
  return '';
}

function extractTimeFromLines(lines) {
  const alone = lines.find((line) => /^\d{1,2}\s*[:.]\s*\d{2}\s*(?:am|pm|a\.?m\.?|p\.?m\.?)?$/i.test(line.trim()));
  if (alone) {
    const norm = normalizeAppointmentTime(alone.trim());
    if (norm) return norm;
  }

  const afterChoice = lines.join('\n').match(
    /(?:podr[ií]a ser|ser[ií]a|queda|confirmo|a las|at)\s+(\d{1,2}\s*[:.]\s*\d{2}\s*(?:am|pm)?)/i,
  );
  if (afterChoice) {
    const norm = normalizeAppointmentTime(afterChoice[1]);
    if (norm) return norm;
  }

  const candidates = [];
  for (const line of lines) {
    const matches = line.match(/\b\d{1,2}\s*[:.]\s*\d{2}\b/g) || [];
    for (const raw of matches) {
      const norm = normalizeAppointmentTime(raw.replace(/\s/g, ''));
      if (norm) candidates.push(norm);
    }
  }
  return candidates.length ? candidates[candidates.length - 1] : '';
}

/** OCR de captura WhatsApp → campos de cita (sin API de pago). */
export function parseAppointmentFromOcrText(text, { referenceDate, locale = 'es', clinic, services = [] } = {}) {
  const lines = String(text || '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 1);
  const blob = lines.join('\n');

  const patient = extractPatientFromLines(lines);
  const phone = extractPhoneFromText(blob);
  const email = (blob.match(/[\w.+-]+@[\w.-]+\.\w+/) || [])[0] || '';
  const time = extractTimeFromLines(lines);
  const equipment = resolveScreenshotEquipment({ clinic, services, ocrText: blob });

  let fullDate = parseWeekdayDayFromText(blob, referenceDate);
  if (!fullDate) {
    const dmy = blob.match(/\b(\d{1,2}[\/\-.]\d{1,2}(?:[\/\-.]\d{2,4})?)\b/);
    fullDate = normalizeAppointmentDate(dmy?.[1] || '', referenceDate);
  }
  if (!fullDate) {
    if (/\bmañana\b|\bmanana\b|\btomorrow\b/i.test(blob)) fullDate = normalizeAppointmentDate('mañana', referenceDate);
    else if (/\bhoy\b|\btoday\b/i.test(blob)) fullDate = normalizeAppointmentDate('hoy', referenceDate);
  }

  const parts = [patient, fullDate, time, equipment].filter(Boolean);
  const aiSummary = locale === 'en'
    ? (parts.length ? `Read from screenshot: ${parts.join(' · ')}` : 'Could not read clear appointment details.')
    : (parts.length ? `Leído de la captura: ${parts.join(' · ')}` : 'No se leyeron datos claros de la cita.');

  let confidence = 'low';
  if (patient && fullDate && time) confidence = phone ? 'high' : 'medium';
  else if ((patient && time) || (patient && fullDate) || (fullDate && time)) confidence = 'medium';

  return normalizeScreenshotExtraction({
    patient,
    phone,
    email,
    fullDate,
    time,
    equipment,
    confidence,
    summary: aiSummary,
  }, { referenceDate, locale });
}

export function normalizeScreenshotExtraction(raw, { referenceDate, locale = 'es' } = {}) {
  const patient = String(raw?.patient || raw?.name || '').trim();
  const fullDate = normalizeAppointmentDate(raw?.fullDate || raw?.date, referenceDate)
    || (raw?.fullDate && /^\d{4}-\d{2}-\d{2}$/.test(raw.fullDate) ? raw.fullDate : '');
  const time = normalizeAppointmentTime(raw?.time);
  const equipment = String(raw?.equipment || '').trim();
  const phone = normalizeScreenshotPhone(raw?.phone, locale);
  const email = String(raw?.email || '').trim();
  const notes = String(raw?.notes || raw?.summary || '').trim();
  const confidence = ['high', 'medium', 'low'].includes(String(raw?.confidence || '').toLowerCase())
    ? String(raw.confidence).toLowerCase()
    : 'medium';
  const aiSummary = String(raw?.summary || raw?.aiSummary || '').trim();

  const missing = [];
  if (!patient) missing.push('patient');
  if (!fullDate) missing.push('date');
  if (!time) missing.push('time');
  if (!equipment) missing.push('equipment');
  if (digitsOnly(phone).length < 10) missing.push('phone');

  return {
    patient,
    phone,
    email,
    fullDate,
    time,
    equipment,
    notes,
    confidence,
    aiSummary,
    missing,
    ready: missing.length === 0,
  };
}

export function parseVisionJsonContent(content) {
  const text = String(content || '').trim();
  if (!text) return null;

  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1].trim() : text;

  try {
    return JSON.parse(candidate);
  } catch {
    const start = candidate.indexOf('{');
    const end = candidate.lastIndexOf('}');
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(candidate.slice(start, end + 1));
      } catch {
        return null;
      }
    }
  }
  return null;
}
