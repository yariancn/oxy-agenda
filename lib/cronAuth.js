import { NextResponse } from 'next/server';
import { isVercelCronRequest } from './cronRequest.js';

/** Vercel Cron scheduler, optional CRON_SECRET, or manual ?secret= when configured. */
export function authorizeCron(request) {
  const expected = String(process.env.CRON_SECRET || '').trim();
  const auth = request.headers.get('authorization') || '';
  const bearer = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  const { searchParams } = new URL(request.url);
  const querySecret = searchParams.get('secret') || '';

  if (expected && (bearer === expected || querySecret === expected)) {
    return null;
  }

  if (isVercelCronRequest(request)) {
    return null;
  }

  if (!expected) {
    return NextResponse.json(
      { error: 'Unauthorized — invoke from Vercel Cron or set CRON_SECRET for manual runs' },
      { status: 401 },
    );
  }

  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}
