import { NextResponse, type NextRequest } from "next/server";
import { createHash } from "node:crypto";
import { chargeByToken, CP_PREMIUM_AMOUNT } from "@/lib/cloudpayments/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { hasCloudpaymentsEnv, hasSupabaseEnv } from "@/lib/env";
import { sendAutopayDeclinedEmail } from "@/lib/email";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RENEWAL_LEAD_DAYS = 2;
const MAX_RENEWALS_PER_RUN = 1000;

function invoiceId(userId: string, premiumUntilIso: string): string {
  return createHash("sha256")
    .update(`autopay:${userId}:${premiumUntilIso}`)
    .digest("hex")
    .slice(0, 32);
}

/**
 * Vercel Cron entry point for monthly Premium auto-renewal via CloudPayments.
 * Runs daily at 03:00 UTC. Does three things:
 *
 * 1. Expires Premium for users whose premium_until has passed (is_premium = false).
 * 2. Charges users whose subscription expires within RENEWAL_LEAD_DAYS days
 *    and who have a saved card token.
 * 3. On a declined charge: removes the card token and sends an email via Resend
 *    so the user knows to re-subscribe.
 *
 * On a successful charge, CloudPayments fires a webhook to
 * /api/cloudpayments/webhook which activates Premium for another 30 days.
 */
export async function GET(request: NextRequest) {
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    console.error("[cp-autopay] CRON_SECRET not configured");
    return NextResponse.json({ error: "Not configured" }, { status: 500 });
  }
  if (request.headers.get("authorization") !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!hasCloudpaymentsEnv() || !hasSupabaseEnv()) {
    return NextResponse.json({ error: "Not configured" }, { status: 500 });
  }

  const admin = createSupabaseAdminClient();
  const now = new Date();

  // ── Step 1: Expire stale Premium ──────────────────────────────────────────
  const { data: expired, error: expireQueryErr } = await admin
    .from("profiles")
    .select("id")
    .eq("is_premium", true)
    .not("premium_until", "is", null)
    .lt("premium_until", now.toISOString());

  let expiredCount = 0;
  if (expireQueryErr) {
    console.error("[cp-autopay] expire query failed", expireQueryErr);
  } else if (expired && expired.length > 0) {
    const ids = expired.map((p) => p.id);
    const { error: expireErr } = await admin
      .from("profiles")
      .update({ is_premium: false })
      .in("id", ids);
    if (expireErr) {
      console.error("[cp-autopay] expire update failed", expireErr);
    } else {
      expiredCount = ids.length;
      console.log("[cp-autopay] expired premium for", expiredCount, "user(s)");
    }
  }

  // ── Step 2: Charge upcoming renewals ──────────────────────────────────────
  const cutoff = new Date(now.getTime() + RENEWAL_LEAD_DAYS * 24 * 60 * 60 * 1000);

  const { data: candidates, error: queryErr } = await admin
    .from("profiles")
    .select("id, email, preferred_locale, premium_until, cloudpayments_token")
    .eq("is_premium", true)
    .not("cloudpayments_token", "is", null)
    .not("premium_until", "is", null)
    .lte("premium_until", cutoff.toISOString())
    .gte("premium_until", now.toISOString())
    .order("premium_until", { ascending: true })
    .limit(MAX_RENEWALS_PER_RUN);

  if (queryErr) {
    console.error("[cp-autopay] candidate query failed", queryErr);
    return NextResponse.json({ error: queryErr.message, expiredCount }, { status: 500 });
  }

  if (!candidates || candidates.length === 0) {
    return NextResponse.json({ ok: true, expiredCount, processed: 0 });
  }

  const results: Array<{
    userId: string;
    status: "charged" | "skipped" | "declined" | "error";
    transactionId?: number;
    error?: string;
  }> = [];

  for (const profile of candidates) {
    const userId = profile.id;
    const token = profile.cloudpayments_token;
    const premiumUntil = profile.premium_until;
    if (!token || !premiumUntil) {
      results.push({ userId, status: "skipped" });
      continue;
    }

    try {
      const res = await chargeByToken({
        token,
        accountId: userId,
        amount: CP_PREMIUM_AMOUNT,
        description: "Bugatti Sound Premium — auto-renewal",
        invoiceId: invoiceId(userId, premiumUntil),
        jsonData: { kind: "premium_autopay", prev_premium_until: premiumUntil },
      });

      if (res.Success) {
        console.log("[cp-autopay] charged", {
          userId,
          transactionId: res.Model?.TransactionId,
        });
        results.push({
          userId,
          status: "charged",
          transactionId: res.Model?.TransactionId,
        });
      } else {
        // ── Declined: remove token + notify user ──────────────────────────
        console.warn("[cp-autopay] charge declined", { userId, message: res.Message });

        await admin
          .from("profiles")
          .update({ cloudpayments_token: null })
          .eq("id", userId);

        if (profile.email) {
          await sendAutopayDeclinedEmail({
            to: profile.email,
            locale: profile.preferred_locale,
          });
        }

        results.push({ userId, status: "declined", error: res.Message ?? undefined });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      console.error("[cp-autopay] charge failed", { userId, error: message });
      results.push({ userId, status: "error", error: message });
    }
  }

  return NextResponse.json({ ok: true, expiredCount, processed: results.length, results });
}
