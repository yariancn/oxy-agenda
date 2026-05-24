export const SESSION_PRESETS = {
  standard: {
    id: 'standard',
    duration: 60,
    buffer: 30,
    label: 'Estándar — 60 min sesión (1h 30 en agenda)',
    shortLabel: '60 min',
  },
  extended: {
    id: 'extended',
    duration: 90,
    buffer: 90,
    label: 'Extendida — 90 min sesión (3h en agenda)',
    shortLabel: '90 min',
    staffOnly: true,
  },
};

export const PUBLIC_SESSION = SESSION_PRESETS.standard;

export function getPresetFromTimes(duration, buffer) {
  if (Number(duration) === 90 && Number(buffer) === 90) return SESSION_PRESETS.extended;
  return SESSION_PRESETS.standard;
}

export function getTotalBlockMins({ duration, buffer }) {
  return (Number(duration) || 60) + (Number(buffer) || 0);
}
