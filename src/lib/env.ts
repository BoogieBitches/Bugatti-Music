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

  stripeSecretKey: () => required("STRIPE_SECRET_KEY", process.env.STRIPE_SECRET_KEY),
  stripePublishableKey: () =>
    required("NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY", process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY),
  stripeWebhookSecret: () =>
    required("STRIPE_WEBHOOK_SECRET", process.env.STRIPE_WEBHOOK_SECRET),
  stripePremiumPriceId: () =>
    required("STRIPE_PREMIUM_PRICE_ID", process.env.STRIPE_PREMIUM_PRICE_ID),

  appUrl: () => process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",

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

export function hasStripeEnv(): boolean {
  return !!process.env.STRIPE_SECRET_KEY && !!process.env.STRIPE_PREMIUM_PRICE_ID;
}
