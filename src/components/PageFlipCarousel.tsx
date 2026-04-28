"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { TrackWithGenre } from "@/types/db";

interface Props {
  tracks: TrackWithGenre[];
  supabaseUrl: string;
  locale: string;
  /** Auto-advance interval in ms, 0 to disable. */
  autoplay?: number;
}

/**
 * A 3D book-flip carousel of release covers. Click the right edge or use
 * the arrow buttons to flip forward; current page rotates -180° on the Y
 * axis while the next page rotates in. Centerpiece of the homepage.
 */
export function PageFlipCarousel({
  tracks,
  supabaseUrl,
  locale,
  autoplay = 6000,
}: Props) {
  const [index, setIndex] = useState(0);
  const [direction, setDirection] = useState<1 | -1>(1);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const len = tracks.length;

  const next = useCallback(() => {
    setDirection(1);
    setIndex((i) => (i + 1) % len);
  }, [len]);

  const prev = useCallback(() => {
    setDirection(-1);
    setIndex((i) => (i - 1 + len) % len);
  }, [len]);

  useEffect(() => {
    if (!autoplay || len < 2) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(next, autoplay);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [index, autoplay, next, len]);

  if (len === 0) return null;

  const cur = tracks[index];
  const cover = cur.cover_image_path && supabaseUrl
    ? `${supabaseUrl}/storage/v1/object/public/covers/${cur.cover_image_path}`
    : null;
  const genreName = cur.genre
    ? locale === "ru"
      ? cur.genre.name_ru
      : cur.genre.name_en
    : "";

  return (
    <div className="relative w-full">
      {/* The book */}
      <div
        className="relative w-full aspect-[4/5] sm:aspect-[3/4] mx-auto max-w-[520px]"
        style={{ perspective: 2000 }}
      >
        {/* Spine shadow */}
        <span
          aria-hidden
          className="pointer-events-none absolute inset-y-0 left-1/2 w-3 -translate-x-1/2 z-30"
          style={{
            background:
              "linear-gradient(90deg, transparent, rgba(0,0,0,0.55) 50%, transparent)",
            mixBlendMode: "multiply",
          }}
        />

        <AnimatePresence initial={false} mode="popLayout">
          <motion.div
            key={index}
            initial={{
              rotateY: direction === 1 ? 90 : -90,
              opacity: 0,
              scale: 0.95,
            }}
            animate={{ rotateY: 0, opacity: 1, scale: 1 }}
            exit={{
              rotateY: direction === 1 ? -90 : 90,
              opacity: 0,
              scale: 0.95,
            }}
            transition={{ duration: 0.85, ease: [0.22, 1, 0.36, 1] }}
            style={{
              transformStyle: "preserve-3d",
              transformOrigin: direction === 1 ? "left center" : "right center",
            }}
            className="absolute inset-0"
          >
            <Link
              href={`/${locale}/track/${cur.id}`}
              className="block w-full h-full rounded-3xl overflow-hidden ring-1 ring-white/10 shadow-[0_60px_120px_-40px_rgba(0,0,0,0.8)] relative"
            >
              {cover ? (
                <Image
                  src={cover}
                  alt={cur.title}
                  fill
                  sizes="(min-width: 768px) 50vw, 100vw"
                  className="object-cover"
                  priority={index < 2}
                />
              ) : (
                <div className="absolute inset-0 bg-gradient-to-br from-[var(--accent)]/40 via-[var(--accent-2)]/30 to-black" />
              )}
              {/* Gradient scrim */}
              <div className="absolute inset-0 bg-gradient-to-t from-black via-black/55 to-transparent" />
              {/* Page edge glints */}
              <span
                aria-hidden
                className="pointer-events-none absolute inset-y-0 right-0 w-px"
                style={{ background: "rgba(255,255,255,0.08)" }}
              />
              <span
                aria-hidden
                className="pointer-events-none absolute inset-y-0 right-1 w-px"
                style={{ background: "rgba(255,255,255,0.05)" }}
              />

              {/* Top bar — index + genre */}
              <div className="absolute top-4 left-4 right-4 flex items-center justify-between text-[11px] tracking-[0.18em] uppercase">
                <span className="font-display tabular-nums text-white/90">
                  {String(index + 1).padStart(2, "0")} / {String(len).padStart(2, "0")}
                </span>
                {genreName && (
                  <span className="px-2 py-1 rounded-full bg-white/10 backdrop-blur-sm text-white/85">
                    {genreName}
                  </span>
                )}
              </div>

              {/* Bottom — title + artist */}
              <div className="absolute bottom-5 left-5 right-5">
                <div className="font-display text-2xl md:text-3xl font-bold text-white tracking-tight leading-tight line-clamp-2">
                  {cur.title}
                </div>
                <div className="mt-1 text-sm text-white/80">{cur.artist}</div>
              </div>
            </Link>
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Controls */}
      <div className="mt-5 flex items-center justify-center gap-3">
        <button
          type="button"
          onClick={prev}
          aria-label="Previous"
          className="bs-button bs-button-ghost h-10 w-10 !p-0 rounded-full"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path
              d="M15 6l-6 6 6 6"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>

        <div className="flex items-center gap-1.5">
          {tracks.map((_, i) => (
            <button
              key={i}
              type="button"
              aria-label={`Go to slide ${i + 1}`}
              onClick={() => {
                setDirection(i > index ? 1 : -1);
                setIndex(i);
              }}
              className="h-1.5 rounded-full transition-all"
              style={{
                width: i === index ? 28 : 8,
                background:
                  i === index
                    ? "linear-gradient(90deg, var(--accent), var(--accent-2))"
                    : "rgba(255,255,255,0.2)",
                boxShadow:
                  i === index
                    ? "0 0 14px rgba(91,140,255,0.5)"
                    : "none",
              }}
            />
          ))}
        </div>

        <button
          type="button"
          onClick={next}
          aria-label="Next"
          className="bs-button bs-button-ghost h-10 w-10 !p-0 rounded-full"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
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
  );
}
