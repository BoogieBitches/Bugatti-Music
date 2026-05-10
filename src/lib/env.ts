// Centralised, lazy access to environment variables.
// We do NOT throw at import time so that the app can build without secrets
// (e.g. on initial Vercel deploy before keys are wired up). Each helper throws
// only when actually invoked — which makes missing-key errors easy to spot.

function required(name: string, value: string | undefined): string {
  if (!value || value.length === 0) {
    throw new Error(
      `Missing required environment variable: ${name}. See README.md for setup instructions.`,
    );
  }
  return value;
}

export const env = {
  supabaseUrl: () => required("NEXT_PUBLIC_SUPABASE_URL", process.env.NEXT_PUBLIC_SUPABASE_URL),
  supabaseAnonKey: () =>
    required("NEXT_PUBLIC_SUPABASE_ANON_KEY", process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
  supabaseServiceRoleKey: () =>
    required("SUPABASE_SERVICE_ROLE_KEY", process.env.SUPABASE_SERVICE_ROLE_KEY),

  yookassaShopId: () => required("YOOKASSA_SHOP_ID", process.env.YOOKASSA_SHOP_ID),
  yookassaSecretKey: () => required("YOOKASSA_SECRET_KEY", process.env.YOOKASSA_SECRET_KEY),

  appUrl: () => {
    if (process.env.NEXT_PUBLIC_APP_URL && process.env.NEXT_PUBLIC_APP_URL.length > 0) {
      return process.env.NEXT_PUBLIC_APP_URL;
    }
    const vercelUrl =
      process.env.VERCEL_PROJECT_PRODUCTION_URL ?? process.env.VERCEL_URL ?? null;
    if (vercelUrl) return `https://${vercelUrl}`;
    return "http://localhost:3000";
  },

  // Optional: comma-separated list of emails to auto-promote to admin on first login.
  // (Only the FIRST signup that matches one of these emails becomes admin via /api/admin/bootstrap.)
  adminEmails: () =>
    (process.env.ADMIN_EMAILS ?? "")
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
};

export function hasSupabaseEnv(): boolean {
  return !!process.env.NEXT_PUBLIC_SUPABASE_URL && !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
}

export function hasYookassaEnv(): boolean {
  return !!process.env.YOOKASSA_SHOP_ID && !!process.env.YOOKASSA_SECRET_KEY;
}
