import { NextResponse } from 'next/server';
import { notifyFunnelLead } from '../../../../lib/funnelLeadNotify.js';

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
    const body = await request.json();
    const name = String(body.name || '').trim();
    const phone = String(body.phone || '').trim();
    const email = String(body.email || '').trim();

    if (!name || !phone || !email) {
      return NextResponse.json({ error: 'name, phone, and email are required' }, { status: 400 });
    }

    const result = await notifyFunnelLead({
      name,
      phone,
      email,
      goal: String(body.goal || '').trim(),
      source: String(body.source || 'hyperbaric').trim(),
      page: String(body.page || '').trim(),
      submittedAt: body.submittedAt || new Date().toISOString(),
    });

    return NextResponse.json({ ok: Boolean(result.ok), sms: result });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
