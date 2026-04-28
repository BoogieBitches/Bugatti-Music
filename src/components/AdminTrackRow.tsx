"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CoverMedia } from "./CoverMedia";
import { AudioPlayer } from "./AudioPlayer";
import type { TrackWithGenre } from "@/types/db";
import type { Dictionary } from "@/i18n/dictionaries";

interface Props {
  track: TrackWithGenre;
  previewUrl: string | null;
  imageUrl: string | null;
  videoUrl: string | null;
  dict: Dictionary;
  mode: "pending" | "approved";
}

export function AdminTrackRow({ track, previewUrl, imageUrl, videoUrl, dict, mode }: Props) {
  const router = useRouter();
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function moderate(action: "approve" | "reject" | "unapprove") {
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/admin/moderate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          trackId: track.id,
          action,
          rejectionReason: action === "reject" ? reason : null,
        }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "Failed");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <li className="bs-card p-4 grid md:grid-cols-[120px_1fr_auto] gap-4 items-start">
      <CoverMedia imageUrl={imageUrl} videoUrl={videoUrl} alt={track.title} size="md" />
      <div className="min-w-0">
        <h3 className="font-semibold">{track.title}</h3>
        <p className="text-sm text-[var(--muted)]">{track.artist}</p>
        <div className="mt-2 flex flex-wrap gap-1.5 text-[10px]">
          {track.genre && <span className="bs-badge">{track.genre.name_en}</span>}
          {track.bpm && <span className="bs-badge">{track.bpm} BPM</span>}
          {track.music_key && <span className="bs-badge">{track.music_key}</span>}
          {track.is_premium_only && <span className="bs-badge bs-badge-premium">Premium</span>}
        </div>
        {previewUrl && (
          <div className="mt-3">
            <AudioPlayer src={previewUrl} isPreview />
          </div>
        )}
        {mode === "pending" && (
          <input
            placeholder={dict.admin.rejectReasonPlaceholder}
            className="bs-input mt-2 max-w-sm"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        )}
        {error && <div className="text-xs text-red-300 mt-2">{error}</div>}
      </div>
      <div className="flex flex-col gap-2 md:items-end">
        {mode === "pending" ? (
          <>
            <button
              disabled={loading}
              onClick={() => moderate("approve")}
              className="bs-button bs-button-primary"
            >
              {dict.admin.approve}
            </button>
            <button
              disabled={loading}
              onClick={() => moderate("reject")}
              className="bs-button"
            >
              {dict.admin.reject}
            </button>
          </>
        ) : (
          <button
            disabled={loading}
            onClick={() => moderate("unapprove")}
            className="bs-button"
          >
            {dict.admin.reject}
          </button>
        )}
      </div>
    </li>
  );
}
