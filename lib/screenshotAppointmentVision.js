import { getClinicTimezone, localeForClinic, normalizeClinicId } from './clinicRegistry.js';
import { normalizeScreenshotExtraction, parseVisionJsonContent } from './screenshotAppointmentParse.js';

function clinicTodayIso(clinicId) {
  const tz = getClinicTimezone(clinicId);
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const y = parts.find((p) => p.type === 'year')?.value;
  const m = parts.find((p) => p.type === 'month')?.value;
  const d = parts.find((p) => p.type === 'day')?.value;
  return `${y}-${m}-${d}`;
}

function buildVisionPrompt({ locale, referenceDate, clinicId }) {
  const lang = locale === 'en' ? 'English' : 'Spanish';
  return `You read screenshots of WhatsApp (or SMS) conversations to extract ONE hyperbaric clinic appointment.

Return ONLY valid JSON (no markdown) with this shape:
{
  "patient": "full name or empty string",
  "phone": "phone as shown (any format)",
  "email": "email or null",
  "fullDate": "YYYY-MM-DD or best guess",
  "time": "appointment time in 12h like 09:00 AM",
  "notes": "relevant scheduling notes or null",
  "confidence": "high|medium|low",
  "summary": "one short sentence in ${lang} describing what you read"
}

Rules:
- Clinic timezone context: ${getClinicTimezone(clinicId)}. Reference today: ${referenceDate}.
- If the year is missing, use ${referenceDate.slice(0, 4)}.
- Resolve relative dates (hoy/today, mañana/tomorrow, weekday names) against reference today.
- Mexican numbers are often 10 digits; US numbers 10 digits.
- Pick the appointment being scheduled, not old messages.
- If unsure, leave field empty and lower confidence.`;
}

export async function extractAppointmentFromScreenshot({
  imageDataUrl,
  clinic,
  locale,
  apiKey,
  model = 'gpt-4o-mini',
}) {
  if (!apiKey) {
    throw new Error('SCREENSHOT_INTAKE_NOT_CONFIGURED');
  }

  const clinicId = normalizeClinicId(clinic);
  const effectiveLocale = locale || localeForClinic(clinicId);
  const referenceDate = clinicTodayIso(clinicId);
  const prompt = buildVisionPrompt({ locale: effectiveLocale, referenceDate, clinicId });

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      temperature: 0.1,
      max_tokens: 500,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            { type: 'image_url', image_url: { url: imageDataUrl, detail: 'high' } },
          ],
        },
      ],
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`VISION_API_ERROR: ${response.status} ${errText.slice(0, 200)}`);
  }

  const data = await response.json();
  const content = data?.choices?.[0]?.message?.content;
  const parsed = parseVisionJsonContent(content);
  if (!parsed) {
    throw new Error('VISION_PARSE_ERROR');
  }

  const normalized = normalizeScreenshotExtraction(parsed, {
    referenceDate,
    locale: effectiveLocale,
  });

  return {
    ...normalized,
    referenceDate,
    raw: parsed,
  };
}
