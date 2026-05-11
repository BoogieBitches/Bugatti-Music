import { NextResponse, type NextRequest } from "next/server";
import { randomUUID } from "node:crypto";
import { createSupabaseServerClient } from "@/lib/supabase/server";
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

  const { data: profile } = await supabase
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

    // Do NOT write yookassa_last_payment_id here. The webhook handler treats
    // a match between profile.yookassa_last_payment_id and the incoming
    // payment id as a "duplicate, already processed" signal, so pre-writing
    // would cause every payment.succeeded webhook to short-circuit before
    // activating Premium. The webhook is the sole writer of that column.

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
    console.error("[yookassa-checkout] createPayment failed", err);
    // yoo-checkout SDK throws plain objects (not Error instances) on API
    // errors. Extract the real reason — shop owners need to know if it's
    // `invalid_credentials`, `forbidden`, `unauthorized`, etc.
    const detail = describeYookassaError(err);
    return NextResponse.json({ error: detail }, { status: 500 });
  }
}

function describeYookassaError(err: unknown): string {
  if (!err || typeof err !== "object") {
    return err instanceof Error && err.message ? err.message : "ЮKassa error";
  }

  const o = err as Record<string, unknown>;

  // 1. Axios-style errors: status + response.data with code/description.
  const response = (o.response ?? null) as Record<string, unknown> | null;
  if (response && typeof response === "object") {
    const data = (response.data ?? null) as Record<string, unknown> | null;
    const status = typeof response.status === "number" ? response.status : null;
    const parts: string[] = [];
    if (status !== null) parts.push(`http=${status}`);
    if (data && typeof data === "object") {
      if (typeof data.code === "string") parts.push(data.code);
      if (typeof data.description === "string") parts.push(data.description);
      if (typeof data.parameter === "string") parts.push(`param=${data.parameter}`);
      if (typeof data.id === "string") parts.push(`id=${data.id}`);
    }
    if (parts.length > 0) return `ЮKassa: ${parts.join(" — ")}`;
  }

  // 2. Plain yoo-checkout SDK error shape.
  const parts: string[] = [];
  if (typeof o.code === "string") parts.push(o.code);
  if (typeof o.id === "string") parts.push(`id=${o.id}`);
  if (typeof o.description === "string") parts.push(o.description);
  if (typeof o.parameter === "string") parts.push(`param=${o.parameter}`);
  if (typeof o.type === "string" && parts.length === 0) parts.push(o.type);
  if (parts.length > 0) return `ЮKassa: ${parts.join(" — ")}`;

  // 3. Axios error with no response (network / DNS / cert): use err.code + err.message.
  if (typeof o.code === "string" && typeof o.message === "string") {
    return `ЮKassa: ${o.code} — ${o.message}`;
  }
  if (typeof o.message === "string" && o.message) return `ЮKassa: ${o.message}`;

  return "ЮKassa error";
}
