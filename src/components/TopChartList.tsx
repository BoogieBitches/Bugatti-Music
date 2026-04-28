"use client";

import Link from "next/link";
import Image from "next/image";
import { motion } from "framer-motion";
import { useI18n } from "@/i18n/I18nProvider";
import type { TrackWithGenre } from "@/types/db";

interface Props {
  tracks: TrackWithGenre[];
  /** Base URL of the Supabase project, e.g. "https://xyz.supabase.co". */
  supabaseUrl: string;
}

export function TopChartList({ tracks, supabaseUrl }: Props) {
  const { locale, dict } = useI18n();

  return (
    <ol className="flex flex-col">
      {tracks.map((t, i) => {
        const cover =
          t.cover_image_path && supabaseUrl
            ? `${supabaseUrl}/storage/v1/object/public/covers/${t.cover_image_path}`
            : null;
        const genre = t.genre ? (locale === "ru" ? t.genre.name_ru : t.genre.name_en) : null;
        return (
          <motion.li
            key={t.id}
            initial={{ opacity: 0, y: 8 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-40px" }}
            transition={{ duration: 0.4, delay: i * 0.04 }}
          >
            <Link
              href={`/${locale}/track/${t.id}`}
              className="group flex items-center gap-4 px-3 py-3 rounded-xl border border-transparent hover:border-[var(--border)] hover:bg-white/[0.03] transition-colors"
            >
              <span
                className="font-display text-3xl md:text-4xl font-bold tabular-nums w-12 md:w-14 text-right"
                style={{
                  background:
                    i < 3
                      ? "linear-gradient(135deg, var(--accent), var(--accent-2))"
                      : "linear-gradient(180deg, rgba(255,255,255,0.65), rgba(255,255,255,0.18))",
                  WebkitBackgroundClip: "text",
                  backgroundClip: "text",
                  color: "transparent",
                }}
              >
                {String(i + 1).padStart(2, "0")}
              </span>
              <div className="relative w-12 h-12 rounded-lg overflow-hidden ring-1 ring-white/10 flex-shrink-0 bg-[var(--muted-2)]">
                {cover ? (
                  <Image
                    src={cover}
                    alt={t.title}
                    fill
                    sizes="48px"
                    className="object-cover transition-transform group-hover:scale-110"
                  />
                ) : (
                  <div className="w-full h-full bg-gradient-to-br from-[var(--accent)]/30 to-[var(--accent-2)]/20" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="font-display font-semibold truncate group-hover:text-[var(--accent-3)] transition-colors">
                  {t.title}
                </div>
                <div className="text-sm text-[var(--muted)] truncate">{t.artist}</div>
              </div>
              <div className="hidden sm:flex items-center gap-1.5">
                {genre && <span className="bs-badge">{genre}</span>}
                {t.bpm && (
                  <span className="bs-badge">
                    {t.bpm} {dict.track.bpm}
                  </span>
                )}
              </div>
              <span className="hidden md:inline text-sm text-[var(--muted)] tabular-nums">
                {t.plays_count.toLocaleString()} {dict.track.plays.toLowerCase()}
              </span>
            </Link>
          </motion.li>
        );
      })}
    </ol>
  );
}
