import { AGENT_TOOL_IDS } from './constants.js';

/**
 * Clasificación por reglas (fase 1, sin LLM).
 * Integración futura: reemplazar o complementar con modelo en servidor.
 */
const INTENT_RULES = [
  {
    toolId: AGENT_TOOL_IDS.RUN_DESIGN_AUDIT,
    patterns: [
      /auditor[ií]a/i,
      /design audit/i,
      /fallas?\s+de\s+dise[nñ]o/i,
      /huecos?\s+de\s+permiso/i,
      /riesgos?\s+del\s+sistema/i,
    ],
  },
  {
    toolId: AGENT_TOOL_IDS.VIEW_SALES_REPORT,
    patterns: [
      /reporte\s+de\s+ventas/i,
      /ventas\s+de\s+hoy/i,
      /sales\s+report/i,
      /cu[aá]nto\s+vendimos/i,
    ],
  },
  {
    toolId: AGENT_TOOL_IDS.VIEW_BLACK_BOX,
    patterns: [/caja\s+negra/i, /black\s+box/i, /auditor[ií]a\s+de\s+caja/i],
  },
  {
    toolId: AGENT_TOOL_IDS.VIEW_DAY_REPORT,
    patterns: [/reporte\s+del\s+d[ií]a/i, /day\s+report/i],
  },
  {
    toolId: AGENT_TOOL_IDS.SEARCH_PATIENT,
    patterns: [/busca(?:r)?\s+pacientes?/i, /encuentra.*pacientes?/i, /search\s+patients?/i],
  },
  {
    toolId: AGENT_TOOL_IDS.CHECK_AVAILABILITY,
    patterns: [/disponibilidad/i, /hueco/i, /availability/i, /libre.*horario/i],
  },
  {
    toolId: AGENT_TOOL_IDS.BOOK_APPOINTMENT,
    patterns: [/agendar/i, /reservar\s+cita/i, /book\s+appointment/i, /nueva\s+cita/i],
  },
  {
    toolId: AGENT_TOOL_IDS.VIEW_TODAY_SCHEDULE,
    patterns: [/agenda\s+de\s+hoy/i, /ver\s+agenda/i, /today.*schedule/i, /citas\s+de\s+hoy/i],
  },
  {
    toolId: AGENT_TOOL_IDS.VIEW_APPOINTMENT,
    patterns: [/detalle\s+de\s+cita/i, /ver\s+cita/i, /appointment\s+detail/i],
  },
  {
    toolId: AGENT_TOOL_IDS.CANCEL_APPOINTMENT,
    patterns: [/cancelar\s+cita/i, /cancel\s+appointment/i],
  },
  {
    toolId: AGENT_TOOL_IDS.UPDATE_APPOINTMENT_NOTES,
    patterns: [/nota[s]?\s*:/i, /actualizar\s+nota/i, /update\s+notes/i],
  },
  {
    toolId: AGENT_TOOL_IDS.VIEW_PATIENT_LEDGER,
    patterns: [/libro\s+mayor/i, /ledger/i, /historial\s+de\s+ventas/i],
  },
];

export function classifyAgentIntent(message) {
  const text = String(message || '').trim();
  if (!text) return { toolId: null, confidence: 0 };

  for (const rule of INTENT_RULES) {
    for (const pattern of rule.patterns) {
      if (pattern.test(text)) {
        return { toolId: rule.toolId, confidence: 0.85, matched: pattern.source };
      }
    }
  }

  return { toolId: null, confidence: 0 };
}

export function listSupportedIntents() {
  return INTENT_RULES.map((r) => ({
    toolId: r.toolId,
    patterns: r.patterns.map((p) => p.source),
  }));
}
