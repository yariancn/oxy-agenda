import { NextResponse } from 'next/server';
import { normalizeClinicId } from '../../../../lib/clinicRegistry.js';
import { readAgendaLiveToken } from '../../../../lib/agendaLiveRev.js';
import { getSupabaseAdmin } from '../../../../lib/supabaseAdmin.js';
import { assertStaffClinicAccess } from '../../../../lib/staffDbServer.js';
import { readStaffSessionFromRequest } from '../../../../lib/staffSession.js';

export async function GET(request) {
  try {
    const user = readStaffSessionFromRequest(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const clinicName = normalizeClinicId(searchParams.get('clinic') || 'Oxygengdl');
    assertStaffClinicAccess(user, clinicName);

    const supabase = getSupabaseAdmin(clinicName);
    const snapshot = await readAgendaLiveToken({ supabase, clinicName });

    return NextResponse.json({
      clinic: clinicName,
      ...snapshot,
    });
  } catch (error) {
    const status = /Unauthorized|access denied/i.test(error.message) ? 401 : 500;
    return NextResponse.json({ error: error.message }, { status });
  }
}
