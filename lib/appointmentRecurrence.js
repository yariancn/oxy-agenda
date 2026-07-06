export const MAX_OCCURRENCES = 52;

export function getRecurrenceMaxOccurrences() {
  return MAX_OCCURRENCES;
}

/** @param {string[]} dates */
export function sortOccurrenceDates(dates) {
  return [...(dates || [])].filter(Boolean).sort((a, b) => a.localeCompare(b));
}

/** @param {string[]} dates @param {string} isoDate */
export function toggleOccurrenceDate(dates, isoDate, max = MAX_OCCURRENCES) {
  const set = new Set(dates || []);
  if (set.has(isoDate)) {
    set.delete(isoDate);
    return [...set];
  }
  if (set.size >= max) return [...set];
  set.add(isoDate);
  return [...set];
}
