/** Niveles alineados con user_roles.level y resolveStaffRoleLevel. */
export const ROLE_LEVEL = {
  MASTER: 1,
  MANAGER: 2,
  STAFF: 3,
  GUEST: 99,
};

export const AGENT_CATEGORIES = {
  SCHEDULE: 'schedule',
  PATIENTS: 'patients',
  REPORTS: 'reports',
  ADMIN: 'admin',
  SYSTEM: 'system',
};

export const AGENT_DENY_REASONS = {
  UNAUTHORIZED: 'unauthorized',
  INSUFFICIENT_LEVEL: 'insufficient_level',
  CLINIC_DENIED: 'clinic_denied',
  TOOL_DISABLED: 'tool_disabled',
  VALIDATION_FAILED: 'validation_failed',
  NOT_IMPLEMENTED: 'not_implemented',
};

/** Herramientas que el agente puede invocar (IDs estables para integración futura). */
export const AGENT_TOOL_IDS = {
  SEARCH_PATIENT: 'search_patient',
  VIEW_TODAY_SCHEDULE: 'view_today_schedule',
  VIEW_APPOINTMENT: 'view_appointment',
  CHECK_AVAILABILITY: 'check_availability',
  BOOK_APPOINTMENT: 'book_appointment',
  UPDATE_APPOINTMENT_NOTES: 'update_appointment_notes',
  CANCEL_APPOINTMENT: 'cancel_appointment',
  VIEW_DAY_REPORT: 'view_day_report',
  VIEW_SALES_REPORT: 'view_sales_report',
  VIEW_BLACK_BOX: 'view_black_box',
  VIEW_PATIENT_LEDGER: 'view_patient_ledger',
  MANAGE_BLOCKED_SLOTS: 'manage_blocked_slots',
  MANAGE_SERVICES: 'manage_services',
  MANAGE_STAFF: 'manage_staff',
  MANAGE_ROLES: 'manage_roles',
  VIEW_COMPANY_CONFIG: 'view_company_config',
  RUN_DESIGN_AUDIT: 'run_design_audit',
  HELP_GUIDE: 'help_guide',
};

export const DESIGN_AUDIT_SEVERITY = {
  CRITICAL: 'critical',
  HIGH: 'high',
  MEDIUM: 'medium',
  LOW: 'low',
};
