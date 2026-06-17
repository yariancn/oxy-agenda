import { NextResponse } from 'next/server';
import {
  assertStaffClinicAccess,
  executeStaffDbQuery,
} from '../../../../lib/staffDbServer.js';
import { readStaffSessionFromRequest } from '../../../../lib/staffSession.js';

export async function POST(request) {
  try {
    const user = readStaffSessionFromRequest(request);
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

    return NextResponse.json({
      data: result.data ?? null,
      count: result.count ?? null,
    });
  } catch (error) {
    const status = /Unauthorized|access denied/i.test(error.message) ? 401 : 500;
    return NextResponse.json({ error: error.message }, { status });
  }
}
