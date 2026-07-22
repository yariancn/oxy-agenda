import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '../../../../lib/supabaseAdmin.js';
import { repairOrphanAppointmentPatients } from '../../../../lib/repairOrphanAppointmentPatients.js';
import {
  attachStaffSessionCookie,
  resolveStaffApiUser,
} from '../../../../lib/staffApiSession.js';
import { assertStaffClinicAccess } from '../../../../lib/staffDbServer.js';
import { ACTIVE_CLINICS } from '../../../../lib/clinicRegistry.js';
import { formatClinicDateIso } from '../../../../lib/clinicClock.js';

/**
 * Create missing patient charts from recent appointments (e.g. Claudia on calendar but not in Pacientes).
 * POST { clinic?: string, all?: boolean, lookbackDays?: number }
 */
export async function POST(request) {
  try {
    const user = await resolveStaffApiUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const lookbackDays = Number(body.lookbackDays) || 60;
    const clinics = [];
    if (body.all) {
      for (const c of ACTIVE_CLINICS) {
        try {
          assertStaffClinicAccess(user, c);
          clinics.push(c);
        } catch {
          /* skip */
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
        const sb = getSupabaseAdmin(clinic);
        const todayIso = formatClinicDateIso(new Date(), clinic);
        const repair = await repairOrphanAppointmentPatients(sb, { lookbackDays, todayIso });
        results.push({ clinic, ...repair });
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
