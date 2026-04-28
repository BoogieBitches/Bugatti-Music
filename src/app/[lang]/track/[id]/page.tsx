import { notFound } from "next/navigation";
import { isLocale } from "@/i18n/config";
import { getDictionary } from "@/i18n/dictionaries";
import { hasSupabaseEnv } from "@/lib/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { CoverMedia } from "@/components/CoverMedia";
import { AudioPlayer } from "@/components/AudioPlayer";
import { DownloadButton } from "@/components/DownloadButton";
import type { TrackWithGenre } from "@/types/db";
import { formatDuration } from "@/lib/utils";

export default async function TrackPage({ params }: PageProps<"/[lang]/track/[id]">) {
  const { lang, id } = await params;
  if (!isLocale(lang)) notFound();
  if (!hasSupabaseEnv()) notFound();
  const dict = await getDictionary(lang);

  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("tracks")
    .select(
      "*, genre:genres(id, slug, name_en, name_ru), uploader:profiles!tracks_uploader_id_fkey(id, full_name, avatar_url)",
    )
    .eq("id", id)
    .maybeSingle();
  if (!data) notFound();
  const track = data as TrackWithGenre;

  // Visibility: approved → public; pending/rejected → uploader or admin only.
  const {
    data: { user },
  } = await supabase.auth.getUser();
  let isAdmin = false;
  let isPremium = false;
  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("role, is_premium, premium_until")
      .eq("id", user.id)
      .maybeSingle();
    isAdmin = profile?.role === "admin";
    isPremium =
      !!profile?.is_premium &&
      (!profile.premium_until || new Date(profile.premium_until) > new Date());
  }
  if (track.status !== "approved" && !(user?.id === track.uploader_id || isAdmin)) {
    notFound();
  }

  const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const publicCover = (p: string | null) =>
    p && baseUrl ? `${baseUrl}/storage/v1/object/public/covers/${p}` : null;
  const publicPreview = (p: string | null) =>
    p && baseUrl ? `${baseUrl}/storage/v1/object/public/audio-previews/${p}` : null;

  const previewUrl = publicPreview(track.preview_path);
  const imageUrl = publicCover(track.cover_image_path);
  const videoUrl = publicCover(track.cover_video_path);

  const genreName = track.genre
    ? lang === "ru"
      ? track.genre.name_ru
      : track.genre.name_en
    : null;

  return (
    <div className="max-w-5xl mx-auto px-4 py-10 grid md:grid-cols-[280px_1fr] gap-8 items-start">
      <CoverMedia imageUrl={imageUrl} videoUrl={videoUrl} alt={track.title} size="lg" />
      <div>
        <div className="flex flex-wrap gap-2 mb-2">
          {genreName && <span className="bs-badge">{genreName}</span>}
          {track.is_premium_only && <span className="bs-badge bs-badge-premium">{dict.common.premiumBadge}</span>}
          {track.status !== "approved" && <span className="bs-badge">{track.status}</span>}
        </div>
        <h1 className="text-3xl md:text-4xl font-bold tracking-tight">{track.title}</h1>
        <p className="text-lg text-[var(--muted)] mt-1">
          {dict.track.by} <span className="text-white">{track.artist}</span>
        </p>

        <dl className="mt-6 grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
          <Stat label={dict.track.bpm} value={track.bpm?.toString() ?? "—"} />
          <Stat label={dict.track.key} value={track.music_key ?? "—"} />
          <Stat label={dict.track.duration} value={formatDuration(track.duration_seconds)} />
          <Stat label={dict.track.plays} value={track.plays_count.toString()} />
        </dl>

        {previewUrl && (
          <div className="mt-6 bs-card p-4">
            <AudioPlayer src={previewUrl} isPreview />
          </div>
        )}

        {track.description && (
          <p className="mt-6 text-[var(--muted)] whitespace-pre-wrap">{track.description}</p>
        )}

        <div className="mt-8 flex flex-wrap gap-3">
          <DownloadButton
            trackId={track.id}
            locale={lang}
            isLoggedIn={!!user}
            canDownload={isPremium || isAdmin}
            dict={dict}
          />
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bs-card p-3">
      <div className="text-[10px] uppercase tracking-wide text-[var(--muted)]">{label}</div>
      <div className="font-semibold mt-0.5">{value}</div>
    </div>
  );
}
