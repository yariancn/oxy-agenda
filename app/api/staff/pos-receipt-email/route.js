import { NextResponse } from 'next/server';
import { buildPosTicketHtml } from '../../../../lib/posTicket.js';
import { getClinicDefaultName, normalizeClinicId } from '../../../../lib/clinicRegistry.js';
import { getResendApiKey, getResendFromAddress } from '../../../../lib/resendConfig.js';
import { readStaffSessionFromRequest } from '../../../../lib/staffSession.js';
import { assertStaffClinicAccess } from '../../../../lib/staffDbServer.js';
import { formatClinicField } from '../../../../lib/clinicText.js';

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim());
}

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
    const toEmail = String(receipt?.email || body.email || '').trim().toLowerCase();

    if (!toEmail || !isValidEmail(toEmail)) {
      return NextResponse.json({ error: 'EMAIL_REQUIRED' }, { status: 400 });
    }

    const resendKey = getResendApiKey();
    if (!resendKey) {
      return NextResponse.json({ error: 'MISSING_RESEND' }, { status: 503 });
    }

    const labels = body.labels || {};
    const clinicDisplay = formatClinicField(companyConfig.name) || getClinicDefaultName(clinicName);
    const ticketHtml = buildPosTicketHtml({
      receipt: { ...receipt, email: toEmail },
      companyConfig,
      clinicName,
      locale,
      labels,
      origin: body.origin || '',
    });

    const subject = locale === 'en'
      ? `Receipt — ${clinicDisplay}`
      : `Ticket — ${clinicDisplay}`;

    const emailHtml = `
      <div style="font-family:sans-serif;max-width:420px;margin:0 auto;padding:16px;color:#0f172a;">
        <p style="margin:0 0 12px;font-size:14px;">
          ${locale === 'en'
            ? 'Here is your receipt. Thank you for choosing us.'
            : 'Aquí tienes tu ticket. Gracias por tu preferencia.'}
        </p>
        <div style="border:1px solid #e2e8f0;border-radius:12px;padding:12px;background:#f8fafc;">
          ${ticketHtml}
        </div>
      </div>
    `;

    const emailReq = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resendKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: getResendFromAddress(clinicName),
        to: [toEmail],
        subject,
        html: emailHtml,
      }),
    });

    if (!emailReq.ok) {
      const errBody = await emailReq.text().catch(() => '');
      return NextResponse.json(
        { success: false, error: errBody.slice(0, 160) || 'EMAIL_FAILED' },
        { status: 502 },
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
