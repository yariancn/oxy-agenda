import { NextResponse } from 'next/server';
import { resolveStaffAutoLoginServer } from '../../../../lib/resolveStaffLoginServer.js';
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

export async function POST(request) {
  try {
    const result = await resolveStaffAutoLoginServer({ request });

    if (!result.user) {
      const status = result.error === 'pin_required' ? 401 : 401;
      return NextResponse.json(
        { success: false, error: result.error || 'invalid' },
        { status },
      );
    }

    const token = createStaffSessionToken(result.user);
    const response = NextResponse.json({ success: true, user: result.user });
    response.cookies.set(STAFF_SESSION_COOKIE, token, staffSessionCookieOptions());

    const trustedDevice = result.device || readStaffDeviceFromRequest(request);
    if (trustedDevice?.email && result.user?.id !== 'admin') {
      const deviceToken = createStaffDeviceToken(trustedDevice.email, {
        pinVerifiedAt: trustedDevice.pinVerifiedAt,
        ip: result.clientIp || '',
        ipHash: trustedDevice.ipHash || '',
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
