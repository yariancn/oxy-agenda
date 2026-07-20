/**
 * Staff privilege levels: lower number = more access.
 * 1 = super admin, 2 = admin/manager, 99 = unresolved / staff floor.
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
