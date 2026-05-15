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
    action?: "approve" | "reject" | "unapprove" | "delete";
    rejectionReason?: string | null;
  };
  if (!body.trackId || !body.action) {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }

  const admin = createSupabaseAdminClient();

  // ── DELETE ──────────────────────────────────────────────────────────────────
  if (body.action === "delete") {
    // Fetch track so we know which storage paths to clean up.
    const { data: track, error: fetchErr } = await admin
      .from("tracks")
      .select("audio_path, preview_path, cover_image_path, cover_video_path")
      .eq("id", body.trackId)
      .maybeSingle();

    if (fetchErr) {
      return NextResponse.json({ error: fetchErr.message }, { status: 500 });
    }

    // Delete storage files (best-effort — don't abort if a file is missing).
    const storageDeletes: Promise<unknown>[] = [];
    if (track?.audio_path) {
      storageDeletes.push(
        admin.storage.from("audio-tracks").remove([track.audio_path]),
      );
    }
    if (track?.preview_path) {
      storageDeletes.push(
        admin.storage.from("audio-previews").remove([track.preview_path]),
      );
    }
    if (track?.cover_image_path) {
      storageDeletes.push(
        admin.storage.from("covers").remove([track.cover_image_path]),
      );
    }
    if (track?.cover_video_path) {
      storageDeletes.push(
        admin.storage.from("covers").remove([track.cover_video_path]),
      );
    }
    await Promise.allSettled(storageDeletes);

    // Delete DB record (cascades favorites, etc. via FK).
    const { error: delErr } = await admin
      .from("tracks")
      .delete()
      .eq("id", body.trackId);
    if (delErr) {
      return NextResponse.json({ error: delErr.message }, { status: 500 });
    }

    await admin.from("audit_log").insert({
      actor_id: user.id,
      action: "moderate_delete",
      target_type: "track",
      target_id: body.trackId,
      meta: {},
    });

    return NextResponse.json({ ok: true });
  }

  // ── APPROVE / REJECT / UNAPPROVE ────────────────────────────────────────────
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
