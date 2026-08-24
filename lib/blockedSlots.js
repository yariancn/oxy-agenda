/** ISO date YYYY-MM-DD or empty string. */
export function normalizeBlockedSlotDate(value) {
  const iso = String(value || '').trim().slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso : '';
}

export function addDaysIso(isoDate, days) {
  const iso = normalizeBlockedSlotDate(isoDate);
  if (!iso) return '';
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`;
}

/** Ensures end_date is always set (defaults to date). */
export function normalizeBlockedSlotRow(block) {
  if (!block) return block;
  const date = normalizeBlockedSlotDate(block.date);
  const end = normalizeBlockedSlotDate(block.end_date) || date;
  return { ...block, date, end_date: end };
}

export function normalizeBlockedSlotRows(rows) {
  return (rows || []).map(normalizeBlockedSlotRow);
}

export function isMissingBlockedSlotEndDateColumnError(error) {
  const msg = String(error?.message || error || '');
  return /end_date|column|schema cache/i.test(msg);
}

/** Last calendar day covered by the block (falls back to start date). */
export function blockedSlotEndDate(block) {
  const end = normalizeBlockedSlotDate(block?.end_date);
  const start = normalizeBlockedSlotDate(block?.date);
  return end || start;
}

export function isMultiDayBlockedSlot(block) {
  const start = normalizeBlockedSlotDate(block?.date);
  const end = blockedSlotEndDate(block);
  return !!start && !!end && start !== end;
}

/**
 * Plan DB ops to drop one day from a block range.
 * @returns {{ action: 'delete' } | { action: 'update', patch: object } | { action: 'split', update: object, insert: object }}
 */
export function planRemoveDayFromBlockedSlot(block, dayToRemove) {
  const row = normalizeBlockedSlotRow(block);
  const start = row.date;
  const end = row.end_date;
  const day = normalizeBlockedSlotDate(dayToRemove);
  if (!start || !day || day < start || day > end) return null;

  const shared = {
    start_time: row.start_time,
    end_time: row.end_time,
    equipment: row.equipment ?? null,
    reason: row.reason,
    is_global: row.is_global,
    clinic: row.clinic,
  };

  if (start === end) return { action: 'delete' };
  if (day === start) {
    return { action: 'update', patch: { date: addDaysIso(start, 1), end_date: end, ...shared } };
  }
  if (day === end) {
    return { action: 'update', patch: { date: start, end_date: addDaysIso(end, -1), ...shared } };
  }
  return {
    action: 'split',
    update: { date: start, end_date: addDaysIso(day, -1), ...shared },
    insert: { date: addDaysIso(day, 1), end_date: end, ...shared },
  };
}

/** Whether a block applies on a given calendar day. */
export function blockedSlotAppliesToDate(block, targetDate) {
  const start = normalizeBlockedSlotDate(block?.date);
  const end = blockedSlotEndDate(block);
  const day = normalizeBlockedSlotDate(targetDate);
  if (!start || !day) return false;
  return start <= day && day <= end;
}

export function blockedSlotMatchesEquipment(block, equipment, resolveEquipment = (eq) => eq) {
  if (block?.is_global) return true;
  if (!equipment) return false;
  return resolveEquipment(block?.equipment) === resolveEquipment(equipment);
}

/** Blocks visible on a calendar day, optionally filtered by equipment column. */
export function blockedSlotsForCalendarDay(
  blockedSlots,
  fullDate,
  { equipment = null, resolveEquipment = (eq) => eq } = {},
) {
  return (blockedSlots || []).filter((block) => {
    if (!blockedSlotAppliesToDate(block, fullDate)) return false;
    if (equipment == null) {
      return block.is_global || !!block.equipment;
    }
    return block.is_global || blockedSlotMatchesEquipment(block, equipment, resolveEquipment);
  });
}

/** Human-readable date range for UI messages. */
export function formatBlockedSlotDateRange(block, locale = 'es') {
  const start = normalizeBlockedSlotDate(block?.date);
  const end = blockedSlotEndDate(block);
  if (!start) return '';
  if (!end || end === start) return start;
  const sep = locale === 'en' ? ' to ' : ' al ';
  return `${start}${sep}${end}`;
}

/** Backfill end_date in DB for legacy rows; always returns normalized rows. */
export async function ensureBlockedSlotsEndDates(supabase, rows) {
  const normalized = normalizeBlockedSlotRows(rows);
  if (!supabase) return normalized;

  const missing = (rows || []).filter((row) => row?.id && !normalizeBlockedSlotDate(row.end_date));
  if (!missing.length) return normalized;

  for (const row of missing) {
    const date = normalizeBlockedSlotDate(row.date);
    if (!date) continue;
    const { error } = await supabase.from('blocked_slots').update({ end_date: date }).eq('id', row.id);
    if (error) {
      if (isMissingBlockedSlotEndDateColumnError(error)) return normalized;
      break;
    }
  }

  return normalized;
}
