import { NextResponse } from 'next/server';
import { STAFF_DEVICE_COOKIE, staffDeviceCookieOptions } from '../../../../lib/staffDeviceTrust.js';

export async function POST() {
  const response = NextResponse.json({ success: true });
  response.cookies.set(STAFF_DEVICE_COOKIE, '', { ...staffDeviceCookieOptions(), maxAge: 0 });
  return response;
}
