import { NextResponse } from 'next/server';
import {
  assertStaffClinicAccess,
  executeStaffDbQuery,
} from '../../../../lib/staffDbServer.js';
import {
  assertStaffDbPermission,
  sanitizeStaffDbSelectData,
} from '../../../../lib/staffDbPermissions.js';
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
    assertStaffDbPermission(user, {
      table: body.table,
      action: body.action || 'select',
      data: body.data,
    });

    const result = await executeStaffDbQuery(body);
    if (result.error) {
      return NextResponse.json({ error: result.error.message }, { status: 400 });
    }

    const data = (body.action || 'select') === 'select'
      ? sanitizeStaffDbSelectData(user, body.table, result.data ?? null, body.select)
      : (result.data ?? null);

    const response = NextResponse.json({
      data,
      count: result.count ?? null,
    });
    return attachStaffSessionCookie(response, user);
  } catch (error) {
    const status = error?.status
      || (/Unauthorized|access denied|Insufficient level|Table not allowed/i.test(error.message) ? 403 : 500);
    const normalized = /Unauthorized/i.test(error.message) ? 401 : status;
    return NextResponse.json({ error: error.message }, { status: normalized });
  }
}
