import Link from "next/link";
import Image from "next/image";
import { getDictionary } from "@/i18n/dictionaries";
import { isLocale } from "@/i18n/config";
import { notFound } from "next/navigation";
import { hasSupabaseEnv } from "@/lib/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Genre, TrackWithGenre } from "@/types/db";
import { Hero3D } from "@/components/Hero3D";
import { TrackCard } from "@/components/TrackCard";
import { TopChartList } from "@/components/TopChartList";
import { GenreTiles } from "@/components/GenreTiles";
import { Marquee } from "@/components/Marquee";
import { RevealOnScroll } from "@/components/RevealOnScroll";

export default async function HomePage({ params }: PageProps<"/[lang]">) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();
  const dict = await getDictionary(lang);
  const lp = `/${lang}`;

  let genres: Genre[] = [];
  let topTracks: TrackWithGenre[] = [];
  let newTracks: TrackWithGenre[] = [];
  let approvedCount = 0;

  if (hasSupabaseEnv()) {
    try {
      const supabase = await createSupabaseServerClient();
      const [{ data: g }, { data: top }, { data: fresh }, { count }] =
        await Promise.all([
          supabase.from("genres").select("*").order("position"),
          supabase
            .from("tracks")
            .select(
              "*, genre:genres(id, slug, name_en, name_ru), uploader:profiles!tracks_uploader_id_fkey(id, full_name, avatar_url)",
            )
            .eq("status", "approved")
            .order("plays_count", { ascending: false })
            .limit(8),
          supabase
            .from("tracks")
            .select(
              "*, genre:genres(id, slug, name_en, name_ru), uploader:profiles!tracks_uploader_id_fkey(id, full_name, avatar_url)",
            )
            .eq("status", "approved")
            .order("created_at", { ascending: false })
            .limit(6),
          supabase
            .from("tracks")
            .select("id", { count: "exact", head: true })
            .eq("status", "approved"),
        ]);
      genres = (g ?? []) as Genre[];
      topTracks = (top ?? []) as TrackWithGenre[];
      newTracks = (fresh ?? []) as TrackWithGenre[];
      approvedCount = count ?? 0;
    } catch {
      // ignore — render anonymous home
    }
  }

  const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const publicCover = (p: string | null) =>
    p && baseUrl ? `${baseUrl}/storage/v1/object/public/covers/${p}` : null;
  const publicPreview = (p: string | null) =>
    p && baseUrl ? `${baseUrl}/storage/v1/object/public/audio-previews/${p}` : null;

  const featured = topTracks[0];
  const featuredCover = featured ? publicCover(featured.cover_image_path) : null;

  const marqueeItems = [
    "HIP-HOP",
    "AFRO HOUSE",
    "TECH HOUSE",
    "REGGAETON",
    "DRILL",
    "AMAPIANO",
    "PHONK",
    "TRAP",
    "BASS HOUSE",
    "R&B",
    "EDM",
    "LATIN",
  ];

  return (
    <div>
      {/* HERO */}
      <section className="relative">
        <div className="max-w-7xl mx-auto px-4 pt-10 md:pt-16 pb-10 md:pb-16">
          <div className="grid md:grid-cols-12 gap-10 items-center">
            <div className="md:col-span-7">
              <span className="bs-badge bs-badge-premium">
                {dict.brand.name}
              </span>
              <h1 className="mt-5 font-display text-[44px] sm:text-6xl md:text-7xl lg:text-[88px] leading-[0.95] font-bold tracking-tighter">
                <span className="bs-text-gradient">{dict.home.hero.title}</span>
              </h1>
              <p className="mt-6 text-[var(--muted)] text-lg md:text-xl max-w-xl">
                {dict.home.hero.subtitle}
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link href={`${lp}/catalog`} className="bs-button bs-button-primary text-base">
                  {dict.home.hero.ctaBrowse}
                </Link>
                <Link href={`${lp}/signup`} className="bs-button bs-button-ghost text-base">
                  {dict.home.hero.ctaJoin}
                </Link>
              </div>
              <div className="mt-10 flex items-center gap-6 text-sm text-[var(--muted)]">
                <div>
                  <div className="font-display text-2xl text-white tabular-nums">
                    {approvedCount > 0 ? approvedCount.toLocaleString() : "—"}
                  </div>
                  <div>{lang === "ru" ? "треков в каталоге" : "tracks in pool"}</div>
                </div>
                <div className="w-px h-10 bg-[var(--border)]" />
                <div>
                  <div className="font-display text-2xl text-white tabular-nums">
                    {genres.length > 0 ? genres.length : "—"}
                  </div>
                  <div>{lang === "ru" ? "жанров" : "genres"}</div>
                </div>
                <div className="hidden sm:block w-px h-10 bg-[var(--border)]" />
                <div className="hidden sm:block">
                  <div className="font-display text-2xl text-white">24/7</div>
                  <div>{lang === "ru" ? "свежие релизы" : "fresh drops"}</div>
                </div>
              </div>
            </div>
            <div className="md:col-span-5">
              <Hero3D />
            </div>
          </div>
        </div>
      </section>

      {/* MARQUEE */}
      <section className="border-y border-[var(--border)] bg-black/20 backdrop-blur-sm">
        <Marquee items={marqueeItems} speed={45} />
      </section>

      {/* FEATURED + TOP CHART */}
      {topTracks.length > 0 && (
        <section className="max-w-7xl mx-auto px-4 py-16 md:py-20">
          <RevealOnScroll>
            <div className="flex items-end justify-between flex-wrap gap-4 mb-8">
              <div>
                <div className="text-xs uppercase tracking-[0.2em] text-[var(--accent-3)]">
                  {lang === "ru" ? "Чарт недели" : "Weekly Chart"}
                </div>
                <h2 className="mt-2 font-display text-3xl md:text-5xl font-bold tracking-tighter">
                  {lang === "ru" ? "Самые горячие треки" : "Top tracks right now"}
                </h2>
              </div>
              <Link
                href={`${lp}/catalog?sort=popular`}
                className="bs-button bs-button-ghost"
              >
                {lang === "ru" ? "Весь чарт" : "View all"} →
              </Link>
            </div>
          </RevealOnScroll>

          <div className="grid lg:grid-cols-12 gap-6">
            {/* Featured */}
            {featured && (
              <RevealOnScroll className="lg:col-span-5" delay={0.1}>
                <Link
                  href={`${lp}/track/${featured.id}`}
                  className="bs-card bs-card-glow group relative block aspect-[4/5] lg:aspect-auto lg:h-full overflow-hidden p-0"
                >
                  {featuredCover ? (
                    <Image
                      src={featuredCover}
                      alt={featured.title}
                      fill
                      sizes="(min-width: 1024px) 40vw, 100vw"
                      className="object-cover transition-transform duration-700 group-hover:scale-105"
                    />
                  ) : (
                    <div className="absolute inset-0 bg-gradient-to-br from-[var(--accent)]/40 via-[var(--accent-2)]/30 to-black" />
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-black via-black/60 to-transparent" />
                  <div className="absolute top-4 left-4 flex gap-1.5">
                    <span className="bs-badge bs-badge-premium">#1</span>
                    {featured.is_premium_only && (
                      <span className="bs-badge bs-badge-premium">
                        {dict.common.premiumBadge}
                      </span>
                    )}
                  </div>
                  <div className="absolute bottom-0 left-0 right-0 p-6 md:p-8">
                    <div className="text-xs uppercase tracking-widest text-[var(--accent-3)] mb-2">
                      {lang === "ru" ? "Релиз дня" : "Today's pick"}
                    </div>
                    <h3 className="font-display text-3xl md:text-4xl font-bold tracking-tight">
                      {featured.title}
                    </h3>
                    <p className="text-[var(--muted)] mt-1 text-lg">{featured.artist}</p>
                    <div className="mt-4 flex flex-wrap gap-1.5">
                      {featured.genre && (
                        <span className="bs-badge">
                          {lang === "ru" ? featured.genre.name_ru : featured.genre.name_en}
                        </span>
                      )}
                      {featured.bpm && (
                        <span className="bs-badge">
                          {featured.bpm} {dict.track.bpm}
                        </span>
                      )}
                      {featured.music_key && (
                        <span className="bs-badge">{featured.music_key}</span>
                      )}
                    </div>
                  </div>
                </Link>
              </RevealOnScroll>
            )}

            {/* Chart list */}
            <RevealOnScroll className="lg:col-span-7" delay={0.15}>
              <div className="bs-glass p-3 md:p-4 h-full">
                <TopChartList
                  tracks={topTracks.slice(0, 8)}
                  supabaseUrl={baseUrl}
                />
              </div>
            </RevealOnScroll>
          </div>
        </section>
      )}

      {/* GENRES */}
      {genres.length > 0 && (
        <section className="max-w-7xl mx-auto px-4 py-12 md:py-16">
          <RevealOnScroll>
            <div className="flex items-end justify-between flex-wrap gap-4 mb-8">
              <div>
                <div className="text-xs uppercase tracking-[0.2em] text-[var(--accent-3)]">
                  {lang === "ru" ? "Жанры" : "Genres"}
                </div>
                <h2 className="mt-2 font-display text-3xl md:text-5xl font-bold tracking-tighter">
                  {lang === "ru" ? "Найди свой звук" : "Find your sound"}
                </h2>
              </div>
            </div>
          </RevealOnScroll>
          <RevealOnScroll delay={0.1}>
            <GenreTiles genres={genres} />
          </RevealOnScroll>
        </section>
      )}

      {/* NEW RELEASES */}
      {newTracks.length > 0 && (
        <section className="max-w-7xl mx-auto px-4 py-12 md:py-16">
          <RevealOnScroll>
            <div className="flex items-end justify-between flex-wrap gap-4 mb-8">
              <div>
                <div className="text-xs uppercase tracking-[0.2em] text-[var(--accent-3)]">
                  {lang === "ru" ? "Новинки" : "New releases"}
                </div>
                <h2 className="mt-2 font-display text-3xl md:text-5xl font-bold tracking-tighter">
                  {lang === "ru" ? "Свежие дропы" : "Fresh drops"}
                </h2>
              </div>
              <Link href={`${lp}/catalog`} className="bs-button bs-button-ghost">
                {lang === "ru" ? "Открыть каталог" : "Open catalog"} →
              </Link>
            </div>
          </RevealOnScroll>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {newTracks.map((t) => (
              <TrackCard
                key={t.id}
                track={t}
                previewUrl={publicPreview(t.preview_path)}
                imageUrl={publicCover(t.cover_image_path)}
                videoUrl={publicCover(t.cover_video_path)}
              />
            ))}
          </div>
        </section>
      )}

      {/* FEATURES */}
      <section className="max-w-7xl mx-auto px-4 py-16 md:py-24">
        <RevealOnScroll>
          <div className="text-center max-w-2xl mx-auto">
            <div className="text-xs uppercase tracking-[0.2em] text-[var(--accent-3)]">
              {lang === "ru" ? "Возможности" : "Features"}
            </div>
            <h2 className="mt-2 font-display text-3xl md:text-5xl font-bold tracking-tighter">
              {dict.home.features.title}
            </h2>
          </div>
        </RevealOnScroll>
        <div className="mt-12 grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {dict.home.features.items.map((item, i) => (
            <RevealOnScroll key={i} delay={i * 0.05}>
              <div className="bs-card bs-card-glow p-6 h-full">
                <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-[var(--accent)] to-[var(--accent-2)] shadow-[0_8px_24px_-8px_rgba(91,140,255,0.6)]" />
                <h3 className="mt-5 font-display font-semibold text-lg">{item.title}</h3>
                <p className="mt-1.5 text-sm text-[var(--muted)] leading-relaxed">
                  {item.body}
                </p>
              </div>
            </RevealOnScroll>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="max-w-7xl mx-auto px-4 pb-20">
        <RevealOnScroll>
          <div className="relative overflow-hidden rounded-3xl border border-[var(--border)] p-8 md:p-14 text-center">
            <div
              aria-hidden
              className="absolute inset-0 -z-10"
              style={{
                background:
                  "radial-gradient(60% 60% at 50% 0%, rgba(91,140,255,0.35), transparent 60%), radial-gradient(60% 60% at 50% 100%, rgba(255,122,0,0.25), transparent 60%)",
              }}
            />
            <h2 className="font-display text-3xl md:text-5xl font-bold tracking-tighter">
              {lang === "ru" ? "Готов поднять сет на новый уровень?" : "Ready to elevate your set?"}
            </h2>
            <p className="mt-3 text-[var(--muted)] max-w-xl mx-auto">
              {lang === "ru"
                ? "Присоединяйся бесплатно. Скачивай безлимитно с Premium."
                : "Join free. Download unlimited with Premium."}
            </p>
            <div className="mt-6 flex flex-wrap justify-center gap-3">
              <Link href={`${lp}/signup`} className="bs-button bs-button-primary text-base">
                {dict.home.hero.ctaJoin}
              </Link>
              <Link href={`${lp}/pricing`} className="bs-button bs-button-ghost text-base">
                {dict.nav.pricing}
              </Link>
            </div>
          </div>
        </RevealOnScroll>
      </section>
    </div>
  );
}
