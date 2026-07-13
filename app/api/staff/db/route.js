import { NextResponse } from 'next/server';
import {
  assertStaffClinicAccess,
  executeStaffDbQuery,
} from '../../../../lib/staffDbServer.js';
import {
  attachStaffSessionCookie,
  resolveStaffApiUser,
} from '../../../../lib/staffApiSession.js';

export async function POST(request) {
  try {
    const user = await resolveStaffApiUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const clinic = body.clinic;
    assertStaffClinicAccess(user, clinic);

    const result = await executeStaffDbQuery(body);
    if (result.error) {
      return NextResponse.json({ error: result.error.message }, { status: 400 });
    }

    const response = NextResponse.json({
      data: result.data ?? null,
      count: result.count ?? null,
    });
    return attachStaffSessionCookie(response, user);
  } catch (error) {
    const status = /Unauthorized|access denied/i.test(error.message) ? 401 : 500;
    return NextResponse.json({ error: error.message }, { status });
  }
}
