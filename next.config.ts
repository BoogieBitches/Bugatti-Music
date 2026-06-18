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

// AUDIO_API_URL — только серверная переменная, никаких NEXT_PUBLIC_*.
// По умолчанию указывает на HF Space. Переопределяется через переменную окружения.
const _rawAudioUrl =
  process.env.AUDIO_API_URL ?? "https://bugattimusic-bugatti-audio.hf.space";
const AUDIO_API_URL = (/^https?:\/\//.test(_rawAudioUrl)
  ? _rawAudioUrl
  : `https://${_rawAudioUrl}`
).replace(/\/$/, "");

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

  // Проксирует /audio/* → HF Space (или AUDIO_API_URL).
  // Клиент всегда обращается к /audio/..., не зная реального URL бэкенда.
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
