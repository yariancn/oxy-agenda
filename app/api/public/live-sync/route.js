import { NextResponse } from 'next/server';
import { normalizeClinicId } from '../../../../lib/clinicRegistry.js';
import { computeLiveSyncToken } from '../../../../lib/liveSyncToken.js';
import { getSupabaseAdmin } from '../../../../lib/supabaseAdmin.js';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const clinicName = normalizeClinicId(searchParams.get('clinic') || 'Oxygengdl');
    const supabase = getSupabaseAdmin(clinicName);
    const snapshot = await computeLiveSyncToken({ supabase, clinicName });

    return NextResponse.json({
      clinic: clinicName,
      ...snapshot,
    });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
