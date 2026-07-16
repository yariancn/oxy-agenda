import { NextResponse } from 'next/server';
import { sendFunnelAbandonSms } from '../../../../lib/funnelLeadNotify.js';

function corsHeaders(request) {
  const origin = request.headers.get('Origin') || '';
  const allowed =
    origin.endsWith('oxyhyperbaric.com')
    || origin.endsWith('oxyhyperbaric.marktr.co')
    || origin.endsWith('oxy-agenda.vercel.app')
    || origin.includes('localhost');
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
  if (allowed) headers['Access-Control-Allow-Origin'] = origin;
  return headers;
}

export async function OPTIONS(request) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(request) });
}

export async function POST(request) {
  const headers = corsHeaders(request);
  try {
    const body = await request.json().catch(() => ({}));
    const lead = {
      name: String(body.name || '').trim(),
      phone: String(body.phone || '').trim(),
      email: String(body.email || '').trim(),
      goal: String(body.goal || '').trim(),
      source: String(body.source || 'hyperbaric').trim(),
      page: String(body.page || '').trim(),
    };

    if (!lead.email && !lead.phone) {
      return NextResponse.json({ ok: false, error: 'email_or_phone_required' }, { status: 400, headers });
    }

    const result = await sendFunnelAbandonSms(lead);
    return NextResponse.json(result, { status: result.ok ? 200 : 500, headers });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500, headers });
  }
}
