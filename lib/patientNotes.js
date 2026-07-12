const SETMORE_IMPORT_PREFIX = 'import-setmore-gdl';

function normalizeNoteText(value) {
  return String(value || '').trim();
}

export function isSystemImportNote(value) {
  const text = normalizeNoteText(value).toLowerCase();
  if (!text) return false;
  if (text === SETMORE_IMPORT_PREFIX) return true;
  if (text.startsWith(SETMORE_IMPORT_PREFIX)) return true;
  if (text.includes('setmore:')) return true;
  if (/importar.*setmore/i.test(text)) return true;
  if (/hay que importar/i.test(text)) return true;
  return false;
}

/** Quita marcadores técnicos de Setmore; deja notas reales del staff. */
export function sanitizePatientNotesForDisplay(value) {
  const raw = String(value || '');
  const lines = raw
    .split(/\r?\n+/)
    .map((line) => line.trim())
    .filter((line) => line && !isSystemImportNote(line));
  return lines.join('\n').trim();
}

/** Notas del día en la cita: ocultar marcadores de importación. */
export function sanitizeAppointmentNotesForDisplay(value) {
  return sanitizePatientNotesForDisplay(value);
}

export { SETMORE_IMPORT_PREFIX };
