import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { hasSupabaseEnv } from "@/lib/env";

export async function POST(request: NextRequest) {
  if (!hasSupabaseEnv()) {
    return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });
  }
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  if (profile?.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    trackId?: string;
    action?: "approve" | "reject" | "unapprove";
    rejectionReason?: string | null;
  };
  if (!body.trackId || !body.action) {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }

  const admin = createSupabaseAdminClient();
  const update =
    body.action === "approve"
      ? {
          status: "approved" as const,
          approved_by: user.id,
          approved_at: new Date().toISOString(),
          rejection_reason: null,
        }
      : body.action === "reject"
      ? {
          status: "rejected" as const,
          approved_by: null,
          approved_at: null,
          rejection_reason: body.rejectionReason ?? null,
        }
      : {
          status: "pending" as const,
          approved_by: null,
          approved_at: null,
        };

  const { error } = await admin.from("tracks").update(update).eq("id", body.trackId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await admin.from("audit_log").insert({
    actor_id: user.id,
    action: `moderate_${body.action}`,
    target_type: "track",
    target_id: body.trackId,
    meta: { rejection_reason: body.rejectionReason ?? null },
  });

  return NextResponse.json({ ok: true });
}
