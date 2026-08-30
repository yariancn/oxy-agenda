import { canAccessClinic } from './clinicAccess.js';
import { filterRowsByClinic, isMissingClinicColumnError } from './clinicRegistry.js';
import { getSupabaseAdmin } from './supabaseAdmin.js';
import { bumpAgendaLiveRev, shouldBumpAgendaLiveRev } from './agendaLiveRev.js';

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
  'session_groups',
  'petty_cash_expenses',
  'cash_drawer_events',
]);

function applyFilters(query, filters = []) {
  let next = query;
  for (const filter of filters) {
    if (filter?.val == null && filter?.op !== 'neq') continue;
    if (filter.op === 'eq') next = next.eq(filter.col, filter.val);
    if (filter.op === 'neq') next = next.neq(filter.col, filter.val);
    if (filter.op === 'gte') next = next.gte(filter.col, filter.val);
    if (filter.op === 'lte') next = next.lte(filter.col, filter.val);
    if (filter.op === 'ilike') next = next.ilike(filter.col, filter.val);
    if (filter.op === 'in') next = next.in(filter.col, filter.val);
  }
  return next;
}

function countAppliedFilters(filters = []) {
  return (filters || []).filter((filter) => {
    if (!filter?.op || !filter?.col) return false;
    if (filter.op === 'in') return Array.isArray(filter.val) && filter.val.length > 0;
    return filter.val != null && filter.val !== '';
  }).length;
}

function stripClinicFilters(filters = []) {
  return filters.filter((filter) => !(filter.op === 'eq' && filter.col === 'clinic'));
}

function stripClinicFromSelect(select) {
  const cols = String(select || '*')
    .split(',')
    .map((col) => col.trim())
    .filter((col) => col && col !== 'clinic');
  return cols.length ? cols.join(', ') : '*';
}

function clinicFilterValue(filters = []) {
  const match = filters.find((filter) => filter.op === 'eq' && filter.col === 'clinic');
  return match?.val ?? null;
}

async function runSelectQuery(supabase, { table, select, filters, order, limit, range, single, maybeSingle }) {
  let query = supabase.from(table).select(select || '*');
  query = applyFilters(query, filters);
  if (order?.col) query = query.order(order.col, { ascending: order.ascending !== false });
  if (limit != null) query = query.limit(limit);
  if (range) query = query.range(range.from, range.to);
  if (single) query = query.single();
  if (maybeSingle) query = query.maybeSingle();
  return query;
}

function isAgendaRevOnlyPayload(data) {
  const row = Array.isArray(data) ? data[0] : data;
  if (!row || typeof row !== 'object') return false;
  const keys = Object.keys(row);
  return keys.length === 1 && keys[0] === 'agenda_rev';
}

async function maybeBumpLiveRev(supabase, clinic, table, result) {
  if (result?.error || !shouldBumpAgendaLiveRev(table)) return;
  await bumpAgendaLiveRev(supabase, clinic).catch(() => null);
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
    let result = await runSelectQuery(supabase, {
      table, select, filters, order, limit, range, single, maybeSingle,
    });

    const clinicId = clinicFilterValue(filters);
    if (result.error && isMissingClinicColumnError(result.error) && clinicId) {
      result = await runSelectQuery(supabase, {
        table,
        select: stripClinicFromSelect(select),
        filters: stripClinicFilters(filters),
        order,
        limit,
        range,
        single,
        maybeSingle,
      });
      if (!result.error && Array.isArray(result.data)) {
        result = { ...result, data: filterRowsByClinic(result.data, clinicId) };
      }
    }

    return result;
  }

  if (action === 'insert') {
    let query = supabase.from(table).insert(Array.isArray(data) ? data : [data]);
    query = query.select(select || '*');
    if (single) query = query.single();
    else if (maybeSingle) query = query.maybeSingle();
    const result = await query;
    if (!(table === 'company_config' && isAgendaRevOnlyPayload(data))) {
      await maybeBumpLiveRev(supabase, clinic, table, result);
    }
    return result;
  }

  if (action === 'update') {
    if (countAppliedFilters(filters) < 1) {
      return {
        data: null,
        error: {
          message: 'UPDATE requires a WHERE clause (missing id/filter). Recarga la cita e intenta de nuevo.',
        },
      };
    }
    const onlyRev = table === 'company_config' && isAgendaRevOnlyPayload(data);
    let query = applyFilters(supabase.from(table).update(data), filters);
    if (select) query = query.select(select);
    if (single) query = query.single();
    else if (maybeSingle) query = query.maybeSingle();
    const result = await query;
    if (!onlyRev) {
      await maybeBumpLiveRev(supabase, clinic, table, result);
    }
    return result;
  }

  if (action === 'delete') {
    if (countAppliedFilters(filters) < 1) {
      return {
        data: null,
        error: {
          message: 'DELETE requires a WHERE clause (missing id/filter).',
        },
      };
    }
    const result = await applyFilters(supabase.from(table).delete(), filters);
    await maybeBumpLiveRev(supabase, clinic, table, result);
    return result;
  }

  throw new Error(`Unsupported action: ${action}`);
}

export function assertStaffClinicAccess(user, clinic) {
  if (!user) throw new Error('Unauthorized');
  if (!canAccessClinic(user, clinic)) throw new Error('Clinic access denied');
}
