"use client";

import { useRouter } from "next/navigation";
import { useI18n } from "@/i18n/I18nProvider";
import type { Genre } from "@/types/db";
import { DrumPad } from "./DrumPad";

/** Per-genre LED palette — falls back to the brand cyan. */
const COLOR_BY_SLUG: Record<string, string> = {
  "hip-hop": "#ff7a00",
  hiphop: "#ff7a00",
  rap: "#ff7a00",
  trap: "#ff3d6b",
  drill: "#ff3d6b",
  phonk: "#7b49ff",
  rnb: "#ff3d6b",
  "r-n-b": "#ff3d6b",
  reggaeton: "#ff3d6b",
  latin: "#ffd000",
  amapiano: "#22c55e",
  afro: "#22c55e",
  "afro-house": "#22c55e",
  house: "#5b8cff",
  "tech-house": "#00d4ff",
  "deep-house": "#5b8cff",
  techno: "#7b49ff",
  edm: "#ff7a00",
  bass: "#5b8cff",
  "bass-house": "#5b8cff",
  "drum-and-bass": "#00d4ff",
  dnb: "#00d4ff",
  dubstep: "#7b49ff",
  pop: "#ff3d6b",
  rock: "#ffffff",
  electronic: "#5b8cff",
};

const FALLBACK_PALETTE = [
  "#5b8cff",
  "#ff7a00",
  "#ff3d6b",
  "#7b49ff",
  "#00d4ff",
  "#22c55e",
  "#ffd000",
  "#b6e1ff",
];

export function GenreTiles({ genres }: { genres: Genre[] }) {
  const { locale } = useI18n();
  const router = useRouter();
  const list = genres.slice(0, 8);

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 md:gap-4">
      {list.map((g, i) => {
        const name = locale === "ru" ? g.name_ru : g.name_en;
        const color =
          COLOR_BY_SLUG[g.slug.toLowerCase()] ??
          FALLBACK_PALETTE[i % FALLBACK_PALETTE.length];
        return (
          <DrumPad
            key={g.id}
            color={color}
            label={name}
            caption={`PAD ${String(i + 1).padStart(2, "0")}`}
            ariaLabel={locale === "ru" ? `Открыть ${name}` : `Browse ${name}`}
            onClick={() =>
              router.push(`/${locale}/catalog?genre=${g.slug}`)
            }
          />
        );
      })}
    </div>
  );
}
