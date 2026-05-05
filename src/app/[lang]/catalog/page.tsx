import { isLocale } from "@/i18n/config";
import { notFound } from "next/navigation";
import { getDictionary } from "@/i18n/dictionaries";
import { hasSupabaseEnv } from "@/lib/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import Link from "next/link";
import { TrackCard } from "@/components/TrackCard";
import { CatalogFilters } from "@/components/CatalogFilters";
import type { Genre, TrackWithGenre } from "@/types/db";

export default async function CatalogPage({
  params,
  searchParams,
}: PageProps<"/[lang]/catalog">) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();
  const sp = await searchParams;
  const dict = await getDictionary(lang);

  const q = typeof sp.q === "string" ? sp.q.trim() : "";
  const genreSlug = typeof sp.genre === "string" ? sp.genre : "";
  const minBpm = typeof sp.min === "string" ? Number(sp.min) || undefined : undefined;
  const maxBpm = typeof sp.max === "string" ? Number(sp.max) || undefined : undefined;
  const sort = sp.sort === "popular" ? "popular" : "newest";

  let genres: Genre[] = [];
  let tracks: TrackWithGenre[] = [];
  let configured = false;

  if (hasSupabaseEnv()) {
    configured = true;
    try {
      const supabase = await createSupabaseServerClient();
      const { data: g } = await supabase.from("genres").select("*").order("position");
      genres = (g ?? []) as Genre[];

      let query = supabase
        .from("tracks")
        .select(
          "*, genre:genres(id, slug, name_en, name_ru), uploader:profiles!tracks_uploader_id_fkey(id, full_name, avatar_url)",
        )
        .eq("status", "approved")
        .limit(60);

      if (q) {
        query = query.or(
          `title.ilike.%${q}%,artist.ilike.%${q}%,style.ilike.%${q}%`,
        );
      }
      if (genreSlug) {
        const g = genres.find((x) => x.slug === genreSlug);
        if (g) query = query.eq("genre_id", g.id);
      }
      if (minBpm) query = query.gte("bpm", minBpm);
      if (maxBpm) query = query.lte("bpm", maxBpm);
      if (sort === "popular") query = query.order("plays_count", { ascending: false });
      else query = query.order("created_at", { ascending: false });

      const { data: t } = await query;
      tracks = (t ?? []) as TrackWithGenre[];
    } catch {
      configured = false;
    }
  }

  // Resolve public URLs for the rendered cards.
  const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const publicCover = (p: string | null) =>
    p && baseUrl ? `${baseUrl}/storage/v1/object/public/covers/${p}` : null;
  const publicPreview = (p: string | null) =>
    p && baseUrl ? `${baseUrl}/storage/v1/object/public/audio-previews/${p}` : null;

  return (
    <div className="max-w-6xl mx-auto px-4 py-10">
      <div className="flex items-end justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight">{dict.catalog.title}</h1>
          <p className="text-[var(--muted)] mt-1">{dict.brand.tagline}</p>
        </div>
      </div>

      <div className="mt-6">
        <CatalogFilters
          locale={lang}
          dict={dict}
          genres={genres}
          initial={{ q, genreSlug, minBpm, maxBpm, sort }}
        />
      </div>

      {!configured && (
        <div className="mt-10 bs-card p-6 text-sm text-[var(--muted)]">
          Supabase is not configured yet. Add <code>NEXT_PUBLIC_SUPABASE_URL</code> and{" "}
          <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code> to your environment to load real tracks.
        </div>
      )}

      {configured && tracks.length === 0 && (
        <section className="mt-12 relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-[#0e0e12] via-[#17121b] to-[#0e0e12] px-6 py-16 md:px-14 md:py-24">
          <div
            aria-hidden
            className="absolute inset-0 -z-[1]"
            style={{
              background:
                "radial-gradient(60% 60% at 20% 10%, rgba(255,122,0,0.14), transparent 70%), radial-gradient(50% 50% at 90% 90%, rgba(91,140,255,0.18), transparent 70%)",
            }}
          />
          <div className="max-w-2xl">
            <div className="text-[11px] tracking-[0.28em] uppercase text-[var(--accent-3)] mb-4">
              {lang === "ru" ? "Старт пула" : "Pool opening"}
            </div>
            <h2 className="font-display text-3xl md:text-5xl font-bold tracking-tight text-white leading-[1.02]">
              {dict.catalog.emptyTitle}
            </h2>
            <p className="mt-5 text-[var(--muted)] text-base md:text-lg max-w-xl">
              {dict.catalog.emptyBody}
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href={`/${lang}/upload`} className="bs-button bs-button-primary text-base">
                {dict.catalog.emptyCta} →
              </Link>
              <Link href={`/${lang}/pricing`} className="bs-button text-base">
                {dict.catalog.emptySecondary}
              </Link>
            </div>
          </div>
        </section>
      )}

      {tracks.length > 0 && (
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {tracks.map((t) => (
            <TrackCard
              key={t.id}
              track={t}
              previewUrl={publicPreview(t.preview_path)}
              imageUrl={publicCover(t.cover_image_path)}
              videoUrl={publicCover(t.cover_video_path)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
