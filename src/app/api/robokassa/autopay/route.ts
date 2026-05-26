import { NextResponse, type NextRequest } from "next/server";
import {
  chargeByRebillId,
  generateInvId,
  RK_PREMIUM_AMOUNT,
} from "@/lib/robokassa/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { hasRobokassaEnv, hasSupabaseEnv, env } from "@/lib/env";
import { sendAutopayDeclinedEmail } from "@/lib/email";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RENEWAL_LEAD_DAYS = 2;
const MAX_RENEWALS_PER_RUN = 1000;

/**
 * Vercel Cron entry point for monthly Premium auto-renewal via Robokassa.
 * Runs daily at 03:00 UTC.
 * 1. Expires stale Premium (is_premium=false when premium_until passed).
 * 2. Charges users expiring within RENEWAL_LEAD_DAYS who have a robokassa_rebill_id.
 * 3. On decline: clears rebill_id and sends email via Resend.
 */
export async function GET(request: NextRequest) {
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 500 });
  }
  if (request.headers.get("authorization") !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!hasRobokassaEnv() || !hasSupabaseEnv()) {
    return NextResponse.json({ error: "Not configured" }, { status: 500 });
  }

  const admin = createSupabaseAdminClient();
  const now = new Date();

  const { data: expired, error: expireQueryErr } = await admin
    .from("profiles")
    .select("id")
    .eq("is_premium", true)
    .not("premium_until", "is", null)
    .lt("premium_until", now.toISOString());

  let expiredCount = 0;
  if (!expireQueryErr && expired && expired.length > 0) {
    const { error } = await admin
      .from("profiles")
      .update({ is_premium: false })
      .in("id", expired.map((p) => p.id));
    if (!error) expiredCount = expired.length;
  }

  const cutoff = new Date(now.getTime() + RENEWAL_LEAD_DAYS * 24 * 60 * 60 * 1000);
  const { data: candidates, error: queryErr } = await admin
    .from("profiles")
    .select("id, email, preferred_locale, premium_until, robokassa_rebill_id")
    .eq("is_premium", true)
    .not("robokassa_rebill_id", "is", null)
    .not("premium_until", "is", null)
    .lte("premium_until", cutoff.toISOString())
    .gte("premium_until", now.toISOString())
    .order("premium_until", { ascending: true })
    .limit(MAX_RENEWALS_PER_RUN);

  if (queryErr) {
    return NextResponse.json({ error: queryErr.message, expiredCount }, { status: 500 });
  }
  if (!candidates || candidates.length === 0) {
    return NextResponse.json({ ok: true, expiredCount, processed: 0 });
  }

  const login = env.robokassaLogin();
  const password1 = env.robokassaPassword1();
  const isTest = process.env.ROBOKASSA_IS_TEST === "1";

  const results: Array<{ userId: string; status: string; error?: string }> = [];

  for (const profile of candidates) {
    const userId = profile.id;
    const rebillId = profile.robokassa_rebill_id as number | null;
    if (!rebillId) { results.push({ userId, status: "skipped" }); continue; }

    const newInvId = generateInvId();
    const res = await chargeByRebillId({
      login,
      password1,
      outSum: RK_PREMIUM_AMOUNT,
      newInvId,
      previousInvId: rebillId,
      isTest,
    });

    if (res.success) {
      console.log("[rk-autopay] charge initiated", { userId, newInvId });
      results.push({ userId, status: "charged" });
    } else {
      console.warn("[rk-autopay] charge declined", { userId, error: res.errorText });
      await admin.from("profiles").update({ robokassa_rebill_id: null }).eq("id", userId);
      if (profile.email) {
        await sendAutopayDeclinedEmail({ to: profile.email, locale: profile.preferred_locale });
      }
      results.push({ userId, status: "declined", error: res.errorText });
    }
  }

  return NextResponse.json({ ok: true, expiredCount, processed: results.length, results });
}