import { AGENT_TOOL_IDS } from './constants.js';
import { isHelpQuestion } from './helpGuide.js';
import {
  AVAILABILITY_WORDS,
  BOOK_VERBS,
  CANCEL_VERBS,
  DAY_WORDS,
  DESIGN_WORDS,
  PATIENT_NOUNS,
  REPORT_WORDS,
  SALES_WORDS,
  SCHEDULE_NOUNS,
  SEARCH_VERBS,
  foldAgentText,
  hasAllFuzzyGroups,
  hasFuzzyToken,
  looksLikePatientNameQuery,
  tokenizeAgentText,
} from './textUnderstand.js';

/**
 * Clasificación por reglas tolerante a acentos, mayúsculas y errores comunes.
 */
const INTENT_MATCHERS = [
  {
    toolId: AGENT_TOOL_IDS.HELP_GUIDE,
    match(tokens, folded, message) {
      return isHelpQuestion(message);
    },
  },
  {
    toolId: AGENT_TOOL_IDS.RUN_DESIGN_AUDIT,
    match(tokens, folded) {
      // Strict: avoid fuzzy false positives ("las"→fallas, "de"→design).
      const hasAudit = tokens.some((t) => ['auditoria', 'audit'].includes(foldAgentText(t)))
        || /\bauditoria\b|\baudit\b/.test(folded);
      if (!hasAudit) return false;
      return /(diseno|design|sistema|permiso|permisos|riesgo|riesgos|falla|fallas)/.test(folded)
        || hasFuzzyToken(tokens, [...DESIGN_WORDS, 'sistema', 'permiso', 'riesgo']);
    },
  },
  {
    toolId: AGENT_TOOL_IDS.VIEW_SALES_REPORT,
    match(tokens, folded) {
      if (hasFuzzyToken(tokens, SALES_WORDS) && hasFuzzyToken(tokens, [...REPORT_WORDS, ...DAY_WORDS])) return true;
      return /(reporte|informe|cuanto).*(venta|vendimos)/.test(folded) || /ventas.*hoy/.test(folded);
    },
  },
  {
    toolId: AGENT_TOOL_IDS.VIEW_BLACK_BOX,
    match(tokens, folded) {
      return hasAllFuzzyGroups(tokens, [['caja'], ['negra']]) || /black\s*box/.test(folded);
    },
  },
  {
    toolId: AGENT_TOOL_IDS.VIEW_DAY_REPORT,
    match(tokens, folded) {
      return hasFuzzyToken(tokens, REPORT_WORDS) && hasFuzzyToken(tokens, DAY_WORDS)
        && /(dia|day)/.test(folded);
    },
  },
  {
    toolId: AGENT_TOOL_IDS.SEARCH_PATIENT,
    match(tokens, folded) {
      if (hasAllFuzzyGroups(tokens, [SEARCH_VERBS, PATIENT_NOUNS])) return true;
      if (hasFuzzyToken(tokens, SEARCH_VERBS) && tokens.length >= 3) return true;
      if (/busca\w*\s+\w*clien/.test(folded) || /busca\w*\s+\w*pacien/.test(folded)) return true;
      if (/encuentra\w*\s+\w*clien/.test(folded) || /encuentra\w*\s+\w*pacien/.test(folded)) return true;
      if (looksLikePatientNameQuery(tokens)) return true;
      return false;
    },
  },
  {
    toolId: AGENT_TOOL_IDS.CHECK_AVAILABILITY,
    match(tokens, folded) {
      if (hasFuzzyToken(tokens, AVAILABILITY_WORDS)) return true;
      return /libre.*horario/.test(folded) || /hay\s+(lugar|espacio|hueco)/.test(folded);
    },
  },
  {
    toolId: AGENT_TOOL_IDS.VIEW_TODAY_SCHEDULE,
    match(tokens, folded) {
      if (hasFuzzyToken(tokens, SCHEDULE_NOUNS) && hasFuzzyToken(tokens, DAY_WORDS)) return true;
      if (/ver\s+agenda/.test(folded)) return true;
      if (/citas\s+de\s+hoy/.test(folded)) return true;
      return false;
    },
  },
  {
    toolId: AGENT_TOOL_IDS.BOOK_APPOINTMENT,
    match(tokens, folded) {
      if (hasFuzzyToken(tokens, SCHEDULE_NOUNS) && hasFuzzyToken(tokens, DAY_WORDS)) return false;
      if (hasFuzzyToken(tokens, BOOK_VERBS)) return true;
      return /(nueva|new)\s+(cita|appointment)/.test(folded) || /reservar\s+cita/.test(folded);
    },
  },
  {
    toolId: AGENT_TOOL_IDS.VIEW_APPOINTMENT,
    match(tokens, folded) {
      return /(detalle|ver)\s+(de\s+)?cita/.test(folded) || /appointment\s+detail/.test(folded);
    },
  },
  {
    toolId: AGENT_TOOL_IDS.CANCEL_APPOINTMENT,
    match(tokens, folded) {
      return hasFuzzyToken(tokens, CANCEL_VERBS) && /cita|appointment/.test(folded);
    },
  },
  {
    toolId: AGENT_TOOL_IDS.UPDATE_APPOINTMENT_NOTES,
    match(tokens, folded) {
      return /nota\s*:/.test(folded)
        || hasAllFuzzyGroups(tokens, [['actualizar', 'update'], ['nota', 'notas', 'notes']]);
    },
  },
  {
    toolId: AGENT_TOOL_IDS.VIEW_PATIENT_LEDGER,
    match(tokens, folded) {
      return /libro\s+mayor/.test(folded) || /\bledger\b/.test(folded)
        || (/historial/.test(folded) && hasFuzzyToken(tokens, SALES_WORDS));
    },
  },
];

export function classifyAgentIntent(message) {
  const text = String(message || '').trim();
  if (!text) return { toolId: null, confidence: 0 };

  const folded = foldAgentText(text);
  const tokens = tokenizeAgentText(text);

  for (const rule of INTENT_MATCHERS) {
    const matched = rule.match.length >= 3
      ? rule.match(tokens, folded, text)
      : rule.match(tokens, folded);
    if (matched) {
      return { toolId: rule.toolId, confidence: 0.88, matched: rule.toolId };
    }
  }

  const legacy = [
    [AGENT_TOOL_IDS.SEARCH_PATIENT, /busca\w*\s+\w*(pacien|clien)/i],
    [AGENT_TOOL_IDS.VIEW_TODAY_SCHEDULE, /agenda.*hoy|hoy.*agenda|citas.*hoy/i],
    [AGENT_TOOL_IDS.BOOK_APPOINTMENT, /agendar|reservar\s+cita/i],
  ];
  for (const [toolId, pattern] of legacy) {
    if (pattern.test(text)) return { toolId, confidence: 0.8, matched: pattern.source };
  }

  return { toolId: null, confidence: 0 };
}

export function listSupportedIntents() {
  return INTENT_MATCHERS.map((r) => ({
    toolId: r.toolId,
    patterns: [r.toolId],
  }));
}
