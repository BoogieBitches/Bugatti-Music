import type { NextConfig } from "next";

const supabaseHost = (() => {
  const u = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!u) return null;
  try {
    return new URL(u).hostname;
  } catch {
    return null;
  }
})();

// The audio processor URL, server-side only.
// In dev it defaults to localhost:8001.
// In production set AUDIO_API_URL to your deployed audio-processor URL
// (e.g. https://bugatti-audio.railway.app).
const _rawAudioUrl = process.env.AUDIO_API_URL ?? "http://localhost:8001";
const AUDIO_API_URL = (/^https?:\/\//.test(_rawAudioUrl) ? _rawAudioUrl : `https://${_rawAudioUrl}`).replace(/\/$/, "");

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      ...(supabaseHost
        ? [
            {
              protocol: "https" as const,
              hostname: supabaseHost,
              pathname: "/storage/v1/object/public/**",
            },
          ]
        : [
            {
              protocol: "https" as const,
              hostname: "*.supabase.co",
              pathname: "/storage/v1/object/public/**",
            },
          ]),
      {
        protocol: "https" as const,
        hostname: "t.me",
        pathname: "/i/userpic/**",
      },
      {
        protocol: "https" as const,
        hostname: "*.cachetelegram.org",
      },
    ],
  },

  async rewrites() {
    return [
      {
        source: "/audio/:path*",
        destination: `${AUDIO_API_URL}/audio/:path*`,
      },
    ];
  },
};

export default nextConfig;
