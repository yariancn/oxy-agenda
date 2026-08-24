/** Altura total del encabezado sticky en vista Semana (día + equipos). */
export const WEEK_STICKY_HEADER_PX = 60;

/** Franja compacta de valoraciones bajo el encabezado del día (solo si hay citas). */
export const ASSESSMENT_BAND_HEIGHT_PX = 30;

/** Escala vertical del calendario (px por minuto). */
export const CALENDAR_PIXELS_PER_MINUTE = 1.5;

import { isAssessmentService as isAssessmentServiceImpl } from './assessmentService.js';
import { blockedSlotAppliesToDate, blockedSlotMatchesEquipment } from './blockedSlots.js';

/** Servicios de valoración / evaluación — no ocupan columna de equipo en vista Semana. */
export function isAssessmentService(name) {
  return isAssessmentServiceImpl(name);
}

/** Día con al menos una cita activa o bloqueo en la vista actual. */
export function weekDayHasScheduledItems({
  fullDate,
  appointments = [],
  blockedSlots = [],
  equipmentFilter = 'Todos',
  resolveEquipment = (eq) => eq,
}) {
  const matchEquip = (eq) => equipmentFilter === 'Todos' || resolveEquipment(eq) === equipmentFilter;

  if (appointments.some(
    (a) => a.full_date === fullDate
      && a.check_in_status !== 'Cancelado'
      && matchEquip(a.equipment),
  )) {
    return true;
  }

  return blockedSlots.some(
    (b) => blockedSlotAppliesToDate(b, fullDate) && (b.is_global || matchEquip(b.equipment)),
  );
}

export function weekDayEquipmentHasItems({
  fullDate,
  equipment,
  appointments = [],
  blockedSlots = [],
  resolveEquipment = (eq) => eq,
}) {
  const eq = String(equipment || '').trim();
  if (!eq) return false;

  if (blockedSlots.some((b) => blockedSlotAppliesToDate(b, fullDate) && b.is_global)) {
    return true;
  }

  if (appointments.some(
    (a) => a.full_date === fullDate
      && a.check_in_status !== 'Cancelado'
      && resolveEquipment(a.equipment) === eq,
  )) {
    return true;
  }

  return blockedSlots.some(
    (b) => blockedSlotAppliesToDate(b, fullDate)
      && !b.is_global
      && resolveEquipment(b.equipment) === eq,
  );
}

/** Anchos por equipo en vista Semana: todas las columnas al mismo ancho. */
export function weekDayColumnWidths({
  equipmentNames = [],
  colWidth,
}) {
  const names = equipmentNames.filter(Boolean);
  const n = Math.max(1, names.length);
  const dayWidth = n * colWidth;
  const byEquipment = Object.fromEntries(names.map((eq) => [eq, colWidth]));
  return { dayWidth, byEquipment, compactDay: false, dayHasAny: true };
}

/** @deprecated use weekDayColumnWidths */
export function weekDayLayout(hasItems, equipmentCount, colWidth) {
  const n = Math.max(1, equipmentCount);
  const dayWidth = n * colWidth;
  return { dayWidth, equipWidth: colWidth, compactDay: false };
}

/**
 * Zoom inicial según vista, cantidad de equipos y viewport.
 * Objetivo: columnas legibles sin scroll horizontal excesivo en móvil.
 */
export function computeDefaultZoomScale({ viewMode, equipmentCount, isMobile }) {
  const n = Math.max(1, equipmentCount);
  const baseCol = 160;

  let targetWidth;
  if (viewMode === 'Día') {
    targetWidth = isMobile
      ? Math.max(52, Math.floor(320 / n))
      : (n === 1 ? 200 : 160);
  } else if (n === 1) {
    targetWidth = isMobile ? 110 : 130;
  } else if (n === 2) {
    targetWidth = isMobile ? 78 : 95;
  } else {
    targetWidth = isMobile ? 68 : 85;
  }

  const zoom = Math.round((targetWidth / baseCol) * 100);
  return Math.min(160, Math.max(isMobile ? 48 : 42, zoom));
}

export function getEquipmentShortLabel(name) {
  const label = String(name || '').trim();
  if (!label) return '—';

  const chamberMatch = label.match(/chamber\s*(\d+)/i);
  if (chamberMatch) return `C${chamberMatch[1]}`;

  const camMatch = label.match(/c[aá]mara\s*(\d+)/i);
  if (camMatch) return `C${camMatch[1]}`;

  if (/red\s*light/i.test(label)) return 'RL';
  if (/luz\s*roja/i.test(label)) return 'LR';
  if (/silla/i.test(label) || /\bseat\b/i.test(label)) return 'SILLA';
  if (/flat\s*bed/i.test(label)) return 'FLAT';

  if (/valoraci[oó]n/i.test(label)) return 'V.';

  const words = label.split(/\s+/).filter(Boolean);
  if (words.length === 1) return words[0].slice(0, 6).toUpperCase();
  return words.map((w) => w[0]).join('').slice(0, 4).toUpperCase();
}

export function getPatientInitials(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

export function isUltraCompactColumn(colWidth) {
  return colWidth < 56;
}

export function isCompactColumn(colWidth) {
  return colWidth < 96;
}

export function buildAppointmentAriaLabel(app, { localeLabels }) {
  const parts = [
    app.patient,
    app.time,
    app.equipment,
    app.check_in_status !== 'Agendado' ? app.check_in_status : '',
    app.is_new_patient ? (localeLabels?.newPatient || 'Nueva') : '',
    app.outside_normal_hours ? localeLabels?.outsideHours : '',
    app.is_extended_block ? localeLabels?.extended : '',
  ].filter(Boolean);
  return parts.join(' · ');
}
