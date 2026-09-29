import { NextResponse } from 'next/server';
import { applyConfirmationReplyFromToken } from '../../../../lib/processConfirmationInbound.js';

/**
 * Programmatic one-tap confirm (same as /confirmar page).
 * GET /api/public/confirm?t=TOKEN&r=si|no
 */
export async function GET(request) {
  try {
    const url = new URL(request.url);
    const token = String(url.searchParams.get('t') || url.searchParams.get('token') || '').trim();
    const replyRaw = String(url.searchParams.get('r') || url.searchParams.get('reply') || '').trim();
    if (!token || !replyRaw) {
      return NextResponse.json({ ok: false, error: 'missing_t_or_r' }, { status: 400 });
    }
    const result = await applyConfirmationReplyFromToken({ token, replyRaw });
    const status = result.ok ? 200 : (result.error === 'invalid_token' ? 401 : 400);
    return NextResponse.json(result, { status });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
