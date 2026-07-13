import { buildAgentContext } from './context.js';
import { runDesignAudit } from './designAudit.js';
import { buildAdminDesignAlert } from './adminNotify.js';
import { classifyAgentIntent } from './intents.js';
import { formatDenialForUser } from './permissions.js';
import { listFacultiesForLevel } from './faculties.js';
import { executeAgentTool } from './tools.js';
import { parseMessageParams } from './parseParams.js';
import { AGENT_TOOL_IDS } from './constants.js';
import { buildGeneralHelp, isHelpQuestion } from './helpGuide.js';

export async function handleAgentMessage({
  user,
  dbRoles = [],
  activeClinic = null,
  message = '',
  locale = 'es',
  services = null,
} = {}) {
  const ctx = buildAgentContext({ user, dbRoles, activeClinic, message });

  if (!ctx.authenticated) {
    return agentResponse({
      ok: false,
      reply: locale === 'en' ? 'Sign in with your staff PIN.' : 'Inicia sesión con tu NIP de staff.',
      denied: true,
      reason: 'unauthorized',
    });
  }

  const intent = classifyAgentIntent(message);
  const parsedParams = parseMessageParams(message, {
    referenceDate: services?.clinicToday?.() || undefined,
    clinic: ctx.activeClinic,
  });

  if (!intent.toolId) {
    if (isHelpQuestion(message)) {
      const help = await executeAgentTool(AGENT_TOOL_IDS.HELP_GUIDE, {
        ctx,
        params: { message, ...parsedParams },
        services,
        locale,
      });
      return agentResponse({
        ok: true,
        reply: help.reply || buildGeneralHelp({ roleLevel: ctx.roleLevel, locale }),
        toolId: AGENT_TOOL_IDS.HELP_GUIDE,
        ctx: summarizeCtx(ctx),
      });
    }
    const allowed = listFacultiesForLevel(ctx.roleLevel);
    const hint = locale === 'en'
      ? `${buildGeneralHelp({ roleLevel: ctx.roleLevel, locale })}\n\nQuick actions: ${allowed.slice(0, 5).map((f) => f.nameEn).join(', ')}…`
      : `${buildGeneralHelp({ roleLevel: ctx.roleLevel, locale })}\n\nAcciones rápidas: ${allowed.slice(0, 5).map((f) => f.nameEs).join(', ')}…`;
    return agentResponse({
      ok: true,
      reply: hint,
      ctx: summarizeCtx(ctx),
      availableFaculties: allowed.map((f) => f.id),
    });
  }

  const result = await executeAgentTool(intent.toolId, {
    ctx,
    params: { message, ...parsedParams },
    services,
    locale,
  });

  if (!result.ok) {
    const denialMsg = formatDenialForUser(
      { allowed: false, message: result.message },
      locale,
    );
    return agentResponse({
      ok: false,
      reply: denialMsg,
      denied: result.error === 'insufficient_level' || result.error === 'unauthorized',
      reason: result.error,
      toolId: intent.toolId,
      ctx: summarizeCtx(ctx),
    });
  }

  if (intent.toolId === AGENT_TOOL_IDS.RUN_DESIGN_AUDIT) {
    const alert = buildAdminDesignAlert(result.data, { locale });
    const reply = alert.shouldNotify
      ? `${alert.title}\n\n${alert.body}`
      : (locale === 'en' ? 'No critical design issues found.' : 'No se encontraron hallazgos críticos.');
    return agentResponse({
      ok: true,
      reply,
      toolId: intent.toolId,
      data: result.data,
      ctx: summarizeCtx(ctx),
      adminAlert: alert.shouldNotify ? alert : undefined,
    });
  }

  return agentResponse({
    ok: true,
    reply: result.reply || (locale === 'en' ? 'Done.' : 'Listo.'),
    toolId: intent.toolId,
    data: result.data,
    ctx: summarizeCtx(ctx),
  });
}

function summarizeCtx(ctx) {
  return {
    staffName: ctx.staffName,
    roleLevel: ctx.roleLevel,
    activeClinic: ctx.activeClinic,
    allowedClinics: ctx.allowedClinics,
    isMaster: ctx.isMaster,
  };
}

function agentResponse(payload) {
  return {
    version: '0.2.0',
    timestamp: new Date().toISOString(),
    ...payload,
  };
}

export async function getAgentCapabilitiesForUser({ user, dbRoles = [], activeClinic = null, locale = 'es' } = {}) {
  const ctx = buildAgentContext({ user, dbRoles, activeClinic });
  const faculties = listFacultiesForLevel(ctx.roleLevel);
  return {
    roleLevel: ctx.roleLevel,
    isMaster: ctx.isMaster,
    allowedClinics: ctx.allowedClinics,
    faculties: faculties.map((f) => ({
      id: f.id,
      name: locale === 'en' ? f.nameEn : f.nameEs,
      description: locale === 'en' ? f.descriptionEs : f.descriptionEs,
      status: f.status,
      minLevel: f.minLevel,
    })),
  };
}
