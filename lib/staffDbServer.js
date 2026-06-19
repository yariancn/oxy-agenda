import { canAccessClinic } from './clinicAccess.js';
import { getSupabaseAdmin } from './supabaseAdmin.js';

export const STAFF_DB_TABLES = new Set([
  'patients',
  'appointments',
  'services',
  'users_staff',
  'blocked_slots',
  'company_config',
  'protocols',
  'user_roles',
  'promoters',
  'audit_logs',
]);

function applyFilters(query, filters = []) {
  let next = query;
  for (const filter of filters) {
    if (filter.op === 'eq') next = next.eq(filter.col, filter.val);
    if (filter.op === 'neq') next = next.neq(filter.col, filter.val);
    if (filter.op === 'ilike') next = next.ilike(filter.col, filter.val);
    if (filter.op === 'in') next = next.in(filter.col, filter.val);
  }
  return next;
}

export async function executeStaffDbQuery({
  clinic,
  table,
  action = 'select',
  select = '*',
  filters = [],
  order = null,
  limit = null,
  range = null,
  single = false,
  maybeSingle = false,
  data = null,
}) {
  if (!STAFF_DB_TABLES.has(table)) {
    throw new Error(`Table not allowed: ${table}`);
  }

  const supabase = getSupabaseAdmin(clinic);

  if (action === 'select') {
    let query = supabase.from(table).select(select || '*');
    query = applyFilters(query, filters);
    if (order?.col) query = query.order(order.col, { ascending: order.ascending !== false });
    if (limit != null) query = query.limit(limit);
    if (range) query = query.range(range.from, range.to);
    if (single) query = query.single();
    if (maybeSingle) query = query.maybeSingle();
    return query;
  }

  if (action === 'insert') {
    let query = supabase.from(table).insert(Array.isArray(data) ? data : [data]);
    query = query.select(select || '*');
    return query;
  }

  if (action === 'update') {
    let query = applyFilters(supabase.from(table).update(data), filters);
    if (select) query = query.select(select);
    return query;
  }

  if (action === 'delete') {
    return applyFilters(supabase.from(table).delete(), filters);
  }

  throw new Error(`Unsupported action: ${action}`);
}

export function assertStaffClinicAccess(user, clinic) {
  if (!user) throw new Error('Unauthorized');
  if (!canAccessClinic(user, clinic)) throw new Error('Clinic access denied');
}
