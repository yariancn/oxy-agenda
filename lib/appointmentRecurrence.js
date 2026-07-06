const MAX_OCCURRENCES = 52;

function parseIsoDate(isoDate) {
  const [y, m, d] = String(isoDate || '').split('-').map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d, 12, 0, 0, 0);
}

function formatIsoDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * @param {{ startDate: string, frequency: 'daily' | 'weekly', count?: number }} opts
 * @returns {string[]}
 */
export function buildRecurrenceDates({ startDate, frequency = 'weekly', count = 2 }) {
  const start = parseIsoDate(startDate);
  if (!start) return [];

  const total = Math.min(MAX_OCCURRENCES, Math.max(1, Number(count) || 1));
  const stepDays = frequency === 'daily' ? 1 : 7;
  const dates = [];

  for (let i = 0; i < total; i += 1) {
    const next = new Date(start);
    next.setDate(start.getDate() + stepDays * i);
    dates.push(formatIsoDate(next));
  }

  return dates;
}

export function getRecurrenceMaxOccurrences() {
  return MAX_OCCURRENCES;
}
