import { NextResponse } from 'next/server';
import { STAFF_SESSION_COOKIE, staffSessionCookieOptions } from '../../../../lib/staffSession.js';

export async function POST() {
  const response = NextResponse.json({ success: true });
  response.cookies.set(STAFF_SESSION_COOKIE, '', { ...staffSessionCookieOptions(), maxAge: 0 });
  return response;
}
