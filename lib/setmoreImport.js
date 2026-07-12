import fs from 'node:fs';
import { readFileSync } from 'node:fs';

const DAY_NAMES = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const TZ = 'America/Mexico_City';
const IMPORT_NOTE = 'import-setmore-gdl';

export function digitsOnly(value) {
  return String(value || '').replace(/\D/g, '');
}

export function normalizeKey(str) {
  return String(str || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

export function parseSetmoreDate(value) {
  const s = String(value || '').trim();
  const months = {
    jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
    jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
  };
  const m = s.match(/^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})$/);
  if (!m) return null;
  const mon = months[m[2].slice(0, 3).toLowerCase()];
  if (mon == null) return null;
  const d = new Date(Number(m[3]), mon, Number(m[1]));
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function parseTimeRange(value) {
  const s = String(value || '').trim();
  const m = s.match(/^(\d{1,2}:\d{2}\s*[AP]M)\s*-\s*(\d{1,2}:\d{2}\s*[AP]M)$/i);
  if (!m) return { start: null, durationMins: null };
  const toMins = (t) => {
    const parts = t.toUpperCase().trim().split(/\s+/);
    let [h, min] = parts[0].split(':').map(Number);
    if (parts[1] === 'PM' && h !== 12) h += 12;
    if (parts[1] === 'AM' && h === 12) h = 0;
    return h * 60 + min;
  };
  const startRaw = m[1].toUpperCase().replace(/\s+/g, ' ');
  const startMins = toMins(startRaw);
  const endMins = toMins(m[2]);
  return { start: formatTime(startMins), durationMins: endMins - startMins };
}

export function formatTime(mins) {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  const ampm = h >= 12 ? 'PM' : 'AM';
  const dispH = h > 12 ? h - 12 : h === 0 ? 12 : h;
  return `${String(dispH).padStart(2, '0')}:${String(m).padStart(2, '0')} ${ampm}`;
}

export function mexicoNow() {
  const local = new Date(new Date().toLocaleString('en-US', { timeZone: TZ }));
  return {
    dateStr: `${local.getFullYear()}-${String(local.getMonth() + 1).padStart(2, '0')}-${String(local.getDate()).padStart(2, '0')}`,
    mins: local.getHours() * 60 + local.getMinutes(),
  };
}

export function dayNameFromIso(fullDate) {
  const [y, mo, d] = fullDate.split('-').map(Number);
  return DAY_NAMES[new Date(y, mo - 1, d).getDay()];
}

export function loadCustomerEmailIndex(csvPath) {
  if (!csvPath || !fs.existsSync(csvPath)) return new Map();
  const text = readFileSync(csvPath, 'utf8');
  const lines = text.split(/\r?\n/).filter(Boolean);
  if (!lines.length) return new Map();
  const headers = lines[0].split(',').map((h) => h.trim());
  const idx = Object.fromEntries(headers.map((h, i) => [h, i]));
  const map = new Map();
  for (const line of lines.slice(1)) {
    const cols = parseCsvLine(line);
    const phone = digitsOnly(cols[idx.Phone] || cols[idx.Phone1] || '').slice(-10);
    const email = String(cols[idx.Email] || cols[idx.Email1] || '').trim().replace(/^"|"$/g, '');
    if (phone.length === 10 && email) map.set(phone, email);
  }
  return map;
}

function parseCsvLine(line) {
  const out = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (ch === ',' && !inQuotes) {
      out.push(cur);
      cur = '';
      continue;
    }
    cur += ch;
  }
  out.push(cur);
  return out;
}

export function resolveEquipmentName(setmoreService, services) {
  const norm = normalizeKey(setmoreService);
  const chamberMatch = norm.match(/camara\s*hiperbarica\s*(\d)|camara\s*(\d)|cámara\s*(\d)/i);
  const chamberNum = chamberMatch ? (chamberMatch[1] || chamberMatch[2] || chamberMatch[3]) : null;

  if (norm.includes('valoracion')) {
    return services.find((s) => normalizeKey(s.name).includes('valoracion'))?.name || null;
  }

  if (chamberNum) {
    const candidates = services.filter((s) => {
      const sn = normalizeKey(s.name);
      return sn.includes(`camara ${chamberNum}`) || sn.includes(`camara${chamberNum}`);
    });
    if (candidates.length === 1) return candidates[0].name;
    if (candidates.length > 1) {
      return candidates.find((s) => !normalizeKey(s.name).includes('valoracion'))?.name || candidates[0].name;
    }
  }

  const exact = services.find((s) => normalizeKey(s.name) === norm);
  return exact?.name || null;
}

export function resolveDurationBuffer(setmoreService, slotDurationMins) {
  const norm = normalizeKey(setmoreService);
  if (norm.includes('valoracion')) return { duration: 45, buffer: 0 };
  if (norm.includes('90 min') || slotDurationMins >= 120) return { duration: 90, buffer: 30 };
  return { duration: 60, buffer: 30 };
}

export function resolveCheckInStatus(fullDate, startTime, blockMins, setmoreLabel, now = mexicoNow()) {
  const label = normalizeKey(setmoreLabel);
  if (label.includes('no-show') || label.includes('no show') || label.includes('no entro')) {
    return 'No Asistió';
  }
  if (fullDate < now.dateStr) return 'Finalizado';
  if (fullDate > now.dateStr) return 'Agendado';
  const start = parseTimeRange(`${startTime} - ${startTime}`).start || startTime;
  const startMins = parseTimeRange(`${start} - ${start}`).durationMins != null
    ? (() => {
      const m = start.match(/(\d+):(\d+)\s*(AM|PM)/i);
      if (!m) return 0;
      let h = Number(m[1]);
      const min = Number(m[2]);
      if (m[3].toUpperCase() === 'PM' && h !== 12) h += 12;
      if (m[3].toUpperCase() === 'AM' && h === 12) h = 0;
      return h * 60 + min;
    })()
    : 0;
  if (startMins + blockMins <= now.mins) return 'Finalizado';
  return 'Agendado';
}

function getMinutesFromTime(timeStr) {
  const m = String(timeStr || '').match(/(\d+):(\d+)\s*(AM|PM)/i);
  if (!m) return 0;
  let h = Number(m[1]);
  const min = Number(m[2]);
  if (m[3].toUpperCase() === 'PM' && h !== 12) h += 12;
  if (m[3].toUpperCase() === 'AM' && h === 12) h = 0;
  return h * 60 + min;
}

export function resolveCheckInStatusSimple(fullDate, timeStr, blockMins, setmoreLabel, now = mexicoNow()) {
  const label = normalizeKey(setmoreLabel);
  if (label.includes('no-show') || label.includes('no show') || label.includes('no entro')) {
    return 'No Asistió';
  }
  if (fullDate < now.dateStr) return 'Finalizado';
  if (fullDate > now.dateStr) return 'Agendado';
  const startMins = getMinutesFromTime(timeStr);
  if (startMins + blockMins <= now.mins) return 'Finalizado';
  return 'Agendado';
}

export function mapSetmoreRow(row, { services, emailByPhone, now = mexicoNow() }) {
  const meeting = String(row['Meeting Type'] || '').trim();
  if (meeting !== 'Service') return { skip: true, reason: 'event_or_non_service' };

  const status = String(row.Estado || row['Estado '] || '').trim();
  if (status === 'Cancelado') return { skip: true, reason: 'cancelled' };

  const patient = String(row['Nombre del Cliente'] || '').trim();
  if (!patient || patient.toUpperCase() === 'N/A') return { skip: true, reason: 'no_patient' };

  const cc = digitsOnly(row['Código de País'] || '52');
  const phoneRaw = digitsOnly(row.Teléfono || row.Telefono || '');
  const phone10 = (cc + phoneRaw).slice(-10);
  if (phone10.length !== 10) return { skip: true, reason: 'bad_phone', patient };

  const fullDate = parseSetmoreDate(row['Fecha de cita']);
  if (!fullDate) return { skip: true, reason: 'bad_date', patient };

  const { start, durationMins } = parseTimeRange(row['Hora de la cita']);
  if (!start) return { skip: true, reason: 'bad_time', patient, fullDate };

  const setmoreService = String(row['Servicio/clase/evento'] || '').trim();
  const equipment = resolveEquipmentName(setmoreService, services);
  if (!equipment) return { skip: true, reason: 'unknown_service', setmoreService };

  const { duration, buffer } = resolveDurationBuffer(setmoreService, durationMins);
  const blockMins = duration + buffer;
  const label = String(row.Etiqueta || '').trim();
  const checkInStatus = resolveCheckInStatusSimple(fullDate, start, blockMins, label, now);

  const emailFromRow = String(row['Correo electrónico'] || row['Correo electronico'] || '').trim();
  const email = emailFromRow || emailByPhone.get(phone10) || '';
  const bookingId = String(row['ID de reserva'] || '').trim();
  const phoneDisplay = `+52 ${phone10}`;

  return {
    skip: false,
    bookingId,
    patient: {
      Name: patient,
      Phone: phoneDisplay,
      Email: email,
      protocol: 'Wellness',
      notes: '',
      wallets: {},
      package_history: [],
      adeudo: 0,
      historico_sesiones: 0,
    },
    appointment: {
      patient,
      phone: phoneDisplay,
      protocol: 'Wellness',
      equipment,
      duration,
      buffer,
      full_date: fullDate,
      appointment_date: fullDate,
      day: dayNameFromIso(fullDate),
      time: start,
      appointment_time: start,
      attendant: checkInStatus === 'Finalizado' ? 'Importado Setmore' : 'Por Asignar',
      check_in_status: checkInStatus,
      is_new_patient: false,
      outside_normal_hours: false,
      is_extended_block: false,
      clinic: 'Oxygengdl',
      notes: '',
    },
  };
}

export function mergeSetmoreRows(rowSets, preferLater = true) {
  const byId = new Map();
  const noId = [];
  for (const rows of rowSets) {
    for (const row of rows) {
      const id = String(row['ID de reserva'] || '').trim();
      if (!id) {
        noId.push(row);
        continue;
      }
      if (!byId.has(id) || preferLater) byId.set(id, row);
    }
  }
  return [...byId.values(), ...noId];
}

export { IMPORT_NOTE };
