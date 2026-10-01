import { NextResponse } from 'next/server';
import { authorizeCron } from '../../../../lib/cronAuth.js';
import { runAppointmentCronTasks } from '../../../../lib/dailyCron.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Lightweight cron: SI/NO confirmation SMS only (every ~5 min).
 * Sends ~6h before first visits, or soon after booking if already inside that window.
 * Daily reports stay on /api/cron/appointment-confirmation.
 */
export async function GET(request) {
  const denied = authorizeCron(request);
  if (denied) return denied;

  try {
    const result = await runAppointmentCronTasks();
    const conf = result?.confirmation || {};
    const ok = Object.values(conf).every((r) => r?.ok !== false);
    return NextResponse.json({ ok, confirmation: conf }, { status: ok ? 200 : 207 });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error.message || 'Confirmation cron failed' }, { status: 500 });
  }
}
