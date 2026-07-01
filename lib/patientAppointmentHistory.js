import { normalizeStr } from './ensurePatient.js';

/** @param {object[]} appointments */
export function filterPatientAppointments(appointments, { patientName, patientId } = {}) {
  const nameKey = normalizeStr(patientName);
  const idKey = patientId != null && patientId !== '' ? String(patientId) : '';

  return (appointments || []).filter((app) => {
    if (idKey) {
      const appPatientId = app.patient_id ?? app.patientId;
      if (appPatientId != null && String(appPatientId) === idKey) return true;
    }
    if (!nameKey) return false;
    return normalizeStr(app.patient) === nameKey;
  });
}

/** @param {object[]} appointments */
export function sortAppointmentsNewestFirst(appointments) {
  return [...(appointments || [])].sort((a, b) => {
    const da = `${a.full_date || ''}T${a.time || '00:00'}`;
    const db = `${b.full_date || ''}T${b.time || '00:00'}`;
    return db.localeCompare(da);
  });
}

export function formatSessionDate(fullDate, locale = 'es') {
  if (!fullDate) return '—';
  const parts = String(fullDate).split('-').map(Number);
  if (parts.length < 3 || parts.some((n) => !Number.isFinite(n))) return fullDate;
  const [year, month, day] = parts;
  const dt = new Date(year, month - 1, day);
  return dt.toLocaleDateString(locale === 'en' ? 'en-US' : 'es-MX', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export function getCheckInStatusTone(status) {
  const tones = {
    Agendado: { icon: '📅', className: 'bg-blue-100 text-blue-800' },
    'Llegó': { icon: '🚶', className: 'bg-amber-100 text-amber-800' },
    'En Sesión': { icon: '🟢', className: 'bg-emerald-100 text-emerald-800' },
    Finalizado: { icon: '✔️', className: 'bg-slate-200 text-slate-700' },
    'No Asistió': { icon: '❌', className: 'bg-red-100 text-red-800' },
    Cancelado: { icon: '❌', className: 'bg-red-50 text-red-600' },
    'Falta Justificada': { icon: '📋', className: 'bg-orange-100 text-orange-800' },
    Devuelto: { icon: '↩️', className: 'bg-purple-100 text-purple-800' },
  };
  return tones[status] || tones.Agendado;
}
