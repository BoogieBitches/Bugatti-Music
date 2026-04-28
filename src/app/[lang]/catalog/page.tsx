import { isLocale } from "@/i18n/config";
import { notFound } from "next/navigation";
import { getDictionary } from "@/i18n/dictionaries";
import { hasSupabaseEnv } from "@/lib/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";
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
        <div className="mt-10 bs-card p-6 text-[var(--muted)]">{dict.catalog.noResults}</div>
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
