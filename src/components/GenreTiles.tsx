"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { useI18n } from "@/i18n/I18nProvider";
import type { Genre } from "@/types/db";

const PALETTE: Array<[string, string]> = [
  ["#5b8cff", "#7b49ff"], // blue → violet
  ["#ff7a00", "#ff3d6b"], // orange → pink
  ["#00d4ff", "#5b8cff"], // cyan → blue
  ["#ff3d6b", "#7b49ff"], // pink → violet
  ["#22c55e", "#00d4ff"], // green → cyan
  ["#ff7a00", "#ffd000"], // orange → yellow
  ["#7b49ff", "#ff3d6b"], // violet → pink
  ["#5b8cff", "#22c55e"], // blue → green
];

export function GenreTiles({ genres }: { genres: Genre[] }) {
  const { locale } = useI18n();
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
      {genres.slice(0, 8).map((g, i) => {
        const [c1, c2] = PALETTE[i % PALETTE.length];
        const name = locale === "ru" ? g.name_ru : g.name_en;
        return (
          <motion.div
            key={g.id}
            initial={{ opacity: 0, scale: 0.96 }}
            whileInView={{ opacity: 1, scale: 1 }}
            whileHover={{ scale: 1.03, y: -3 }}
            viewport={{ once: true, margin: "-40px" }}
            transition={{ duration: 0.5, delay: i * 0.05 }}
          >
            <Link
              href={`/${locale}/catalog?genre=${g.slug}`}
              className="relative block aspect-[5/3] rounded-2xl overflow-hidden p-4 ring-1 ring-white/10 hover:ring-white/30 transition"
              style={{ background: `linear-gradient(135deg, ${c1}, ${c2})` }}
            >
              <span
                aria-hidden
                className="absolute inset-0 mix-blend-overlay opacity-30"
                style={{
                  backgroundImage:
                    "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='240' height='240'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/></filter><rect width='100%25' height='100%25' filter='url(%23n)' opacity='0.7'/></svg>\")",
                }}
              />
              <span
                aria-hidden
                className="absolute -bottom-8 -right-6 text-[88px] leading-none font-display font-bold opacity-20 select-none"
                style={{ color: "rgba(255,255,255,0.85)" }}
              >
                {name.slice(0, 2).toUpperCase()}
              </span>
              <span className="relative z-10 font-display font-bold text-xl md:text-2xl tracking-tight text-white drop-shadow-[0_2px_8px_rgba(0,0,0,0.35)]">
                {name}
              </span>
            </Link>
          </motion.div>
        );
      })}
    </div>
  );
}
