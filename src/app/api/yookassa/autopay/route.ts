import { NextResponse, type NextRequest } from "next/server";
import { createHash } from "node:crypto";
import { getYooCheckout, YOOKASSA_CURRENCY, YOOKASSA_PREMIUM_AMOUNT } from "@/lib/yookassa/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { hasYookassaEnv, hasSupabaseEnv } from "@/lib/env";
import type { ICreatePayment } from "@a2seven/yoo-checkout";

export const runtime = "nodejs";
// We don't want this to ever be statically prerendered or cached.
export const dynamic = "force-dynamic";

// How far in advance of premium_until we attempt to renew.
// 2 days gives us a retry window if the first charge fails (card declined,
// temporary issuer problem, etc).
const RENEWAL_LEAD_DAYS = 2;

// Cap how many users we charge per run as a safety net against runaway costs
// if something goes wrong. Vercel Cron runs daily — even with the cap, this
// is enough headroom for ~31k active subscribers/month.
const MAX_RENEWALS_PER_RUN = 1000;

// Deterministic idempotence key per (user, renewal cycle).
// If Vercel Cron retries within the same renewal window, ЮKassa will
// dedupe by this key and return the same payment instead of charging twice.
function autopayIdempotenceKey(userId: string, premiumUntilIso: string): string {
  return createHash("sha256")
    .update(`autopay:${userId}:${premiumUntilIso}`)
    .digest("hex")
    .slice(0, 32);
}

/**
 * Vercel Cron entry point for monthly Premium auto-renewal.
 *
 * Flow:
 *   1. Verify `Authorization: Bearer ${CRON_SECRET}` (Vercel Cron injects this
 *      automatically when CRON_SECRET is set in project env vars).
 *   2. Find Premium profiles whose subscription expires within
 *      RENEWAL_LEAD_DAYS days and that have a saved payment method.
 *   3. For each, charge 499 RUB via ЮKassa using the saved
 *      `payment_method_id`. Pass capture=true so the funds are pulled
 *      synchronously without user interaction.
 *   4. On success, ЮKassa fires payment.succeeded → existing webhook
 *      activates Premium for another 30 days anchored on captured_at.
 *      We do NOT update the profile here — webhook is the sole writer.
 *   5. On failure, log it. The user keeps Premium until premium_until
 *      passes naturally (download gate already checks that timestamp).
 */
export async function GET(request: NextRequest) {
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    console.error("[yookassa-autopay] CRON_SECRET not configured");
    return NextResponse.json({ error: "Not configured" }, { status: 500 });
  }
  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!hasYookassaEnv() || !hasSupabaseEnv()) {
    return NextResponse.json({ error: "Not configured" }, { status: 500 });
  }

  const admin = createSupabaseAdminClient();
  const now = new Date();
  const cutoff = new Date(now.getTime() + RENEWAL_LEAD_DAYS * 24 * 60 * 60 * 1000);

  const { data: candidates, error: queryErr } = await admin
    .from("profiles")
    .select("id, premium_until, yookassa_payment_method_id")
    .eq("is_premium", true)
    .not("yookassa_payment_method_id", "is", null)
    .not("premium_until", "is", null)
    .lte("premium_until", cutoff.toISOString())
    .gte("premium_until", now.toISOString())
    // Process the soonest-to-expire users first. Without an explicit order
    // PostgreSQL can return rows in arbitrary heap/index order, so when the
    // candidate set exceeds MAX_RENEWALS_PER_RUN a user expiring in hours
    // could be skipped in favour of one expiring in two days — and by the
    // next cron run the skipped user's premium_until would have passed,
    // making them ineligible forever.
    .order("premium_until", { ascending: true })
    .limit(MAX_RENEWALS_PER_RUN);

  if (queryErr) {
    console.error("[yookassa-autopay] candidate query failed", queryErr);
    return NextResponse.json({ error: queryErr.message }, { status: 500 });
  }

  if (!candidates || candidates.length === 0) {
    return NextResponse.json({ ok: true, processed: 0 });
  }

  const yoo = getYooCheckout();
  const results: Array<{
    userId: string;
    status: "charged" | "skipped" | "error";
    paymentId?: string;
    error?: string;
  }> = [];

  for (const profile of candidates) {
    const userId = profile.id;
    const methodId = profile.yookassa_payment_method_id;
    const premiumUntil = profile.premium_until;
    if (!methodId || !premiumUntil) {
      results.push({ userId, status: "skipped" });
      continue;
    }

    const payload: ICreatePayment = {
      amount: { value: YOOKASSA_PREMIUM_AMOUNT, currency: YOOKASSA_CURRENCY },
      capture: true,
      payment_method_id: methodId,
      description: "Bugatti Sound Premium — auto-renewal",
      metadata: {
        supabase_user_id: userId,
        kind: "premium_autopay",
        prev_premium_until: premiumUntil,
      },
    };

    try {
      const payment = await yoo.createPayment(
        payload,
        autopayIdempotenceKey(userId, premiumUntil),
      );
      console.log("[yookassa-autopay] charged", {
        userId,
        paymentId: payment.id,
        status: payment.status,
      });
      results.push({ userId, status: "charged", paymentId: payment.id });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      console.error("[yookassa-autopay] charge failed", { userId, error: message });
      results.push({ userId, status: "error", error: message });
    }
  }

  return NextResponse.json({
    ok: true,
    processed: results.length,
    results,
  });
}
