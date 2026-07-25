import { NextResponse } from 'next/server';
import { buildPosTicketSmsText } from '../../../../lib/posTicket.js';
import { toE164Phone } from '../../../../lib/appointmentNotify.js';
import { sendMexicoSms } from '../../../../lib/smsMexico.js';
import { sendTwilioSms } from '../../../../lib/clinicMessaging.js';
import { isShenandoah, normalizeClinicId } from '../../../../lib/clinicRegistry.js';
import { readStaffSessionFromRequest } from '../../../../lib/staffSession.js';
import { assertStaffClinicAccess } from '../../../../lib/staffDbServer.js';

export async function POST(request) {
  try {
    const user = readStaffSessionFromRequest(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const clinicName = normalizeClinicId(body.clinic || 'Oxygengdl');
    try {
      assertStaffClinicAccess(user, clinicName);
    } catch {
      return NextResponse.json({ error: 'Clinic access denied' }, { status: 403 });
    }
    const receipt = body.receipt;
    const companyConfig = body.companyConfig || {};
    const locale = body.locale === 'en' ? 'en' : 'es';

    if (!receipt?.phone) {
      return NextResponse.json({ error: 'PHONE_REQUIRED' }, { status: 400 });
    }

    const smsBody = buildPosTicketSmsText({
      receipt,
      companyConfig,
      clinicName,
      locale,
      labels: body.labels || {},
    });

    let result;
    if (isShenandoah(clinicName)) {
      const to = toE164Phone(receipt.phone, clinicName);
      if (!to) return NextResponse.json({ error: 'INVALID_PHONE' }, { status: 400 });
      result = await sendTwilioSms({ to, body: smsBody });
    } else {
      result = await sendMexicoSms({ to: receipt.phone, body: smsBody, clinicName });
    }

    if (!result.ok) {
      return NextResponse.json(
        { success: false, error: result.error || 'SMS_FAILED' },
        { status: 502 },
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
