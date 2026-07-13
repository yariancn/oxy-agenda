import { AGENT_TOOL_IDS } from '../constants.js';
import {
  buildGeneralHelp,
  isHelpQuestion,
  resolveHelpTopic,
} from '../helpGuide.js';

export async function handleHelpGuide({ ctx, params, locale }) {
  const message = params.message || params.query || '';
  const resolved = resolveHelpTopic(message, { roleLevel: ctx.roleLevel, locale });

  if (resolved) {
    return {
      ok: true,
      reply: resolved.reply,
      data: { topicId: resolved.topicId },
    };
  }

  if (isHelpQuestion(message)) {
    return {
      ok: true,
      reply: buildGeneralHelp({ roleLevel: ctx.roleLevel, locale }),
      data: { topicId: 'general' },
    };
  }

  return {
    ok: true,
    reply: buildGeneralHelp({ roleLevel: ctx.roleLevel, locale }),
    data: { topicId: 'general' },
  };
}

export const HELP_HANDLERS = {
  [AGENT_TOOL_IDS.HELP_GUIDE]: handleHelpGuide,
};
