import { NextResponse, type NextRequest } from "next/server";
import { randomUUID } from "node:crypto";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  getYooCheckout,
  YOOKASSA_CURRENCY,
  YOOKASSA_PREMIUM_AMOUNT,
} from "@/lib/yookassa/server";
import { env, hasYookassaEnv, hasSupabaseEnv } from "@/lib/env";
import type { ICreatePayment } from "@a2seven/yoo-checkout";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  if (!hasSupabaseEnv() || !hasYookassaEnv()) {
    return NextResponse.json(
      { error: "ЮKassa or Supabase not configured" },
      { status: 500 },
    );
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

  const admin = createSupabaseAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("is_premium, premium_until")
    .eq("id", user.id)
    .maybeSingle();

  const stillPremium =
    !!profile?.is_premium &&
    (!profile.premium_until || new Date(profile.premium_until) > new Date());
  if (stillPremium) {
    return NextResponse.json(
      { error: "Already Premium" },
      { status: 400 },
    );
  }

  const baseUrl = env.appUrl();
  const description =
    locale === "ru"
      ? "Bugatti Sound Premium — месячная подписка"
      : "Bugatti Sound Premium — monthly subscription";

  const payload: ICreatePayment = {
    amount: { value: YOOKASSA_PREMIUM_AMOUNT, currency: YOOKASSA_CURRENCY },
    capture: true,
    save_payment_method: true,
    description,
    confirmation: {
      type: "redirect",
      return_url: `${baseUrl}/${locale}/dashboard?checkout=processing`,
      locale: locale === "ru" ? "ru_RU" : "en_US",
    },
    metadata: {
      supabase_user_id: user.id,
      kind: "premium_initial",
      locale,
    },
  };

  try {
    const yoo = getYooCheckout();
    const idempotenceKey = randomUUID();
    const payment = await yoo.createPayment(payload, idempotenceKey);

    await admin
      .from("profiles")
      .update({ yookassa_last_payment_id: payment.id })
      .eq("id", user.id);

    const url = payment.confirmation?.confirmation_url;
    if (!url) {
      console.error("[yookassa-checkout] no confirmation_url", { paymentId: payment.id });
      return NextResponse.json(
        { error: "ЮKassa did not return a confirmation URL" },
        { status: 502 },
      );
    }
    return NextResponse.json({ url });
  } catch (err) {
    const message = err instanceof Error ? err.message : "ЮKassa error";
    console.error("[yookassa-checkout] createPayment failed", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
