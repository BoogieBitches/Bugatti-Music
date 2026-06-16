import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

/**
 * POST /api/mix/use-generation
 *
 * Checks if the current user is allowed to generate a mix and, if so,
 * atomically increments their mix_generations_count.
 *
 * Rules:
 *  - Admin  → always allowed, no increment
 *  - Premium → always allowed, no increment
 *  - Free   → allowed if mix_generations_count === 0, then increment to 1
 *
 * Returns:
 *  200 { allowed: true,  role, is_premium, generations_used }
 *  403 { allowed: false, reason: "quota_exceeded" | "not_authenticated" }
 */
export async function POST() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ allowed: false, reason: "not_authenticated" }, { status: 403 });
  }

  const admin = createSupabaseAdminClient();

  const { data: profile, error } = await admin
    .from("profiles")
    .select("role, is_premium, premium_until, mix_generations_count")
    .eq("id", user.id)
    .single();

  if (error || !profile) {
    return NextResponse.json({ allowed: false, reason: "profile_not_found" }, { status: 403 });
  }

  const isAdmin = profile.role === "admin";
  const premiumActive =
    profile.is_premium &&
    (!profile.premium_until || new Date(profile.premium_until) > new Date());

  if (isAdmin || premiumActive) {
    return NextResponse.json({
      allowed: true,
      role: profile.role,
      is_premium: premiumActive,
      generations_used: profile.mix_generations_count,
    });
  }

  if (profile.mix_generations_count >= 1) {
    return NextResponse.json(
      { allowed: false, reason: "quota_exceeded", generations_used: profile.mix_generations_count },
      { status: 403 }
    );
  }

  const { error: updateErr } = await admin
    .from("profiles")
    .update({ mix_generations_count: profile.mix_generations_count + 1 })
    .eq("id", user.id);

  if (updateErr) {
    return NextResponse.json({ allowed: false, reason: "update_failed" }, { status: 500 });
  }

  return NextResponse.json({
    allowed: true,
    role: profile.role,
    is_premium: false,
    generations_used: profile.mix_generations_count + 1,
  });
}
