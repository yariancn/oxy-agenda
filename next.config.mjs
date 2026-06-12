/** @type {import('next').NextConfig} */
const canonicalHost = process.env.CANONICAL_HOST || 'oxy-agenda.vercel.app';
const legacyHosts = (process.env.LEGACY_VERCEL_HOSTS || 'oxy-agenda-houston.vercel.app')
  .split(',')
  .map((host) => host.trim())
  .filter(Boolean);

const nextConfig = {
  env: {
    NEXT_PUBLIC_CANONICAL_HOST: canonicalHost,
    NEXT_PUBLIC_BUILD_SHA: (process.env.VERCEL_GIT_COMMIT_SHA || 'dev').slice(0, 7),
  },
  async redirects() {
    return legacyHosts.map((host) => ({
      source: '/:path*',
      has: [{ type: 'host', value: host }],
      destination: `https://${canonicalHost}/:path*`,
      permanent: true,
    }));
  },
};

export default nextConfig;
