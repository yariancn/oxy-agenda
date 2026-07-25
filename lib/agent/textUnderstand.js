/**
 * Comprensión tolerante para el agente: acentos, mayúsculas y errores comunes.
 * Sin LLM — reglas + distancia de edición en palabras clave.
 */

const STOP_WORDS = new Set(['a', 'al', 'la', 'el', 'de', 'del', 'por', 'favor', 'me', 'un', 'una', 'los', 'las', 'en', 'con', 'que', 'y', 'o']);

export const SEARCH_VERBS = ['buscar', 'busca', 'encuentra', 'encuentrame', 'search', 'localiza', 'ubica', 'dame', 'muestrame', 'mostrar'];
export const PATIENT_NOUNS = ['paciente', 'pacientes', 'cliente', 'clientes', 'patient', 'patients'];
export const SCHEDULE_NOUNS = ['agenda', 'citas', 'horario', 'schedule', 'appointments'];
export const DAY_WORDS = ['hoy', 'today'];
export const BOOK_VERBS = ['agendar', 'reservar', 'reserva', 'book', 'programar', 'programa'];
export const CANCEL_VERBS = ['cancelar', 'cancela', 'cancel'];
export const AVAILABILITY_WORDS = ['disponibilidad', 'disponible', 'hueco', 'huecos', 'libre', 'libres', 'availability'];
export const SALES_WORDS = ['ventas', 'vendimos', 'sales', 'revenue'];
export const REPORT_WORDS = ['reporte', 'report', 'informe'];
export const AUDIT_WORDS = ['auditoria', 'audit', 'fallas', 'riesgos', 'huecos', 'permiso'];
export const DESIGN_WORDS = ['diseno', 'design', 'sistema'];

export function foldAgentText(str) {
  return String(str || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ñ/gi, 'n')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function tokenizeAgentText(str) {
  const folded = foldAgentText(str);
  return folded ? folded.split(/\s+/).filter(Boolean) : [];
}

export function levenshtein(a, b) {
  const s = String(a || '');
  const t = String(b || '');
  if (s === t) return 0;
  if (!s.length) return t.length;
  if (!t.length) return s.length;

  const rows = s.length + 1;
  const cols = t.length + 1;
  const matrix = Array.from({ length: rows }, () => Array(cols).fill(0));

  for (let i = 0; i < rows; i += 1) matrix[i][0] = i;
  for (let j = 0; j < cols; j += 1) matrix[0][j] = j;

  for (let i = 1; i < rows; i += 1) {
    for (let j = 1; j < cols; j += 1) {
      const cost = s[i - 1] === t[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost,
      );
    }
  }
  return matrix[rows - 1][cols - 1];
}

export function maxEditDistance(token) {
  const len = String(token || '').length;
  if (len <= 3) return 0;
  if (len <= 5) return 1;
  if (len <= 8) return 2;
  return 3;
}

export function fuzzyMatchToken(token, candidates) {
  const folded = foldAgentText(token);
  if (!folded) return null;

  for (const candidate of candidates) {
    const target = foldAgentText(candidate);
    if (!target) continue;
    if (folded === target) return candidate;
    // Substring only for longer tokens — short ones ("de","las","ma") false-positive
    // against "design","fallas","sistema" and misroute help to master-only tools.
    if (folded.length >= 4 && target.length >= 4
      && (folded.includes(target) || target.includes(folded))) {
      return candidate;
    }
    if (levenshtein(folded, target) <= maxEditDistance(folded)) return candidate;
  }
  return null;
}

export function hasFuzzyToken(tokens, candidates) {
  return tokens.some((token) => fuzzyMatchToken(token, candidates));
}

export function hasAllFuzzyGroups(tokens, groups) {
  return groups.every((group) => hasFuzzyToken(tokens, group));
}

function isNameLikeToken(token) {
  return /^[a-z]{2,}$/i.test(token) && !STOP_WORDS.has(foldAgentText(token));
}

function hasCommandToken(tokens) {
  const commandWords = [
    ...SEARCH_VERBS,
    ...PATIENT_NOUNS,
    ...SCHEDULE_NOUNS,
    ...DAY_WORDS,
    ...BOOK_VERBS,
    ...CANCEL_VERBS,
    ...AVAILABILITY_WORDS,
    ...SALES_WORDS,
    ...REPORT_WORDS,
    ...AUDIT_WORDS,
    ...DESIGN_WORDS,
    'cita',
    'citas',
    'nota',
    'notas',
    'manana',
    'tomorrow',
    'camara',
    'caja',
    'negra',
    'ledger',
    'mayor',
  ];
  return tokens.some((token) => fuzzyMatchToken(token, commandWords));
}

export function looksLikePatientNameQuery(tokens) {
  if (tokens.length < 2 || tokens.length > 6) return false;
  if (hasCommandToken(tokens)) return false;
  return tokens.every(isNameLikeToken);
}

export function stripPatientSearchPrefix(message) {
  const originalTokens = String(message || '').trim().split(/\s+/).filter(Boolean);
  if (!originalTokens.length) return '';

  const foldedTokens = originalTokens.map((t) => foldAgentText(t));
  let i = 0;

  if (i < foldedTokens.length && fuzzyMatchToken(foldedTokens[i], SEARCH_VERBS)) i += 1;
  if (i < foldedTokens.length && fuzzyMatchToken(foldedTokens[i], PATIENT_NOUNS)) i += 1;
  while (i < foldedTokens.length && STOP_WORDS.has(foldedTokens[i])) i += 1;

  const remainder = originalTokens.slice(i).join(' ').trim();
  return remainder || String(message || '').trim();
}

export function extractLoosePatientName(message) {
  const text = String(message || '').trim();
  const folded = foldAgentText(text);

  const patterns = [
    /pacientes?\s+(.+?)(?:\s+\d{1,2}\s*[:.h]|$)/i,
    /clientes?\s+(.+?)(?:\s+\d{1,2}\s*[:.h]|$)/i,
    /para\s+([a-z]+(?:\s+[a-z]+)+)/i,
    /cita\s+(?:de|para)\s+([a-z]+(?:\s+[a-z]+)+)/i,
  ];

  for (const pattern of patterns) {
    const match = folded.match(pattern);
    if (match?.[1]) return match[1].trim();
  }

  const stripped = stripPatientSearchPrefix(text);
  const strippedTokens = tokenizeAgentText(stripped);
  if (looksLikePatientNameQuery(strippedTokens)) return stripped;

  return '';
}
