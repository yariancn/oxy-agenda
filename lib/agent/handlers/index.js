import { SCHEDULE_HANDLERS } from './schedule.js';
import { REPORT_HANDLERS } from './reports.js';
import { SYSTEM_HANDLERS } from './system.js';
import { HELP_HANDLERS } from './help.js';

export const ALL_AGENT_HANDLERS = {
  ...HELP_HANDLERS,
  ...SCHEDULE_HANDLERS,
  ...REPORT_HANDLERS,
  ...SYSTEM_HANDLERS,
};
