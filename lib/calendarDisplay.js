/** Altura total del encabezado sticky en vista Semana (día + equipos). */
export const WEEK_STICKY_HEADER_PX = 60;

/** Ancho de días vacíos en vista Semana = 1/5 del ancho normal del día. */
export const EMPTY_WEEK_DAY_WIDTH_RATIO = 1 / 5;

export const EMPTY_WEEK_DAY_MIN_WIDTH_PX = 32;

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
    (b) => b.date === fullDate && (b.is_global || matchEquip(b.equipment)),
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

  if (blockedSlots.some((b) => b.date === fullDate && b.is_global)) {
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
    (b) => b.date === fullDate && !b.is_global && resolveEquipment(b.equipment) === eq,
  );
}

/** Anchos por equipo en vista Semana: vacío = 1/5 del ancho normal de columna. */
export function weekDayColumnWidths({
  fullDate,
  equipmentNames = [],
  colWidth,
  appointments = [],
  blockedSlots = [],
  resolveEquipment = (eq) => eq,
}) {
  const names = equipmentNames.filter(Boolean);
  const n = Math.max(1, names.length);
  const fullDayWidth = n * colWidth;
  const narrowWidth = Math.max(6, Math.round(colWidth * EMPTY_WEEK_DAY_WIDTH_RATIO));
  const dayHasAny = weekDayHasScheduledItems({
    fullDate,
    appointments,
    blockedSlots,
    resolveEquipment,
  });

  if (!dayHasAny) {
    const dayWidth = Math.max(
      EMPTY_WEEK_DAY_MIN_WIDTH_PX,
      Math.round(fullDayWidth * EMPTY_WEEK_DAY_WIDTH_RATIO),
    );
    const equipWidth = dayWidth / n;
    const byEquipment = Object.fromEntries(names.map((eq) => [eq, equipWidth]));
    return { dayWidth, byEquipment, compactDay: true, dayHasAny: false };
  }

  const byEquipment = {};
  let dayWidth = 0;
  for (const eq of names) {
    const hasItems = weekDayEquipmentHasItems({
      fullDate,
      equipment: eq,
      appointments,
      blockedSlots,
      resolveEquipment,
    });
    const w = hasItems ? colWidth : narrowWidth;
    byEquipment[eq] = w;
    dayWidth += w;
  }

  return { dayWidth, byEquipment, compactDay: false, dayHasAny: true };
}

/** @deprecated use weekDayColumnWidths */
export function weekDayLayout(hasItems, equipmentCount, colWidth) {
  const n = Math.max(1, equipmentCount);
  const fullDayWidth = n * colWidth;
  if (hasItems) {
    return { dayWidth: fullDayWidth, equipWidth: colWidth, compactDay: false };
  }
  const dayWidth = Math.max(
    EMPTY_WEEK_DAY_MIN_WIDTH_PX,
    Math.round(fullDayWidth * EMPTY_WEEK_DAY_WIDTH_RATIO),
  );
  const equipWidth = dayWidth / n;
  return { dayWidth, equipWidth, compactDay: true };
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
      ? (n === 1 ? 160 : 120)
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
