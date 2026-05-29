import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { hasRobokassaEnv, hasSupabaseEnv, env } from "@/lib/env";
import { buildPaymentUrl, generateInvId, RK_PREMIUM_AMOUNT } from "@/lib/robokassa/server";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  if (!hasSupabaseEnv() || !hasRobokassaEnv()) {
    return NextResponse.json({ error: "Payment system not configured" }, { status: 503 });
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as { locale?: string };
  const locale = body.locale === "ru" ? "ru" : "en";

  const { data: profile } = await supabase
    .from("profiles")
    .select("is_premium, premium_until")
    .eq("id", user.id)
    .maybeSingle();

  const stillPremium =
    !!profile?.is_premium &&
    (!profile.premium_until || new Date(profile.premium_until) > new Date());
  if (stillPremium) {
    return NextResponse.json({ error: "Already Premium" }, { status: 400 });
  }

  const desc =
    locale === "ru"
      ? "Bugatti Sound Premium — месячная подписка"
      : "Bugatti Sound Premium — monthly subscription";

  const login = env.robokassaLogin();
  const password1 = env.robokassaPassword1();
  const isTest = process.env.ROBOKASSA_IS_TEST === "1";
  // Recurring (auto-renewal) must be explicitly enabled for the shop by
  // Robokassa support. Until then, sending Recurring=true makes Robokassa
  // reject the payment with error 34. Gate it behind an env flag so the
  // one-time payment works out of the box and auto-renewal can be switched
  // on once the shop is approved.
  const recurring = process.env.ROBOKASSA_RECURRING === "1";
  const appUrl = env.appUrl();
  const invId = generateInvId();
  const shpParams: Record<string, string> = { Shp_userId: user.id };

  const paymentUrl = buildPaymentUrl({
    login,
    outSum: RK_PREMIUM_AMOUNT,
    invId,
    desc,
    password1,
    isTest,
    successUrl: `${appUrl}/${locale}/dashboard?checkout=processing`,
    failUrl: `${appUrl}/${locale}/pricing?checkout=failed`,
    resultUrl: `${appUrl}/api/robokassa/webhook`,
    recurring,
    shpParams,
  });

  return NextResponse.json({ paymentUrl });
}