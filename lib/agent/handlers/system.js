import { runDesignAudit } from '../designAudit.js';
import { AGENT_TOOL_IDS } from '../constants.js';

export async function handleRunDesignAudit() {
  const audit = runDesignAudit();
  return { ok: true, data: audit };
}

export const SYSTEM_HANDLERS = {
  [AGENT_TOOL_IDS.RUN_DESIGN_AUDIT]: handleRunDesignAudit,
};
