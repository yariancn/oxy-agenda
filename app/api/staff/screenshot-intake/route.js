import { NextResponse } from 'next/server';
import { normalizeClinicId, localeForClinic } from '../../../../lib/clinicRegistry.js';
import { extractAppointmentFromScreenshot } from '../../../../lib/screenshotAppointmentVision.js';
import { assertStaffClinicAccess } from '../../../../lib/staffDbServer.js';
import { readStaffSessionFromRequest } from '../../../../lib/staffSession.js';

const MAX_IMAGE_CHARS = 6_000_000;

export async function POST(request) {
  try {
    const user = readStaffSessionFromRequest(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const clinic = normalizeClinicId(body.clinic || 'Oxygengdl');
    assertStaffClinicAccess(user, clinic);

    const image = String(body.image || '').trim();
    if (!image.startsWith('data:image/')) {
      return NextResponse.json({ error: 'INVALID_IMAGE' }, { status: 400 });
    }
    if (image.length > MAX_IMAGE_CHARS) {
      return NextResponse.json({ error: 'IMAGE_TOO_LARGE' }, { status: 400 });
    }

    const locale = body.locale === 'en' ? 'en' : localeForClinic(clinic);
    const apiKey = String(process.env.OPENAI_API_KEY || '').trim();
    if (!apiKey) {
      return NextResponse.json({ error: 'SCREENSHOT_INTAKE_NOT_CONFIGURED' }, { status: 503 });
    }
    if (!/^sk-/.test(apiKey)) {
      return NextResponse.json({ error: 'OPENAI_API_KEY_INVALID' }, { status: 503 });
    }

    const extracted = await extractAppointmentFromScreenshot({
      imageDataUrl: image,
      clinic,
      locale,
      apiKey,
      model: process.env.OPENAI_VISION_MODEL || 'gpt-4o-mini',
    });

    return NextResponse.json({ ok: true, extracted });
  } catch (error) {
    const message = error?.message || String(error);
    if (message.includes('VISION_API_ERROR: 401') || message.includes('Incorrect API key')) {
      return NextResponse.json({ error: 'OPENAI_API_KEY_INVALID' }, { status: 503 });
    }
    if (message === 'Clinic access denied') {
      return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
