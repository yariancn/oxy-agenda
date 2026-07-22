import { NextResponse } from 'next/server';
import { migrateClinicSmsOptIn } from '../../../../lib/migrateSmsOptIn.js';
import {
  attachStaffSessionCookie,
  resolveStaffApiUser,
} from '../../../../lib/staffApiSession.js';
import { assertStaffClinicAccess } from '../../../../lib/staffDbServer.js';
import { ACTIVE_CLINICS } from '../../../../lib/clinicRegistry.js';

/**
 * Idempotent SMS opt-in migration for the active clinic (or all clinics staff can access).
 * POST { clinic?: string, all?: boolean }
 */
export async function POST(request) {
  try {
    const user = await resolveStaffApiUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const clinics = [];
    if (body.all) {
      for (const c of ACTIVE_CLINICS) {
        try {
          assertStaffClinicAccess(user, c);
          clinics.push(c);
        } catch {
          // skip clinics this staff cannot access
        }
      }
    } else {
      const clinic = body.clinic || user.clinic || ACTIVE_CLINICS[0];
      assertStaffClinicAccess(user, clinic);
      clinics.push(clinic);
    }

    if (!clinics.length) {
      return NextResponse.json({ error: 'No clinic access' }, { status: 403 });
    }

    const results = [];
    for (const clinic of clinics) {
      try {
        results.push(await migrateClinicSmsOptIn(clinic));
      } catch (error) {
        results.push({ clinic, error: error.message });
      }
    }

    const response = NextResponse.json({ ok: true, results });
    return attachStaffSessionCookie(response, user);
  } catch (error) {
    const status = /Unauthorized|access denied/i.test(error.message) ? 401 : 500;
    return NextResponse.json({ error: error.message }, { status });
  }
}
