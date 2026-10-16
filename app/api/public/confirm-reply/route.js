import { NextResponse } from 'next/server';
import { applyConfirmationReplyFromToken } from '../../../../lib/processConfirmationInbound.js';

/**
 * POST-only confirmation (form from /n/{code}; AutoConfirmSi for /s/{code}).
 * GET must never mutate — SMS/WhatsApp link previews were auto-hitting NO.
 */
export async function GET(request) {
  const url = new URL(request.url);
  const code = String(url.searchParams.get('code') || url.searchParams.get('t') || '').trim();
  const reply = String(url.searchParams.get('r') || url.searchParams.get('reply') || 'si').trim().toLowerCase();
  if (code) {
    const path = reply === 'no' || reply === 'n' || reply === '0' || reply === 'declined'
      ? `/n/${encodeURIComponent(code)}`
      : `/s/${encodeURIComponent(code)}`;
    return NextResponse.redirect(new URL(path, request.url), 303);
  }
  return NextResponse.json(
    { ok: false, error: 'use_post', message: 'Open the SI or NO link from your SMS and tap Confirm.' },
    { status: 405 },
  );
}

function wantsJson(request) {
  const accept = request.headers.get('accept') || '';
  const contentType = request.headers.get('content-type') || '';
  return accept.includes('application/json') || contentType.includes('application/json');
}

export async function POST(request) {
  const json = wantsJson(request);
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
      if (json) return NextResponse.json({ ok: false, error: 'missing' }, { status: 400 });
      return NextResponse.redirect(new URL('/c?error=missing', request.url), 303);
    }

    const result = await applyConfirmationReplyFromToken({ token, replyRaw });
    const isShort = token && !token.includes('.') && token.length <= 24;
    const base = isShort
      ? `/c/${encodeURIComponent(token)}`
      : `/confirmar?t=${encodeURIComponent(token)}`;

    if (json) {
      if (!result?.ok) {
        return NextResponse.json(
          { ok: false, error: result?.error || 'failed', already: false },
          { status: result?.error === 'invalid_token' ? 404 : 400 },
        );
      }
      return NextResponse.json({
        ok: true,
        reply: result.reply,
        already: result.already === true,
      });
    }

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
      const shortDone = result.reply === 'declined'
        ? `/n/${encodeURIComponent(token)}?done=1&already=${already}`
        : `/s/${encodeURIComponent(token)}?done=1&already=${already}`;
      return NextResponse.redirect(new URL(shortDone, request.url), 303);
    }
    return NextResponse.redirect(
      new URL(`${base}&r=${reply}&done=1&already=${already}`, request.url),
      303,
    );
  } catch (error) {
    if (json) {
      return NextResponse.json({ ok: false, error: error?.message || 'error' }, { status: 500 });
    }
    return NextResponse.redirect(
      new URL(`/c?err=${encodeURIComponent(error?.message || 'error')}`, request.url),
      303,
    );
  }
}
