import { NextResponse } from 'next/server';
import { authorizeCron } from '../../../../lib/cronAuth.js';
import { runLabsMobileBalanceAlert } from '../../../../lib/labsMobileBalanceAlert.js';

export async function GET(request) {
  const denied = authorizeCron(request);
  if (denied) return denied;

  try {
    const result = await runLabsMobileBalanceAlert();
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ ok: false, error: error.message || 'Cron failed' }, { status: 500 });
  }
}
