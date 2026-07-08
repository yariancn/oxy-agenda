import { normalizeStaffEmail } from './staffEmail.js';

const LEVEL1_ROLE_PATTERNS = [
  /super\s+administrador/i,
  /administrador\s+maestro/i,
  /^administrador$/i,
];

export function canManageDemoOccupancy(user) {
  if (!user) return false;
  if (user.id === 'admin') return true;
  if (Number(user.accessLevel) <= 1) return true;
  const role = String(user?.role || '');
  if (LEVEL1_ROLE_PATTERNS.some((re) => re.test(role))) return true;
  const owner = normalizeStaffEmail(process.env.STAFF_DEMO_OWNER_EMAIL || '');
  const email = normalizeStaffEmail(user?.email);
  return Boolean(owner && email && owner === email);
}
