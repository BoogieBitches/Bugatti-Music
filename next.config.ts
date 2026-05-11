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
      // Telegram profile photos returned by the Login Widget live at
      // https://t.me/i/userpic/... and on the cdn4.cachetelegram.org host
      // (varies by region). Allow both so <Image> can render avatars when
      // we eventually surface them in the UI.
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
};

export default nextConfig;
