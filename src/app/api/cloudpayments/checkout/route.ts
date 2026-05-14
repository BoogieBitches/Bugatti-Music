import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { hasCloudpaymentsEnv, hasSupabaseEnv, env } from "@/lib/env";
import { CP_PREMIUM_AMOUNT, CP_CURRENCY } from "@/lib/cloudpayments/server";

export const runtime = "nodejs";

/**
 * Returns the parameters needed to open the CloudPayments widget on the client.
 * The widget handles card input and payment processing client-side — no server
 * redirect needed. On payment success, CloudPayments fires a webhook to
 * /api/cloudpayments/webhook which activates Premium in our DB.
 */
export async function POST(request: NextRequest) {
  if (!hasSupabaseEnv() || !hasCloudpaymentsEnv()) {
    return NextResponse.json({ error: "CloudPayments or Supabase not configured" }, { status: 500 });
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

  const description =
    locale === "ru"
      ? "Bugatti Sound Premium — месячная подписка"
      : "Bugatti Sound Premium — monthly subscription";

  return NextResponse.json({
    publicId: env.cloudpaymentsPublicId(),
    amount: CP_PREMIUM_AMOUNT,
    currency: CP_CURRENCY,
    description,
    accountId: user.id,
    email: user.email ?? undefined,
    locale,
  });
}
