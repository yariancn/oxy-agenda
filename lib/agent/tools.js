import { AGENT_FACULTIES } from './faculties.js';
import { canUseAgentTool } from './permissions.js';
import { ALL_AGENT_HANDLERS } from './handlers/index.js';

function toolFromFaculty(f) {
  return {
    id: f.id,
    minLevel: f.minLevel,
    masterOnly: f.masterOnly,
    enabled: f.status !== 'disabled',
    category: f.category,
    nameEs: f.nameEs,
    nameEn: f.nameEn,
  };
}

const TOOL_REGISTRY = Object.fromEntries(
  AGENT_FACULTIES.map((f) => [f.id, toolFromFaculty(f)]),
);

export function getAgentTool(toolId) {
  return TOOL_REGISTRY[toolId] || null;
}

export function listAgentTools() {
  return Object.values(TOOL_REGISTRY);
}

export async function executeAgentTool(toolId, { ctx, params = {}, services = {}, locale = 'es' } = {}) {
  const tool = getAgentTool(toolId);
  if (!tool) {
    return { ok: false, error: 'unknown_tool', message: `Herramienta desconocida: ${toolId}` };
  }

  const gate = canUseAgentTool(ctx, tool);
  if (!gate.allowed) {
    return { ok: false, error: gate.reason, message: gate.message };
  }

  const handler = ALL_AGENT_HANDLERS[toolId];
  if (!handler) {
    return {
      ok: false,
      error: 'not_implemented',
      message: `La facultad "${toolId}" está diseñada pero aún no integrada.`,
    };
  }

  try {
    return await handler({ ctx, params, services, locale });
  } catch (err) {
    return { ok: false, error: 'execution_failed', message: err?.message || 'Error al ejecutar.' };
  }
}
