export function isVercelCronRequest(request) {
  if (request.headers.get('x-vercel-cron') === '1') return true;
  const ua = String(request.headers.get('user-agent') || '');
  return /vercel-cron/i.test(ua);
}
