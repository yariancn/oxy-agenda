import { NextResponse } from 'next/server';
import { markFunnelLeadBooked } from '../../../../lib/funnelLeadNotify.js';

/**
 * Mark a funnel lead as booked so abandon / follow-up SMS stops.
 * Called from the public booking portal (same-origin) after a successful reserve.
 */
export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const email = String(body.email || '').trim();
    const phone = String(body.phone || '').trim();
    if (!email && !phone) {
      return NextResponse.json({ ok: false, error: 'email_or_phone_required' }, { status: 400 });
    }
    const result = await markFunnelLeadBooked({
      email,
      phone,
      name: String(body.name || '').trim(),
      source: String(body.source || 'oxy-agenda-booking').trim(),
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
