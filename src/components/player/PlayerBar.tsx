"use client";

import Image from "next/image";
import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { Pause, Play, Volume2, VolumeX, X } from "lucide-react";
import { usePlayer } from "./PlayerStore";
import { formatDuration } from "@/lib/utils";

export function PlayerBar() {
  const {
    current,
    playing,
    currentTime,
    duration,
    volume,
    muted,
    toggle,
    seek,
    setVolume,
    setMuted,
    close,
  } = usePlayer();

  const scrubRef = useRef<HTMLDivElement | null>(null);
  const [hoverT, setHoverT] = useState<number | null>(null);
  const [dragging, setDragging] = useState(false);

  const pct = useMemo(() => {
    if (!duration) return 0;
    return Math.min(100, (currentTime / duration) * 100);
  }, [currentTime, duration]);

  function pointerToTime(e: React.PointerEvent | PointerEvent) {
    const el = scrubRef.current;
    if (!el || !duration) return 0;
    const r = el.getBoundingClientRect();
    const x = Math.max(0, Math.min(e.clientX - r.left, r.width));
    return (x / r.width) * duration;
  }

  function handlePointerDown(e: React.PointerEvent) {
    if (!duration) return;
    setDragging(true);
    (e.target as Element).setPointerCapture?.(e.pointerId);
    seek(pointerToTime(e));
  }
  function handlePointerMove(e: React.PointerEvent) {
    const t = pointerToTime(e);
    setHoverT(t);
    if (dragging) seek(t);
  }
  function handlePointerUp(e: React.PointerEvent) {
    if (dragging) {
      setDragging(false);
      (e.target as Element).releasePointerCapture?.(e.pointerId);
    }
  }

  if (!current) return null;

  return (
    <div
      className="pb-root fixed bottom-0 inset-x-0 z-[70] pointer-events-none md:pl-[56px]"
      role="region"
      aria-label="Audio player"
    >
      <div className="pb-shell pointer-events-auto mx-auto max-w-[1400px] px-3 md:px-6 pb-3 md:pb-4">
        <div className="pb-bar">
          {/* LEFT: cover + title/artist */}
          <Link
            href={current.href}
            className="pb-meta group"
            aria-label={`${current.title} — ${current.artist}`}
          >
            <div className="pb-cover">
              {current.coverUrl ? (
                <Image
                  src={current.coverUrl}
                  alt={current.title}
                  width={56}
                  height={56}
                  className="w-full h-full object-cover"
                  unoptimized
                />
              ) : (
                <div className="w-full h-full bg-gradient-to-br from-[var(--accent)] to-[var(--accent-2)]" />
              )}
              {playing && (
                <div aria-hidden className="pb-eq">
                  <span /><span /><span /><span />
                </div>
              )}
            </div>
            <div className="pb-text">
              <div className="pb-title truncate">{current.title}</div>
              <div className="pb-artist truncate">
                {current.artist}
                {current.genre ? (
                  <span className="pb-dot">·</span>
                ) : null}
                {current.genre}
              </div>
            </div>
          </Link>

          {/* CENTER: scrubber + transport */}
          <div className="pb-center">
            <div className="pb-transport">
              <button
                type="button"
                onClick={toggle}
                className="pb-play"
                aria-label={playing ? "Pause" : "Play"}
              >
                {playing ? <Pause size={18} /> : <Play size={18} className="ml-[1px]" />}
              </button>
            </div>

            <div className="pb-scrub-row">
              <span className="pb-time tabular-nums">
                {formatDuration(currentTime)}
              </span>
              <div
                ref={scrubRef}
                className="pb-scrub"
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerLeave={() => setHoverT(null)}
                role="slider"
                aria-label="Seek"
                aria-valuemin={0}
                aria-valuemax={duration || 0}
                aria-valuenow={currentTime}
                tabIndex={0}
                onKeyDown={(e) => {
                  if (!duration) return;
                  if (e.key === "ArrowRight")
                    seek(Math.min(duration, currentTime + 5));
                  else if (e.key === "ArrowLeft")
                    seek(Math.max(0, currentTime - 5));
                }}
              >
                <div className="pb-scrub-track">
                  <div
                    className="pb-scrub-fill"
                    style={{ width: `${pct}%` }}
                  />
                  {hoverT !== null && duration > 0 && (
                    <div
                      className="pb-scrub-ghost"
                      style={{ width: `${(hoverT / duration) * 100}%` }}
                    />
                  )}
                  <div
                    className="pb-scrub-thumb"
                    style={{ left: `calc(${pct}% - 7px)` }}
                  />
                </div>
                {hoverT !== null && duration > 0 && (
                  <div
                    className="pb-scrub-tooltip"
                    style={{ left: `${(hoverT / duration) * 100}%` }}
                  >
                    {formatDuration(hoverT)}
                  </div>
                )}
              </div>
              <span className="pb-time tabular-nums pb-time-right">
                {formatDuration(duration)}
              </span>
            </div>
          </div>

          {/* RIGHT: volume + close */}
          <div className="pb-right">
            <button
              type="button"
              onClick={() => setMuted(!muted)}
              className="pb-icon-btn"
              aria-label={muted ? "Unmute" : "Mute"}
            >
              {muted || volume === 0 ? <VolumeX size={16} /> : <Volume2 size={16} />}
            </button>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={muted ? 0 : volume}
              onChange={(e) => setVolume(Number(e.target.value))}
              className="pb-volume"
              aria-label="Volume"
            />
            <button
              type="button"
              onClick={close}
              className="pb-icon-btn"
              aria-label="Close player"
            >
              <X size={16} />
            </button>
          </div>

          {current.isPreview && (
            <span className="pb-preview-badge">PREVIEW</span>
          )}
        </div>
      </div>
    </div>
  );
}
