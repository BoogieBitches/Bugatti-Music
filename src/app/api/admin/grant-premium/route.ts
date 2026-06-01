import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { hasSupabaseEnv } from "@/lib/env";

export const runtime = "nodejs";

const PREMIUM_PERIOD_MS = 30 * 24 * 60 * 60 * 1000;

function premiumUntil(prevIso?: string | null): string {
  const now = Date.now();
  if (prevIso) {
    const prevTs = new Date(prevIso).getTime();
    if (Number.isFinite(prevTs) && prevTs > now) {
      return new Date(prevTs + PREMIUM_PERIOD_MS).toISOString();
    }
  }
  return new Date(now + PREMIUM_PERIOD_MS).toISOString();
}

/**
 * POST /api/admin/grant-premium
 * Body: { userId: string, months?: number }
 * Admin-only: manually activate Premium for a user.
 */
export async function POST(request: NextRequest) {
  if (!hasSupabaseEnv()) {
    return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: callerProfile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  if (callerProfile?.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    userId?: string;
    months?: number;
  };

  if (!body.userId) {
    return NextResponse.json({ error: "userId is required" }, { status: 400 });
  }

  const months = Math.max(1, Math.min(12, body.months ?? 1));
  const periodMs = months * 30 * 24 * 60 * 60 * 1000;

  const admin = createSupabaseAdminClient();

  const { data: target } = await admin
    .from("profiles")
    .select("id, email, premium_until")
    .eq("id", body.userId)
    .maybeSingle();

  if (!target) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const now = Date.now();
  const prevTs = target.premium_until ? new Date(target.premium_until).getTime() : 0;
  const base = Number.isFinite(prevTs) && prevTs > now ? prevTs : now;
  const newPremiumUntil = new Date(base + periodMs).toISOString();

  const { error } = await admin
    .from("profiles")
    .update({ is_premium: true, premium_until: newPremiumUntil })
    .eq("id", body.userId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await admin.from("audit_log").insert({
    actor_id: user.id,
    action: "admin_grant_premium",
    target_type: "profile",
    target_id: body.userId,
    meta: { months, premium_until: newPremiumUntil },
  });

  console.log("[admin] grant-premium", {
    by: user.id,
    target: body.userId,
    months,
    premiumUntil: newPremiumUntil,
  });

  return NextResponse.json({ ok: true, premiumUntil: newPremiumUntil });
}
