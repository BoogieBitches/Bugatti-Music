import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { hasSupabaseEnv } from "@/lib/env";

export const runtime = "nodejs";

/**
 * Unbind the user's saved card / cancel auto-renewal.
 *
 * YooKassa has no hosted "billing portal" like Stripe — instead we own the
 * UI on /dashboard. This endpoint clears `yookassa_payment_method_id` from
 * the profile, which stops the daily autopay cron from charging this user
 * on the next renewal. The user keeps Premium access until premium_until
 * passes naturally — download gating already checks that.
 *
 * Per ЮKassa "Recurring payments" approval requirements, this flow must
 * be self-service: the user can unbind their card from the dashboard at
 * any time without contacting support. We do NOT need to notify ЮKassa
 * about the unbind — once the saved payment_method_id is gone from our
 * DB we simply stop calling it, and the token effectively expires.
 */
export async function POST() {
  if (!hasSupabaseEnv()) {
    return NextResponse.json({ error: "Not configured" }, { status: 500 });
  }
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { error } = await supabase
    .from("profiles")
    .update({ yookassa_payment_method_id: null })
    .eq("id", user.id);

  if (error) {
    console.error("[yookassa-portal] failed to unbind card", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
