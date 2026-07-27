/**
 * Staff privilege levels: lower number = more access.
 * 1 = master, 2 = manager, 3 = staff (agenda), 99 = only for unauthenticated guest.
 * Logged-in users whose role name is missing from user_roles must still get STAFF (3),
 * never 99 — otherwise /api/staff/db blocks appointments (“rol no reconocido”).
 */

export function normalizeRoleKey(roleName) {
  return String(roleName || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Infer level from role title when user_roles row is missing or misnamed. */
export function inferRoleLevelFromName(roleName) {
  const n = normalizeRoleKey(roleName);
  if (!n) return null;

  if (
    /super\s*administrador|administrador\s*maestro|administrador\s*supremo|super\s*admin\b|admin\s*supremo|maestro\b/.test(n)
    || (n.includes('super') && n.includes('admin'))
  ) {
    return 1;
  }

  if (
    /\badministrador\b|\bgerente\b|\bmanager\b|\bdirector\b|^admin\b|\badmin\b/.test(n)
  ) {
    return 2;
  }

  // Common clinic floor roles → staff (can operate agenda).
  if (
    /\brecepcion|\brecepcionista|\boperador|\boperadora|\bempleado|\bempleada|\bstaff\b|\bterapeuta|\benfermer|\basistente|\bpromotor|\btecnico|\btécnico/.test(n)
    || n === 'usuario'
    || n === 'user'
  ) {
    return 3;
  }

  return null;
}

export function findRoleLevelInDb(dbRoles = [], roleName) {
  const key = normalizeRoleKey(roleName);
  if (!key) return null;

  const exact = (dbRoles || []).find((row) => normalizeRoleKey(row.name) === key);
  if (exact?.level != null && Number.isFinite(Number(exact.level))) {
    return Number(exact.level);
  }

  // Partial match: "Super Administrador Supremo" ↔ "Super Administrador"
  const partial = (dbRoles || []).find((row) => {
    const rn = normalizeRoleKey(row.name);
    if (!rn) return false;
    return key.includes(rn) || rn.includes(key);
  });
  if (partial?.level != null && Number.isFinite(Number(partial.level))) {
    return Number(partial.level);
  }

  return inferRoleLevelFromName(roleName);
}

/** Level for a logged-in staff profile: never guest (99). */
export function resolveLoggedInRoleLevel(dbRoles, roleName) {
  const fromDbOrInfer = findRoleLevelInDb(dbRoles, roleName);
  if (fromDbOrInfer != null && Number.isFinite(Number(fromDbOrInfer)) && Number(fromDbOrInfer) > 0) {
    return Number(fromDbOrInfer);
  }
  // Authenticated user with unknown role title → agenda staff, not locked-out guest.
  return 3;
}
