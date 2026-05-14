import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { hasSupabaseEnv } from "@/lib/env";

export const runtime = "nodejs";

/**
 * Unbind the user's saved card token — stops auto-renewal.
 * The user keeps Premium access until premium_until passes naturally.
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
    .update({ cloudpayments_token: null })
    .eq("id", user.id);

  if (error) {
    console.error("[cp-portal] failed to unbind token", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
