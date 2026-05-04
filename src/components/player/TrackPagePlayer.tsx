"use client";

import { useEffect } from "react";
import { usePlayer, type PlayerTrack } from "./PlayerStore";
import { PlayButton } from "./PlayButton";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

interface Props {
  track: PlayerTrack;
  locale: string;
}

export function TrackPagePlayer({ track, locale }: Props) {
  const { registerFirstPlayCallback } = usePlayer();

  useEffect(() => {
    return registerFirstPlayCallback((id) => {
      if (id !== track.id) return;
      if (!process.env.NEXT_PUBLIC_SUPABASE_URL) return;
      try {
        const supabase = createSupabaseBrowserClient();
        supabase
          .rpc("increment_plays", { track_id: track.id })
          .then(
            () => {},
            () => {},
          );
      } catch {
        // ignore
      }
    });
  }, [registerFirstPlayCallback, track.id]);

  return (
    <div className="flex items-center gap-4">
      <PlayButton
        track={track}
        variant="pill"
        label={locale === "ru" ? "Слушать превью" : "Play preview"}
      />
      <span className="text-xs uppercase tracking-[0.18em] text-[var(--muted)]">
        {locale === "ru" ? "30 сек превью" : "30 sec preview"}
      </span>
    </div>
  );
}
