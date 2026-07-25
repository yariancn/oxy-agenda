import { ROLE_LEVEL } from './agent/constants.js';

/**
 * Server-side table/action gates for /api/staff/db.
 * Aligns with UI: staff (3) operate agenda; managers (2) admin/services/reports;
 * master (1) roles + staff users + secrets.
 */

const STAFF = ROLE_LEVEL.STAFF;
const MANAGER = ROLE_LEVEL.MANAGER;
const MASTER = ROLE_LEVEL.MASTER;

/** Minimum level (lower = more privilege) for SELECT. */
const SELECT_MIN_LEVEL = {
  patients: STAFF,
  appointments: STAFF,
  services: STAFF,
  blocked_slots: STAFF,
  protocols: STAFF,
  promoters: STAFF,
  session_groups: STAFF,
  company_config: STAFF,
  users_staff: STAFF, // needed for attendants / fetchAllData; pins stripped
  user_roles: STAFF, // needed for role labels; mutations are master-only
  audit_logs: MANAGER,
};

/** Minimum level for insert/update/delete (unless special-cased below). */
const MUTATION_MIN_LEVEL = {
  patients: STAFF,
  appointments: STAFF,
  session_groups: STAFF,
  blocked_slots: STAFF,
  audit_logs: STAFF, // all staff write audit rows
  services: MANAGER,
  protocols: MANAGER,
  promoters: MANAGER,
  company_config: MANAGER,
  users_staff: MASTER,
  user_roles: MASTER,
};

const COMPANY_CONFIG_SECRET_KEYS = [
  'master_pin',
  'google_refresh_token',
  'google_access_token',
  'google_calendar_tokens',
  'twilio_auth_token',
  'labsmobile_token',
];

const USERS_STAFF_SECRET_KEYS = ['pin', 'Pin', 'password'];

function roleLevelOf(user) {
  const n = Number(user?.accessLevel);
  return Number.isFinite(n) && n > 0 ? n : ROLE_LEVEL.GUEST;
}

function isAgendaRevOnlyPayload(data) {
  const row = Array.isArray(data) ? data[0] : data;
  if (!row || typeof row !== 'object') return false;
  const keys = Object.keys(row);
  return keys.length === 1 && keys[0] === 'agenda_rev';
}

export function assertStaffDbPermission(user, { table, action = 'select', data = null } = {}) {
  if (!user) {
    const err = new Error('Unauthorized');
    err.status = 401;
    throw err;
  }

  const level = roleLevelOf(user);
  const act = String(action || 'select').toLowerCase();

  if (act === 'select') {
    const min = SELECT_MIN_LEVEL[table];
    if (min == null) {
      const err = new Error(`Table not allowed: ${table}`);
      err.status = 403;
      throw err;
    }
    if (level > min) {
      const err = new Error(`Insufficient level for ${table} (${act}).`);
      err.status = 403;
      throw err;
    }
    return true;
  }

  // Live sync bump: any authenticated staff may update only agenda_rev.
  if (table === 'company_config' && act === 'update' && isAgendaRevOnlyPayload(data)) {
    if (level > STAFF) {
      const err = new Error('Insufficient level for agenda sync.');
      err.status = 403;
      throw err;
    }
    return true;
  }

  const min = MUTATION_MIN_LEVEL[table];
  if (min == null) {
    const err = new Error(`Table not allowed: ${table}`);
    err.status = 403;
    throw err;
  }
  if (level > min) {
    const err = new Error(`Insufficient level for ${table} (${act}).`);
    err.status = 403;
    throw err;
  }
  return true;
}

function stripKeys(row, keys) {
  if (!row || typeof row !== 'object') return row;
  const next = { ...row };
  for (const key of keys) {
    if (key in next) delete next[key];
  }
  return next;
}

/** Remove secrets from SELECT payloads before they reach the browser. */
export function sanitizeStaffDbSelectData(user, table, data) {
  if (data == null) return data;
  const level = roleLevelOf(user);

  if (table === 'company_config') {
    const stripSecrets = level > MASTER;
    const mapRow = (row) => (stripSecrets ? stripKeys(row, COMPANY_CONFIG_SECRET_KEYS) : row);
    return Array.isArray(data) ? data.map(mapRow) : mapRow(data);
  }

  if (table === 'users_staff') {
    const mapRow = (row) => stripKeys(row, USERS_STAFF_SECRET_KEYS);
    return Array.isArray(data) ? data.map(mapRow) : mapRow(data);
  }

  return data;
}
