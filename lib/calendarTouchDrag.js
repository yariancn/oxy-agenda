/**
 * Resolve calendar drop target under a point (touch / pointer drag).
 */
export function findCalendarDropSlot(clientX, clientY) {
  if (typeof document === 'undefined') return null;
  const stack = typeof document.elementsFromPoint === 'function'
    ? document.elementsFromPoint(clientX, clientY)
    : [document.elementFromPoint(clientX, clientY)].filter(Boolean);

  for (const el of stack) {
    const slot = el?.closest?.('[data-drop-slot="1"]');
    if (!slot) continue;
    const time = slot.getAttribute('data-time') || '';
    const equipment = slot.getAttribute('data-equipment') || '';
    const day = slot.getAttribute('data-day') || '';
    const fullDate = slot.getAttribute('data-full-date') || '';
    const outsideHours = slot.getAttribute('data-outside') === '1';
    if (time && equipment && fullDate) {
      return { time, equipment, day, fullDate, outsideHours };
    }
  }
  return null;
}
