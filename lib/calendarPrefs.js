const PREFIX = 'oxy-agenda-cal-v1';

function storageKey(clinic) {
  return `${PREFIX}-${clinic === 'Shenandoah' ? 'tx' : 'gdl'}`;
}

export function loadCalendarPrefs(clinic) {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(storageKey(clinic));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

export function saveCalendarPrefs(clinic, prefs) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(storageKey(clinic), JSON.stringify(prefs));
  } catch {
    /* quota / private mode */
  }
}
