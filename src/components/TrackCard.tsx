"use client";

import Link from "next/link";
import { useI18n } from "@/i18n/I18nProvider";
import type { TrackWithGenre } from "@/types/db";
import { CoverMedia } from "./CoverMedia";
import { AudioPlayer } from "./AudioPlayer";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

interface Props {
  track: TrackWithGenre;
  previewUrl: string | null;
  imageUrl: string | null;
  videoUrl: string | null;
}

export function TrackCard({ track, previewUrl, imageUrl, videoUrl }: Props) {
  const { locale, dict } = useI18n();
  const genre = track.genre
    ? locale === "ru"
      ? track.genre.name_ru
      : track.genre.name_en
    : null;

  async function handleFirstPlay() {
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL) return;
    try {
      const supabase = createSupabaseBrowserClient();
      await supabase.rpc("increment_plays", { track_id: track.id });
    } catch {
      // ignore
    }
  }

  return (
    <article className="bs-card p-4 flex flex-col gap-3">
      <Link href={`/${locale}/track/${track.id}`} className="block">
        <CoverMedia imageUrl={imageUrl} videoUrl={videoUrl} alt={track.title} size="lg" />
      </Link>
      <div className="min-w-0">
        <Link href={`/${locale}/track/${track.id}`}>
          <h3 className="font-semibold truncate hover:underline">{track.title}</h3>
        </Link>
        <p className="text-sm text-[var(--muted)] truncate">{track.artist}</p>
        <div className="mt-2 flex flex-wrap gap-1.5 text-[10px]">
          {genre && <span className="bs-badge">{genre}</span>}
          {track.bpm && <span className="bs-badge">{track.bpm} {dict.track.bpm}</span>}
          {track.music_key && <span className="bs-badge">{track.music_key}</span>}
          {track.is_premium_only && <span className="bs-badge bs-badge-premium">{dict.common.premiumBadge}</span>}
        </div>
      </div>
      {previewUrl && (
        <AudioPlayer src={previewUrl} isPreview onFirstPlay={handleFirstPlay} />
      )}
    </article>
  );
}
