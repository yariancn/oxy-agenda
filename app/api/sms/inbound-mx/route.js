import { NextResponse } from 'next/server';
import { CLINIC_OXYGENDGL } from '../../../../lib/clinicRegistry.js';
import { processConfirmationInboundReply } from '../../../../lib/processConfirmationInbound.js';

/**
 * LabsMobile (or similar MX SMS) inbound MO webhook for GDL SI/NO confirmations.
 * Accepts JSON or form/query with common field names: msisdn/phone/from + message/text/body.
 *
 * Configure in LabsMobile to POST/GET:
 *   https://<host>/api/sms/inbound-mx
 */
function pickField(source, keys) {
  for (const key of keys) {
    const val = source?.[key] ?? source?.[key.toLowerCase()] ?? source?.[key.toUpperCase()];
    if (val != null && String(val).trim()) return String(val).trim();
  }
  return '';
}

async function readPayload(request) {
  const url = new URL(request.url);
  const query = Object.fromEntries(url.searchParams.entries());

  const contentType = String(request.headers.get('content-type') || '');
  if (contentType.includes('application/json')) {
    const json = await request.json().catch(() => ({}));
    return { ...query, ...json };
  }
  if (contentType.includes('form')) {
    const form = await request.formData().catch(() => null);
    const obj = { ...query };
    if (form) {
      for (const [k, v] of form.entries()) obj[k] = String(v);
    }
    return obj;
  }
  // GET or unknown — query only
  return query;
}

async function handle(request) {
  try {
    const payload = await readPayload(request);
    const from = pickField(payload, [
      'msisdn', 'phone', 'from', 'From', 'sender', 'numero', 'movil', 'mobile',
    ]);
    const body = pickField(payload, [
      'message', 'msg', 'text', 'txt', 'body', 'Body', 'contenido', 'sms',
    ]);

    if (!from || !body) {
      return NextResponse.json({ ok: false, error: 'missing_from_or_body' }, { status: 400 });
    }

    const result = await processConfirmationInboundReply({
      clinicName: CLINIC_OXYGENDGL,
      fromPhone: from,
      bodyText: body,
    });

    if (!result.ok) {
      return NextResponse.json({
        ok: false,
        error: result.error,
        // Still 200 for provider retries when reply text isn't SI/NO.
        acknowledged: result.error === 'unrecognized_reply',
      }, { status: result.error === 'unrecognized_reply' ? 200 : 200 });
    }

    return NextResponse.json({
      ok: true,
      reply: result.reply,
      appointmentId: result.appointment?.id,
      status: result.nextStatus,
    });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}

export async function GET(request) {
  return handle(request);
}

export async function POST(request) {
  return handle(request);
}
