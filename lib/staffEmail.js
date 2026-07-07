export function normalizeStaffEmail(email) {
  return String(email || '').trim().toLowerCase();
}

export function isValidStaffEmail(email) {
  const normalized = normalizeStaffEmail(email);
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized);
}

export function maskStaffEmail(email) {
  const normalized = normalizeStaffEmail(email);
  const [local, domain] = normalized.split('@');
  if (!local || !domain) return '';
  if (local.length <= 2) return `${local[0] || '*'}***@${domain}`;
  return `${local.slice(0, 2)}***@${domain}`;
}
