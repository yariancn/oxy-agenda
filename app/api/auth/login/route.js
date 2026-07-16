import { NextResponse } from 'next/server';
import { resolveStaffLoginServer } from '../../../../lib/resolveStaffLoginServer.js';
import {
  createStaffSessionToken,
  staffSessionCookieOptions,
  STAFF_SESSION_COOKIE,
} from '../../../../lib/staffSession.js';
import {
  createStaffDeviceToken,
  readStaffDeviceFromRequest,
  staffDeviceCookieOptions,
  STAFF_DEVICE_COOKIE,
} from '../../../../lib/staffDeviceTrust.js';
import { normalizeStaffEmail } from '../../../../lib/staffEmail.js';
import { getRequestClientIp } from '../../../../lib/requestClientIp.js';

export async function POST(request) {
  try {
    const body = await request.json();
    const { pin, email = '', rememberDevice = false } = body;
    const trustedDevice = readStaffDeviceFromRequest(request);

    const result = await resolveStaffLoginServer({
      email,
      pin,
      request,
    });

    if (!result.user) {
      const status = result.error === 'locked' ? 429 : 401;
      return NextResponse.json(
        {
          success: false,
          error: result.error || 'invalid',
          lockedMinutes: result.lockedMinutes || null,
        },
        { status },
      );
    }

    const token = createStaffSessionToken(result.user);
    const response = NextResponse.json({ success: true, user: result.user });

    response.cookies.set(STAFF_SESSION_COOKIE, token, staffSessionCookieOptions());

    const loginEmail = normalizeStaffEmail(email)
      || trustedDevice?.email
      || normalizeStaffEmail(result.user?.email);

    if (loginEmail && result.user?.id !== 'admin' && (rememberDevice || trustedDevice?.email)) {
      const deviceToken = createStaffDeviceToken(loginEmail, {
        pinVerifiedAt: Date.now(),
        ip: getRequestClientIp(request),
        ipHash: trustedDevice?.ipHash || '',
      });
      if (deviceToken) {
        response.cookies.set(STAFF_DEVICE_COOKIE, deviceToken, staffDeviceCookieOptions());
      }
    }

    return response;
  } catch (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
