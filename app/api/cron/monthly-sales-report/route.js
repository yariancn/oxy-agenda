import { NextResponse } from 'next/server';
import { authorizeCron } from '../../../../lib/cronAuth.js';
import { runMonthlySalesReportGdl } from '../../../../lib/weeklySalesReport.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(request) {
  const denied = authorizeCron(request);
  if (denied) return denied;

  try {
    const result = await runMonthlySalesReportGdl();
    if (!result.ok) {
      return NextResponse.json(result, { status: result.error === 'missing_resend_api_key' ? 503 : 500 });
    }
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ ok: false, error: error.message || 'Cron failed' }, { status: 500 });
  }
}
