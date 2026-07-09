/** Suma offsetLeft desde `el` hasta `ancestor` (sin incluir ancestor). */
export function cumulativeOffsetLeft(el, ancestor) {
  let left = 0;
  let node = el;
  while (node && node !== ancestor) {
    left += node.offsetLeft;
    node = node.parentElement;
    if (node && !ancestor.contains(node)) break;
  }
  return left;
}

/**
 * scrollLeft para alinear la columna de hoy justo después de la columna de horas fija.
 */
export function getWeekScrollLeftForToday(containerEl, dateStr) {
  if (!containerEl || !dateStr) return null;
  const todayCol = containerEl.querySelector(`[data-cal-day="${dateStr}"]`);
  if (!todayCol) return null;
  const timeCol = containerEl.querySelector('[data-cal-time-col]');
  const timeColWidth = timeCol?.offsetWidth || 80;
  const containerRect = containerEl.getBoundingClientRect();
  const colRect = todayCol.getBoundingClientRect();
  const left = colRect.left - containerRect.left + containerEl.scrollLeft;
  return Math.max(0, left - timeColWidth);
}
