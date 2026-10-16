import { NextResponse } from 'next/server';
import { applyConfirmationReplyFromToken } from '../../../../lib/processConfirmationInbound.js';

/**
 * Legacy GET one-tap confirm — no longer mutates.
 * SMS/WhatsApp link previews were auto-declining via GET.
 * Redirects to the safe confirm-gate page instead.
 */
export async function GET(request) {
  const url = new URL(request.url);
  const token = String(url.searchParams.get('t') || url.searchParams.get('token') || '').trim();
  const replyRaw = String(url.searchParams.get('r') || url.searchParams.get('reply') || '').trim().toLowerCase();
  if (token && !token.includes('.') && token.length <= 24) {
    const path = replyRaw === 'no' || replyRaw === '0' || replyRaw === 'declined'
      ? `/c/${encodeURIComponent(token)}/no`
      : replyRaw
        ? `/c/${encodeURIComponent(token)}/si`
        : `/c/${encodeURIComponent(token)}`;
    return NextResponse.redirect(new URL(path, request.url), 303);
  }
  if (token) {
    const q = new URLSearchParams({ t: token });
    if (replyRaw) q.set('r', replyRaw);
    return NextResponse.redirect(new URL(`/confirmar?${q.toString()}`, request.url), 303);
  }
  return NextResponse.json(
    { ok: false, error: 'use_post', message: 'Confirmation requires an intentional tap (POST).' },
    { status: 405 },
  );
}

/** Prefer /api/public/confirm-reply; kept for older clients that POST here. */
export async function POST(request) {
  const { POST: confirmReplyPost } = await import('../confirm-reply/route.js');
  return confirmReplyPost(request);
}
