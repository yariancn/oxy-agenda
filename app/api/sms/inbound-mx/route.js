import { NextResponse } from 'next/server';
import { CLINIC_OXYGENDGL } from '../../../../lib/clinicRegistry.js';
import { processConfirmationInboundReply } from '../../../../lib/processConfirmationInbound.js';

/**
 * LabsMobile inbound MO webhook for GDL SI/NO confirmations.
 *
 * LabsMobile Account API Settings → "URL for receiving messages":
 *   https://oxy-agenda.vercel.app/api/sms/inbound-mx
 *
 * Official payload (HTTP POST JSON):
 *   { inbound_number, service_number, msisdn, message, timestamp }
 *
 * Requires a contracted LabsMobile virtual number — alphanumeric sender OXYGENDL
 * cannot receive replies. Until then, staff can mark SI/NO in the appointment panel.
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
  if (
    contentType.includes('application/x-www-form-urlencoded')
    || contentType.includes('multipart/form-data')
    || contentType.includes('form')
  ) {
    const form = await request.formData().catch(() => null);
    const obj = { ...query };
    if (form) {
      for (const [k, v] of form.entries()) obj[k] = String(v);
    }
    return obj;
  }
  // POST with empty/unknown content-type: try JSON body, fall back to query
  if (request.method === 'POST') {
    const raw = await request.text().catch(() => '');
    if (raw) {
      try {
        return { ...query, ...JSON.parse(raw) };
      } catch {
        // ignore
      }
    }
  }
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
      return NextResponse.json({
        ok: false,
        error: 'missing_from_or_body',
        hint: 'Expected LabsMobile JSON: { msisdn, message }',
      }, { status: 400 });
    }

    const result = await processConfirmationInboundReply({
      clinicName: CLINIC_OXYGENDGL,
      fromPhone: from,
      bodyText: body,
    });

    // Always 200 so LabsMobile does not retry forever on no_pending / unrecognized.
    return NextResponse.json({
      ok: Boolean(result.ok),
      error: result.ok ? undefined : result.error,
      reply: result.reply || null,
      appointmentId: result.appointment?.id || null,
      status: result.nextStatus || null,
      acknowledged: true,
    });
  } catch (error) {
    console.error('[inbound-mx]', error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}

export async function GET(request) {
  return handle(request);
}

export async function POST(request) {
  return handle(request);
}
