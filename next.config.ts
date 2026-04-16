import type { NextConfig } from 'next';

const supabaseHostname = (() => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) return 'techaszojudlwarylgyz.supabase.co';
  try {
    return new URL(url).hostname;
  } catch {
    return 'techaszojudlwarylgyz.supabase.co';
  }
})();

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: supabaseHostname,
        pathname: '/storage/v1/object/public/**',
      },
    ],
  },
};

export default nextConfig;
