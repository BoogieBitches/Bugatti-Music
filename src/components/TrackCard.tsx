"use client";

import Link from "next/link";
import { motion, useMotionValue, useSpring, useTransform } from "framer-motion";
import { useRef } from "react";
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

  const cardRef = useRef<HTMLElement | null>(null);
  const mvX = useMotionValue(0);
  const mvY = useMotionValue(0);
  const sX = useSpring(mvX, { stiffness: 200, damping: 18, mass: 0.5 });
  const sY = useSpring(mvY, { stiffness: 200, damping: 18, mass: 0.5 });
  const rotateX = useTransform(sY, [-0.5, 0.5], [6, -6]);
  const rotateY = useTransform(sX, [-0.5, 0.5], [-8, 8]);

  function onMove(e: React.MouseEvent<HTMLElement>) {
    const r = cardRef.current?.getBoundingClientRect();
    if (!r) return;
    mvX.set((e.clientX - r.left) / r.width - 0.5);
    mvY.set((e.clientY - r.top) / r.height - 0.5);
  }
  function onLeave() {
    mvX.set(0);
    mvY.set(0);
  }

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
    <motion.article
      ref={cardRef}
      onMouseMove={onMove}
      onMouseLeave={onLeave}
      style={{ rotateX, rotateY, transformStyle: "preserve-3d", perspective: 1000 }}
      className="bs-card bs-card-glow p-4 flex flex-col gap-3 relative will-change-transform"
    >
      <Link href={`/${locale}/track/${track.id}`} className="block relative overflow-hidden rounded-xl">
        <CoverMedia imageUrl={imageUrl} videoUrl={videoUrl} alt={track.title} size="lg" />
      </Link>
      <div className="min-w-0">
        <Link href={`/${locale}/track/${track.id}`}>
          <h3 className="font-display font-semibold truncate hover:text-[var(--accent-3)] transition-colors text-base">
            {track.title}
          </h3>
        </Link>
        <p className="text-sm text-[var(--muted)] truncate">{track.artist}</p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {genre && <span className="bs-badge">{genre}</span>}
          {track.bpm && (
            <span className="bs-badge">
              {track.bpm} {dict.track.bpm}
            </span>
          )}
          {track.music_key && <span className="bs-badge">{track.music_key}</span>}
          {track.is_premium_only && (
            <span className="bs-badge bs-badge-premium">{dict.common.premiumBadge}</span>
          )}
        </div>
      </div>
      {previewUrl && (
        <AudioPlayer src={previewUrl} isPreview onFirstPlay={handleFirstPlay} />
      )}
    </motion.article>
  );
}
