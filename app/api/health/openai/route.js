import { NextResponse } from 'next/server';

/** Diagnóstico sin exponer la key (solo formato y si existe). */
export async function GET() {
  const key = String(process.env.OPENAI_API_KEY || '').trim();
  return NextResponse.json({
    configured: key.length > 0,
    validFormat: /^sk-/.test(key),
    model: process.env.OPENAI_VISION_MODEL || 'gpt-4o-mini',
  });
}
