"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";
import type { Genre } from "@/types/db";
import type { Dictionary } from "@/i18n/dictionaries";
import type { Locale } from "@/i18n/config";

interface Props {
  locale: Locale;
  dict: Dictionary;
  genres: Genre[];
  initial: {
    q: string;
    genreSlug: string;
    minBpm: number | undefined;
    maxBpm: number | undefined;
    sort: "newest" | "popular";
  };
}

export function CatalogFilters({ locale, dict, genres, initial }: Props) {
  const router = useRouter();
  const sp = useSearchParams();
  const [q, setQ] = useState(initial.q);
  const [genre, setGenre] = useState(initial.genreSlug);
  const [min, setMin] = useState(initial.minBpm?.toString() ?? "");
  const [max, setMax] = useState(initial.maxBpm?.toString() ?? "");
  const [sort, setSort] = useState(initial.sort);

  function apply(e?: FormEvent) {
    e?.preventDefault();
    const params = new URLSearchParams(sp?.toString());
    set(params, "q", q);
    set(params, "genre", genre);
    set(params, "min", min);
    set(params, "max", max);
    set(params, "sort", sort);
    router.push(`/${locale}/catalog?${params.toString()}`);
  }

  function reset() {
    setQ("");
    setGenre("");
    setMin("");
    setMax("");
    setSort("newest");
    router.push(`/${locale}/catalog`);
  }

  return (
    <form onSubmit={apply} className="bs-card p-4 flex flex-wrap items-center gap-2">
      <input
        type="search"
        className="bs-input flex-1 min-w-[180px]"
        placeholder={dict.catalog.filters.search}
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
      <select
        className="bs-input max-w-[180px]"
        value={genre}
        onChange={(e) => setGenre(e.target.value)}
      >
        <option value="">{dict.catalog.filters.all}</option>
        {genres.map((g) => (
          <option key={g.id} value={g.slug}>
            {locale === "ru" ? g.name_ru : g.name_en}
          </option>
        ))}
      </select>
      <input
        type="number"
        className="bs-input w-24"
        placeholder={dict.catalog.filters.minBpm}
        value={min}
        onChange={(e) => setMin(e.target.value)}
      />
      <input
        type="number"
        className="bs-input w-24"
        placeholder={dict.catalog.filters.maxBpm}
        value={max}
        onChange={(e) => setMax(e.target.value)}
      />
      <select
        className="bs-input max-w-[160px]"
        value={sort}
        onChange={(e) => setSort(e.target.value as "newest" | "popular")}
      >
        <option value="newest">{dict.catalog.sort.newest}</option>
        <option value="popular">{dict.catalog.sort.popular}</option>
      </select>
      <button type="submit" className="bs-button bs-button-primary">
        {dict.common.search}
      </button>
      <button type="button" onClick={reset} className="bs-button">
        {dict.catalog.filters.reset}
      </button>
    </form>
  );
}

function set(p: URLSearchParams, key: string, value: string) {
  if (value && value.length > 0) p.set(key, value);
  else p.delete(key);
}
