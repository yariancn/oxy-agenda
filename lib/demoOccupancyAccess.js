import { normalizeStaffEmail } from './staffEmail.js';

export function canManageDemoOccupancy(user) {
  if (!user) return false;
  if (user.id === 'admin') return true;
  const owner = normalizeStaffEmail(process.env.STAFF_DEMO_OWNER_EMAIL || '');
  const email = normalizeStaffEmail(user?.email);
  return Boolean(owner && email && owner === email);
}
