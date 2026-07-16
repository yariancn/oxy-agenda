/**
 * Best-effort client IP from reverse-proxy headers (Vercel / Cloudflare).
 * Normalizes IPv4-mapped IPv6 so the same clinic network hashes consistently.
 */
export function normalizeClientIp(raw) {
  let ip = String(raw || '').trim().toLowerCase();
  if (!ip) return '';

  // Strip surrounding brackets used for IPv6 literals: [::1]
  if (ip.startsWith('[') && ip.endsWith(']')) {
    ip = ip.slice(1, -1);
  }

  // host:port for IPv4 only (avoid breaking IPv6)
  if (/^\d{1,3}(\.\d{1,3}){3}:\d+$/.test(ip)) {
    ip = ip.replace(/:\d+$/, '');
  }

  // ::ffff:192.0.2.1 → 192.0.2.1
  const v4Mapped = ip.match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/);
  if (v4Mapped) return v4Mapped[1];

  return ip;
}

export function getRequestClientIp(request) {
  if (!request?.headers) return '';

  const candidates = [
    request.headers.get('x-forwarded-for'),
    request.headers.get('x-real-ip'),
    request.headers.get('cf-connecting-ip'),
    request.headers.get('x-vercel-forwarded-for'),
  ];

  for (const header of candidates) {
    const raw = String(header || '').trim();
    if (!raw) continue;
    const first = raw.split(',')[0]?.trim();
    const normalized = normalizeClientIp(first);
    if (normalized) return normalized;
  }

  return '';
}
