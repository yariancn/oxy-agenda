import { NextResponse } from 'next/server';
import { after } from 'next/server';
import { CLINIC_OXYGENDGL, normalizeClinicId } from '../../../../lib/clinicRegistry.js';
import { getSupabaseAdmin } from '../../../../lib/supabaseAdmin.js';
import {
  maybeSendConfirmationAfterBooking,
  supportsConfirmationSms,
} from '../../../../lib/appointmentConfirmation.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Queue first-session confirmation SMS when the visit is already inside the
 * hours-before window (e.g. booked <18h ahead). Waits briefly then sends.
 * Safe to call from staff notify and public booking.
 */
export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const clinicName = normalizeClinicId(body.clinic || CLINIC_OXYGENDGL);
    const appointmentId = body.appointmentId;
    if (!appointmentId) {
      return NextResponse.json({ ok: false, error: 'appointmentId required' }, { status: 400 });
    }
    if (!supportsConfirmationSms(clinicName)) {
      return NextResponse.json({ ok: true, skipped: true, reason: 'unsupported_clinic' });
    }

    const supabase = getSupabaseAdmin(clinicName);
    // Default ~15s (fits serverless maxDuration); long enough to not collide with booking SMS.
    const delayMs = Number.isFinite(Number(body.delayMs)) ? Number(body.delayMs) : 15 * 1000;

    after(async () => {
      try {
        await maybeSendConfirmationAfterBooking({
          supabase,
          appointmentId,
          clinicName,
          delayMs,
        });
      } catch {
        // Best-effort; cron remains the fallback.
      }
    });

    return NextResponse.json({ ok: true, queued: true, delayMs });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
