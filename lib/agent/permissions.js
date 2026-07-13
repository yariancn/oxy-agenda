import { ROLE_LEVEL, AGENT_DENY_REASONS } from './constants.js';

/**
 * Reglas de permiso del agente — espejo explícito de la UI actual (page.js),
 * pero evaluadas en servidor antes de ejecutar cualquier herramienta.
 */
export function canUseAgentTool(ctx, tool) {
  if (!ctx?.authenticated) {
    return deny(AGENT_DENY_REASONS.UNAUTHORIZED, 'Sesión staff requerida.');
  }
  if (!tool?.enabled) {
    return deny(AGENT_DENY_REASONS.TOOL_DISABLED, `Herramienta deshabilitada: ${tool?.id || 'unknown'}`);
  }
  if (tool.minLevel != null && ctx.roleLevel > tool.minLevel) {
    return deny(
      AGENT_DENY_REASONS.INSUFFICIENT_LEVEL,
      `Requiere nivel ${tool.minLevel} o superior. Tu nivel: ${ctx.roleLevel}.`,
    );
  }
  if (tool.masterOnly && !ctx.isMaster) {
    return deny(
      AGENT_DENY_REASONS.INSUFFICIENT_LEVEL,
      'Solo administrador maestro puede usar esta acción.',
    );
  }
  return { allowed: true };
}

function deny(reason, message) {
  return { allowed: false, reason, message };
}

export function canViewReports(ctx) {
  return ctx?.authenticated && ctx.roleLevel <= ROLE_LEVEL.MANAGER;
}

export function canViewBlackBox(ctx) {
  return canViewReports(ctx);
}

export function canManageAdmin(ctx) {
  return ctx?.authenticated && ctx.roleLevel <= ROLE_LEVEL.MANAGER;
}

export function canManageMasterOnly(ctx) {
  return ctx?.authenticated && ctx.isMaster;
}

export function formatDenialForUser(denial, locale = 'es') {
  if (!denial || denial.allowed !== false) return '';
  if (locale === 'en') {
    return denial.message || 'Action not permitted for your access level.';
  }
  return denial.message || 'Acción no permitida para tu nivel de acceso.';
}
