import { NextResponse } from 'next/server';
import { authorizeCron } from '../../../../lib/cronAuth.js';
import { runAppointmentCronTasks } from '../../../../lib/dailyCron.js';

export async function GET(request) {
  const denied = authorizeCron(request);
  if (denied) return denied;

  try {
    const { confirmation, reminders } = await runAppointmentCronTasks();
    return NextResponse.json({ ok: true, confirmation, reminders });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error.message || 'Cron failed' }, { status: 500 });
  }
}
