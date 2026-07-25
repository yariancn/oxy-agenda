import { NextResponse } from 'next/server';
import { normalizeClinicId } from '../../../../lib/clinicRegistry.js';
import { readStaffSessionFromRequest } from '../../../../lib/staffSession.js';
import { getSupabaseAdmin } from '../../../../lib/supabaseAdmin.js';
import { assertStaffClinicAccess } from '../../../../lib/staffDbServer.js';
import {
  listPatientSmsPresets,
  runStaffPatientSms,
} from '../../../../lib/staffPatientSmsFlow.js';

export async function GET() {
  return NextResponse.json({
    presets: listPatientSmsPresets('en'),
    presetsEs: listPatientSmsPresets('es'),
    maxCustomChars: 120,
  });
}

export async function POST(request) {
  try {
    const user = readStaffSessionFromRequest(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const clinicName = normalizeClinicId(body.clinic);
    try {
      assertStaffClinicAccess(user, clinicName);
    } catch {
      return NextResponse.json({ error: 'Clinic access denied' }, { status: 403 });
    }
    const appointmentId = body.appointmentId;
    const preset = String(body.preset || 'reminder').trim();
    const customNote = body.customNote || '';
    const locale = body.locale === 'en' ? 'en' : 'es';

    const supabase = getSupabaseAdmin(clinicName);
    const result = await runStaffPatientSms({
      supabase,
      user,
      clinicName,
      appointmentId,
      preset,
      customNote,
      locale,
    });

    return NextResponse.json(result.body, { status: result.status });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
