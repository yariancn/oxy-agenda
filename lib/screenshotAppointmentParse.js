import { digitsOnly } from './ensurePatient.js';

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
    if (h >= 0 && h <= 23 && m >= 0 && m <= 59) {
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
    if (!meridiem) meridiem = h >= 12 ? 'PM' : 'AM';
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

export function normalizeScreenshotExtraction(raw, { referenceDate, locale = 'es' } = {}) {
  const patient = String(raw?.patient || raw?.name || '').trim();
  const fullDate = normalizeAppointmentDate(raw?.fullDate || raw?.date, referenceDate);
  const time = normalizeAppointmentTime(raw?.time);
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
  if (digitsOnly(phone).length < 10) missing.push('phone');

  return {
    patient,
    phone,
    email,
    fullDate,
    time,
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
