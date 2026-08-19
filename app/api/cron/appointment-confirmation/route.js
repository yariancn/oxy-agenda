import { NextResponse } from 'next/server';
import { authorizeCron } from '../../../../lib/cronAuth.js';
import { runDailyCron } from '../../../../lib/dailyCron.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(request) {
  const denied = authorizeCron(request);
  if (denied) return denied;

  const { searchParams } = new URL(request.url);
  const forceWeeklyReport = searchParams.get('forceWeekly') === '1';
  const skipWeeklyReport = searchParams.get('skipWeekly') === '1';

  try {
    const result = await runDailyCron({ forceWeeklyReport, skipWeeklyReport });
    const status = result.ok ? 200 : 207;
    return NextResponse.json(result, { status });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error.message || 'Cron failed' }, { status: 500 });
  }
}
