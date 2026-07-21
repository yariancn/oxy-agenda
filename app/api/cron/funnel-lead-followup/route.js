import { NextResponse } from 'next/server';
import { authorizeCron } from '../../../../lib/cronAuth.js';
import { processAllFunnelFollowups } from '../../../../lib/funnelLeadNotify.js';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function authorizeFunnelCron(request) {
  const cronDenied = authorizeCron(request);
  if (!cronDenied) return null;

  const funnelSecret = String(process.env.FUNNEL_LEAD_SECRET || process.env.OXY_LEADS_SECRET || '').trim();
  if (!funnelSecret) return cronDenied;

  const auth = request.headers.get('authorization') || '';
  const bearer = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  const { searchParams } = new URL(request.url);
  const querySecret = searchParams.get('secret') || '';
  if (bearer === funnelSecret || querySecret === funnelSecret) return null;

  return cronDenied;
}

export async function GET(request) {
  const denied = authorizeFunnelCron(request);
  if (denied) return denied;

  try {
    const result = await processAllFunnelFollowups();
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}

export async function POST(request) {
  return GET(request);
}
