import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { env, hasSupabaseEnv } from "@/lib/env";

/**
 * Promote the currently signed-in user to admin if their email is listed in
 * the ADMIN_EMAILS env var. Useful for the very first admin assignment after
 * deployment — no manual SQL required.
 */
export async function POST() {
  if (!hasSupabaseEnv()) {
    return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });
  }
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const allow = env.adminEmails();
  if (!allow.includes(user.email.toLowerCase())) {
    return NextResponse.json({ error: "Email not on admin list" }, { status: 403 });
  }

  const admin = createSupabaseAdminClient();
  const { error } = await admin.from("profiles").update({ role: "admin" }).eq("id", user.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
