import { SCHEDULE_HANDLERS } from './schedule.js';
import { REPORT_HANDLERS } from './reports.js';
import { SYSTEM_HANDLERS } from './system.js';

export const ALL_AGENT_HANDLERS = {
  ...SCHEDULE_HANDLERS,
  ...REPORT_HANDLERS,
  ...SYSTEM_HANDLERS,
};
