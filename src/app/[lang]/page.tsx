import Link from "next/link";
import Image from "next/image";
import { getDictionary } from "@/i18n/dictionaries";
import { isLocale } from "@/i18n/config";
import { notFound } from "next/navigation";
import { hasSupabaseEnv } from "@/lib/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Genre, TrackWithGenre } from "@/types/db";
import { PageFlipCarousel } from "@/components/PageFlipCarousel";
import { GraffitiTitle } from "@/components/GraffitiTitle";
import { SectionHeader } from "@/components/SectionHeader";
import { TextReveal } from "@/components/TextReveal";
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
      {/* HERO — BPM-Supreme-style massive lowercase title */}
      <section className="relative overflow-hidden">
        {/* Faint graffiti backdrop */}
        <div className="absolute inset-0 -z-[1] flex items-end justify-end opacity-25 pointer-events-none">
          <GraffitiTitle
            lines={["BUGATTI"]}
            className="relative w-[120%] -mr-[10%] mb-[-8%]"
          />
        </div>
        <div
          aria-hidden
          className="absolute inset-0 -z-[1]"
          style={{
            background:
              "radial-gradient(60% 60% at 50% 50%, rgba(5,6,8,0.55), transparent 70%)",
          }}
        />

        <div className="relative max-w-[1400px] mx-auto px-5 md:px-10 pt-10 md:pt-16 pb-10 md:pb-16">
          {/* Massive display title — fills width like BPM */}
          <h1
            className="font-display font-bold leading-[0.86] tracking-[-0.04em] lowercase"
            style={{ fontSize: "clamp(72px, 14vw, 220px)" }}
          >
            <span className="bs-text-gradient">
              <TextReveal text={lang === "ru" ? "bugatti sound" : "bugatti sound"} stagger={0.035} />
            </span>
          </h1>

          {/* 3-column caption row + CTA on the right */}
          <div className="mt-8 md:mt-10 grid md:grid-cols-12 gap-6 md:gap-8">
            <div className="md:col-span-3">
              <p className="font-display text-[15px] md:text-base font-semibold text-white leading-snug">
                {lang === "ru"
                  ? "Подними свой DJ-сет на новый уровень"
                  : "Level up your DJ set with Bugatti Sound."}
              </p>
            </div>
            <div className="md:col-span-3">
              <p className="font-display text-[15px] md:text-base font-semibold text-white leading-snug">
                {lang === "ru"
                  ? `${approvedCount > 0 ? approvedCount.toLocaleString() : "1000+"} треков от лучших продюсеров`
                  : `${approvedCount > 0 ? approvedCount.toLocaleString() : "1000+"} tracks from top producers worldwide.`}
              </p>
            </div>
            <div className="md:col-span-3">
              <p className="font-display text-[15px] md:text-base font-semibold text-white leading-snug">
                {lang === "ru"
                  ? "Мгновенное скачивание, эксклюзивы и релизы каждую неделю."
                  : "Instant downloads, exclusives & weekly fresh drops."}
              </p>
            </div>
            <div className="md:col-span-3 flex md:justify-end items-start">
              <Link
                href={`${lp}/signup`}
                className="group inline-flex items-center gap-2 font-display text-sm font-semibold tracking-[0.18em] uppercase"
              >
                <span>{lang === "ru" ? "Начать" : "Get Started"}</span>
                <span
                  aria-hidden
                  className="inline-block transition-transform group-hover:translate-x-1"
                >
                  →
                </span>
              </Link>
            </div>
          </div>

          {/* Page-flip carousel + CTAs / stats */}
          <div className="mt-14 md:mt-20 grid md:grid-cols-12 gap-10 md:gap-14 items-center">
            <div className="md:col-span-6 order-2 md:order-1">
              <div className="text-[11px] uppercase tracking-[0.28em] text-[var(--accent-3)]">
                {lang === "ru" ? "Новые релизы" : "New Releases"}
              </div>
              <h2 className="mt-3 font-display text-3xl md:text-5xl font-bold tracking-tighter leading-[0.95]">
                <TextReveal
                  text={
                    lang === "ru"
                      ? "Листай свежую музыку как книгу"
                      : "Flip through fresh music like a book"
                  }
                  stagger={0.018}
                />
              </h2>
              <p className="mt-5 text-[var(--muted)] text-base md:text-lg max-w-md">
                {lang === "ru"
                  ? "Каждая обложка — отдельный релиз. Нажми, чтобы послушать или скачать."
                  : "Each cover is a release. Tap to preview or download in one click."}
              </p>
              <div className="mt-7 flex flex-wrap gap-3">
                <Link href={`${lp}/catalog`} className="bs-button bs-button-primary text-base">
                  {dict.home.hero.ctaBrowse}
                </Link>
                <Link href={`${lp}/pricing`} className="bs-button bs-button-ghost text-base">
                  {dict.nav.pricing}
                </Link>
              </div>
              <div className="mt-10 grid grid-cols-3 gap-4 max-w-md">
                <div>
                  <div className="font-display text-3xl text-white tabular-nums leading-none">
                    {approvedCount > 0 ? approvedCount.toLocaleString() : "—"}
                  </div>
                  <div className="mt-2 text-[11px] uppercase tracking-[0.18em] text-[var(--muted)]">
                    {lang === "ru" ? "треков" : "tracks"}
                  </div>
                </div>
                <div>
                  <div className="font-display text-3xl text-white tabular-nums leading-none">
                    {genres.length > 0 ? genres.length : "—"}
                  </div>
                  <div className="mt-2 text-[11px] uppercase tracking-[0.18em] text-[var(--muted)]">
                    {lang === "ru" ? "жанров" : "genres"}
                  </div>
                </div>
                <div>
                  <div className="font-display text-3xl text-white leading-none">24/7</div>
                  <div className="mt-2 text-[11px] uppercase tracking-[0.18em] text-[var(--muted)]">
                    {lang === "ru" ? "дропы" : "drops"}
                  </div>
                </div>
              </div>
            </div>
            <div className="md:col-span-6 order-1 md:order-2">
              {newTracks.length > 0 ? (
                <PageFlipCarousel
                  tracks={newTracks}
                  supabaseUrl={baseUrl}
                  locale={lang}
                />
              ) : topTracks.length > 0 ? (
                <PageFlipCarousel
                  tracks={topTracks.slice(0, 6)}
                  supabaseUrl={baseUrl}
                  locale={lang}
                />
              ) : (
                <div className="aspect-[3/4] max-w-[520px] mx-auto rounded-3xl border border-[var(--border)] bg-gradient-to-br from-[var(--accent)]/20 via-[var(--accent-2)]/10 to-black flex items-center justify-center">
                  <span className="text-[var(--muted)]">
                    {lang === "ru" ? "Скоро появятся релизы" : "Releases coming soon"}
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* MARQUEE */}
      <section className="border-y border-[var(--border)] bg-black/30 backdrop-blur-sm">
        <Marquee items={marqueeItems} speed={45} />
      </section>

      {/* FEATURED + TOP CHART */}
      {topTracks.length > 0 && (
        <section className="max-w-[1400px] mx-auto px-5 md:px-10 py-20 md:py-28">
          <SectionHeader
            index="01"
            eyebrow={lang === "ru" ? "Чарт недели" : "Weekly chart"}
            title={lang === "ru" ? "Самые горячие треки" : "Top tracks right now"}
            description={
              lang === "ru"
                ? "Рейтинг по прослушиваниям и скачиваниям обновляется в реальном времени."
                : "Ranked by plays and downloads. Updated continuously."
            }
            action={
              <Link
                href={`${lp}/catalog?sort=popular`}
                className="bs-button bs-button-ghost"
              >
                {lang === "ru" ? "Весь чарт" : "View all"} →
              </Link>
            }
          />

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
        <section className="max-w-[1400px] mx-auto px-5 md:px-10 py-16 md:py-24">
          <SectionHeader
            index="02"
            eyebrow={lang === "ru" ? "20+ жанров" : "20+ genres"}
            title={lang === "ru" ? "Найди свой звук" : "Find your sound"}
            description={
              lang === "ru"
                ? "От hip-hop и amapiano до tech-house и phonk — выбирай любой вайб."
                : "From hip-hop and amapiano to tech-house and phonk — pick a vibe."
            }
          />
          <RevealOnScroll>
            <GenreTiles genres={genres} />
          </RevealOnScroll>
        </section>
      )}

      {/* NEW RELEASES */}
      {newTracks.length > 0 && (
        <section className="max-w-[1400px] mx-auto px-5 md:px-10 py-16 md:py-24">
          <SectionHeader
            index="03"
            eyebrow={lang === "ru" ? "Новинки" : "New releases"}
            title={lang === "ru" ? "Свежие дропы" : "Fresh drops"}
            description={
              lang === "ru"
                ? "Самые новые релизы в каталоге."
                : "The latest releases hitting the pool."
            }
            action={
              <Link href={`${lp}/catalog`} className="bs-button bs-button-ghost">
                {lang === "ru" ? "Открыть каталог" : "Open catalog"} →
              </Link>
            }
          />
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
      <section className="max-w-[1400px] mx-auto px-5 md:px-10 py-20 md:py-28">
        <SectionHeader
          index="04"
          eyebrow={lang === "ru" ? "Возможности" : "Why Bugatti"}
          title={dict.home.features.title}
        />
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
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

      {/* CTA — BPM-Supreme-style "Your Next Set Starts Here." stagger */}
      <section className="relative overflow-hidden">
        <div
          aria-hidden
          className="absolute inset-0 -z-10"
          style={{
            background:
              "radial-gradient(60% 60% at 30% 30%, rgba(91,140,255,0.25), transparent 60%), radial-gradient(60% 60% at 80% 80%, rgba(255,122,0,0.22), transparent 60%)",
          }}
        />
        <div className="max-w-[1400px] mx-auto px-5 md:px-10 py-24 md:py-36">
          <div className="text-[11px] uppercase tracking-[0.28em] text-[var(--accent-3)] mb-6">
            {lang === "ru" ? "Присоединяйся" : "Join the pool"}
          </div>
          <h2
            className="font-display font-bold leading-[0.86] tracking-[-0.04em] lowercase"
            style={{ fontSize: "clamp(54px, 11vw, 180px)" }}
          >
            <span className="bs-text-gradient">
              <TextReveal
                text={
                  lang === "ru"
                    ? "твой следующий сет начинается здесь."
                    : "your next set starts here."
                }
                stagger={0.03}
              />
            </span>
          </h2>
          <div className="mt-10 flex flex-wrap items-center gap-4">
            <Link
              href={`${lp}/signup`}
              className="bs-button bs-button-primary text-base"
            >
              {dict.home.hero.ctaJoin}
            </Link>
            <Link
              href={`${lp}/pricing`}
              className="bs-button bs-button-ghost text-base"
            >
              {dict.nav.pricing}
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
