import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSignedUrl } from "@/lib/storage";
import { hasSupabaseEnv } from "@/lib/env";

export async function POST(
  _request: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  if (!hasSupabaseEnv()) {
    return NextResponse.json({ error: "Supabase not configured" }, { status: 500 });
  }
  const { id } = await ctx.params;

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, is_premium, premium_until")
    .eq("id", user.id)
    .maybeSingle();

  const isAdmin = profile?.role === "admin";
  const isPremium =
    !!profile?.is_premium &&
    (!profile.premium_until || new Date(profile.premium_until) > new Date());

  if (!isPremium && !isAdmin) {
    return NextResponse.json({ error: "Premium required" }, { status: 403 });
  }

  const { data: track } = await supabase
    .from("tracks")
    .select("audio_path, status, title, artist")
    .eq("id", id)
    .maybeSingle();

  if (!track) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (track.status !== "approved" && !isAdmin) {
    return NextResponse.json({ error: "Not available" }, { status: 403 });
  }

  // Build a friendly download filename. Supabase appends Content-Disposition: attachment
  // when the `download` option is passed, which forces browsers to save instead of stream.
  const ext = track.audio_path.split(".").pop()?.toLowerCase() || "mp3";
  const safe = (s: string) =>
    s
      .normalize("NFKD")
      .replace(/[^\p{L}\p{N}\s._-]+/gu, "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 80);
  const baseName = [track.artist, track.title].filter(Boolean).map(safe).join(" - ") || "track";
  const downloadName = `${baseName}.${ext}`;

  const url = await createSignedUrl("audio-tracks", track.audio_path, 60 * 5, {
    download: downloadName,
  });
  if (!url) return NextResponse.json({ error: "Could not sign URL" }, { status: 500 });

  // Best-effort increment of downloads_count using service role.
  try {
    const admin = createSupabaseAdminClient();
    const { data: row } = await admin
      .from("tracks")
      .select("downloads_count")
      .eq("id", id)
      .maybeSingle();
    const next = (row?.downloads_count ?? 0) + 1;
    await admin.from("tracks").update({ downloads_count: next }).eq("id", id);
  } catch {
    // ignore
  }

  return NextResponse.json({ url });
}
