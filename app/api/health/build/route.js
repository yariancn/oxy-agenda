import { NextResponse } from 'next/server';

/**
 * Lightweight deploy fingerprint for open-tab refresh.
 * Prefer Vercel commit SHA; fall back to deployment id / build time.
 */
export async function GET() {
  const version = String(
    process.env.VERCEL_GIT_COMMIT_SHA
      || process.env.VERCEL_DEPLOYMENT_ID
      || process.env.NEXT_PUBLIC_BUILD_ID
      || 'dev',
  ).trim();

  return NextResponse.json(
    {
      version,
      buildSha: version.slice(0, 7),
    },
    {
      headers: {
        'Cache-Control': 'no-store, max-age=0',
      },
    },
  );
}
