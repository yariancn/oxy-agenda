import { NextResponse } from 'next/server';

/** Vercel Cron sends Authorization: Bearer CRON_SECRET; manual runs use ?secret= */
export function authorizeCron(request) {
  const expected = String(process.env.CRON_SECRET || '').trim();
  if (!expected) {
    return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 503 });
  }

  const auth = request.headers.get('authorization') || '';
  const bearer = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  const { searchParams } = new URL(request.url);
  const querySecret = searchParams.get('secret') || '';

  if (bearer === expected || querySecret === expected) {
    return null;
  }

  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}
