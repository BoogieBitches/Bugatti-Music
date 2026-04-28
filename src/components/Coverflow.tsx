"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { TrackWithGenre } from "@/types/db";
import { TextReveal } from "./TextReveal";

interface Props {
  tracks: TrackWithGenre[];
  supabaseUrl: string;
  locale: string;
  /** Auto-advance interval in ms; 0 to disable. */
  autoplay?: number;
}

/**
 * BPM-Supreme-style 3D coverflow carousel: shows 7 covers at once with the
 * center cover frontal and side covers rotated outward in 3D perspective.
 * Auto-advances every few seconds; the genre and track name beneath the
 * carousel re-animate on each step.
 */
export function Coverflow({
  tracks,
  supabaseUrl,
  locale,
  autoplay = 4500,
}: Props) {
  const [index, setIndex] = useState(0);
  const len = tracks.length;
  // Clamp into valid range — `tracks` may shrink between renders (e.g. locale
  // switch with a different fallback list), and a stale `index` would
  // otherwise point past the end of the array.
  const safeIndex = len > 0 ? ((index % len) + len) % len : 0;

  const next = useCallback(
    () => setIndex((i) => (i + 1) % len),
    [len],
  );
  const prev = useCallback(
    () => setIndex((i) => (i - 1 + len) % len),
    [len],
  );

  useEffect(() => {
    if (!autoplay || len < 2) return;
    const id = window.setTimeout(next, autoplay);
    return () => window.clearTimeout(id);
  }, [index, autoplay, next, len]);

  if (len === 0) return null;

  // Visible window: -3..+3 around the active index (7 covers total).
  const VISIBLE = [-3, -2, -1, 0, 1, 2, 3] as const;
  const cur = tracks[safeIndex];
  const genreName = cur.genre
    ? locale === "ru"
      ? cur.genre.name_ru
      : cur.genre.name_en
    : "";

  return (
    <section className="relative">
      {/* The 3D stage */}
      <div
        className="relative mx-auto h-[460px] sm:h-[520px] md:h-[580px]"
        style={{ perspective: 2000, perspectiveOrigin: "50% 50%" }}
      >
        <div
          className="absolute inset-0"
          style={{ transformStyle: "preserve-3d" }}
        >
          {VISIBLE.map((offset) => {
            // Proper modulo: JS `%` preserves sign of the dividend, so when
            // `len < 3` `(safeIndex + offset + len)` can still be negative.
            const slot = (((safeIndex + offset) % len) + len) % len;
            const t = tracks[slot];
            const cover =
              t.cover_image_path && supabaseUrl
                ? `${supabaseUrl}/storage/v1/object/public/covers/${t.cover_image_path}`
                : null;

            // Layout per offset.
            const abs = Math.abs(offset);
            const xPct = offset * 28; // horizontal stagger %
            const rotY = -offset * 32; // rotate sides outward
            const scale = abs === 0 ? 1 : abs === 1 ? 0.85 : abs === 2 ? 0.7 : 0.55;
            const zPx = -abs * 100;
            const opacity = abs === 0 ? 1 : abs === 1 ? 0.95 : abs === 2 ? 0.7 : 0.35;
            const z = 100 - abs;

            return (
              <motion.div
                key={`${slot}-${offset}`}
                className="absolute left-1/2 top-1/2 w-[260px] sm:w-[300px] md:w-[340px] aspect-square -translate-x-1/2 -translate-y-1/2"
                initial={false}
                animate={{
                  x: `${xPct}%`,
                  rotateY: rotY,
                  scale,
                  z: zPx,
                  opacity,
                }}
                transition={{
                  duration: 0.85,
                  ease: [0.22, 1, 0.36, 1],
                }}
                style={{
                  transformStyle: "preserve-3d",
                  zIndex: z,
                  pointerEvents: abs === 0 ? "auto" : "none",
                }}
              >
                <Link
                  href={`/${locale}/track/${t.id}`}
                  className="block w-full h-full rounded-2xl overflow-hidden ring-1 ring-white/10 shadow-[0_60px_100px_-30px_rgba(0,0,0,0.7)] relative"
                  style={{
                    backfaceVisibility: "hidden",
                  }}
                >
                  {cover ? (
                    <Image
                      src={cover}
                      alt={t.title}
                      fill
                      sizes="340px"
                      className="object-cover"
                      priority={abs <= 1}
                    />
                  ) : (
                    <div className="absolute inset-0 bg-gradient-to-br from-[var(--accent)]/40 via-[var(--accent-2)]/30 to-black" />
                  )}
                  {/* Side dim */}
                  {abs > 0 && (
                    <div
                      aria-hidden
                      className="absolute inset-0"
                      style={{
                        background:
                          offset < 0
                            ? "linear-gradient(90deg, rgba(0,0,0,0.55), rgba(0,0,0,0.05))"
                            : "linear-gradient(270deg, rgba(0,0,0,0.55), rgba(0,0,0,0.05))",
                      }}
                    />
                  )}
                </Link>
              </motion.div>
            );
          })}
        </div>

        {/* Click zones — tap left/right to advance */}
        <button
          type="button"
          onClick={prev}
          aria-label="Previous"
          className="absolute inset-y-0 left-0 w-1/4 z-50 cursor-w-resize"
        />
        <button
          type="button"
          onClick={next}
          aria-label="Next"
          className="absolute inset-y-0 right-0 w-1/4 z-50 cursor-e-resize"
        />
      </div>

      {/* Caption — genre + track */}
      <div className="mt-6 grid md:grid-cols-12 gap-6 items-end">
        <div className="md:col-span-1 text-[11px] tracking-[0.28em] uppercase text-white/60 font-display tabular-nums">
          {String(safeIndex + 1).padStart(2, "0")} / {String(len).padStart(2, "0")}
        </div>
        <div className="md:col-span-7">
          <AnimatePresence mode="wait">
            <motion.div
              key={`label-${safeIndex}`}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
            >
              {genreName && (
                <div className="font-display text-2xl md:text-3xl font-bold tracking-tight text-white">
                  <TextReveal text={genreName} stagger={0.025} trigger="mount" />
                </div>
              )}
              <div className="mt-1 text-base md:text-lg text-[var(--muted)]">
                <TextReveal
                  text={`${cur.title} — ${cur.artist}`}
                  stagger={0.012}
                  trigger="mount"
                />
              </div>
            </motion.div>
          </AnimatePresence>
        </div>
        <div className="md:col-span-4 flex md:justify-end items-center gap-3">
          <button
            type="button"
            onClick={prev}
            aria-label="Previous"
            className="bs-button bs-button-ghost h-10 w-10 !p-0 rounded-full"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path
                d="M15 6l-6 6 6 6"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
          <button
            type="button"
            onClick={next}
            aria-label="Next"
            className="bs-button bs-button-ghost h-10 w-10 !p-0 rounded-full"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path
                d="M9 6l6 6-6 6"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        </div>
      </div>
    </section>
  );
}
