import { NextResponse } from 'next/server';
import { sendFunnelVisitorEmail } from '../../../../lib/funnelVisitorEmail.js';

function authorizeFunnelLead(request) {
  const expected = String(process.env.FUNNEL_LEAD_SECRET || process.env.CRON_SECRET || '').trim();
  if (!expected) {
    return NextResponse.json({ error: 'FUNNEL_LEAD_SECRET not configured' }, { status: 503 });
  }

  const auth = request.headers.get('authorization') || '';
  const bearer = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  if (bearer !== expected) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  return null;
}

export async function POST(request) {
  const denied = authorizeFunnelLead(request);
  if (denied) return denied;

  try {
    const body = await request.json().catch(() => ({}));
    const kind = String(body.kind || 'ack').trim() === 'nudge' ? 'nudge' : 'ack';
    const name = String(body.name || '').trim();
    const email = String(body.email || '').trim();
    const source = String(body.source || 'hyperbaric').trim() || 'hyperbaric';

    if (!email) {
      return NextResponse.json({ error: 'email is required' }, { status: 400 });
    }

    const result = await sendFunnelVisitorEmail(
      {
        name,
        email,
        phone: String(body.phone || '').trim(),
        goal: String(body.goal || '').trim(),
        source,
      },
      kind,
    );

    return NextResponse.json({ ok: Boolean(result.ok), ...result });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
