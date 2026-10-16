import { NextResponse } from 'next/server';
import { applyConfirmationReplyFromToken } from '../../../../lib/processConfirmationInbound.js';

/**
 * POST-only confirmation (form from /c/{code}/si|no).
 * GET must never mutate — SMS/WhatsApp link previews were auto-hitting NO.
 */
export async function GET(request) {
  const url = new URL(request.url);
  const code = String(url.searchParams.get('code') || url.searchParams.get('t') || '').trim();
  const reply = String(url.searchParams.get('r') || url.searchParams.get('reply') || 'si').trim().toLowerCase();
  if (code) {
    const path = reply === 'no' || reply === '0' || reply === 'declined'
      ? `/c/${encodeURIComponent(code)}/no`
      : `/c/${encodeURIComponent(code)}/si`;
    return NextResponse.redirect(new URL(path, request.url), 303);
  }
  return NextResponse.json(
    { ok: false, error: 'use_post', message: 'Open the SI or NO link from your SMS and tap Confirm.' },
    { status: 405 },
  );
}

export async function POST(request) {
  try {
    const contentType = request.headers.get('content-type') || '';
    let token = '';
    let replyRaw = '';

    if (contentType.includes('application/json')) {
      const body = await request.json().catch(() => ({}));
      token = String(body.code || body.token || body.t || '').trim();
      replyRaw = String(body.reply || body.r || '').trim();
    } else {
      const form = await request.formData().catch(() => null);
      token = String(form?.get('code') || form?.get('token') || form?.get('t') || '').trim();
      replyRaw = String(form?.get('reply') || form?.get('r') || '').trim();
    }

    if (!token || !replyRaw) {
      return NextResponse.redirect(new URL('/c?error=missing', request.url), 303);
    }

    const result = await applyConfirmationReplyFromToken({ token, replyRaw });
    const isShort = token && !token.includes('.') && token.length <= 24;
    const base = isShort
      ? `/c/${encodeURIComponent(token)}`
      : `/confirmar?t=${encodeURIComponent(token)}`;

    if (!result?.ok && result?.error === 'invalid_token') {
      return NextResponse.redirect(new URL(`${base}?err=invalid`, request.url), 303);
    }
    if (!result?.ok && result?.error === 'not_waiting') {
      return NextResponse.redirect(new URL(`${base}?err=not_waiting`, request.url), 303);
    }
    if (!result?.ok) {
      return NextResponse.redirect(new URL(`${base}?err=failed`, request.url), 303);
    }

    const reply = result.reply === 'declined' ? 'no' : 'si';
    const already = result.already ? '1' : '0';
    if (isShort) {
      return NextResponse.redirect(
        new URL(`${base}/${reply}?done=1&already=${already}`, request.url),
        303,
      );
    }
    return NextResponse.redirect(
      new URL(`${base}&r=${reply}&done=1&already=${already}`, request.url),
      303,
    );
  } catch (error) {
    return NextResponse.redirect(
      new URL(`/c?err=${encodeURIComponent(error?.message || 'error')}`, request.url),
      303,
    );
  }
}
