import Link from "next/link";
import Image from "next/image";
import { getDictionary } from "@/i18n/dictionaries";
import { isLocale } from "@/i18n/config";
import { notFound } from "next/navigation";
import { hasSupabaseEnv } from "@/lib/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Genre, TrackWithGenre } from "@/types/db";
import { Coverflow } from "@/components/Coverflow";
import { TextReveal } from "@/components/TextReveal";
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
            .limit(8),
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

  // Tracks for the 3D coverflow — prefer fresh, fall back to top.
  const coverflowTracks =
    newTracks.length >= 3
      ? newTracks
      : topTracks.length >= 3
        ? topTracks
        : [...newTracks, ...topTracks];

  const marqueeItems = [
    "HOUSE",
    "CLUB HOUSE",
    "BASS HOUSE",
    "TECH HOUSE",
    "GARAGE",
    "BAILE FUNK",
    "POP-DANCE",
    "D'N'B",
    "RAP & HIP-HOP",
    "TECHNO",
  ];

  const benefits =
    lang === "ru"
      ? [
          {
            kicker: "Каталог",
            title: "Тысячи треков от лучших продюсеров",
            body: "House, Club House, Bass House, Tech House, Garage, Baile Funk, Pop-Dance, D'n'B, Rap & Hip-Hop, Techno — каждый трек проходит модерацию.",
          },
          {
            kicker: "Скачивание",
            title: "Полное качество в один клик",
            body: "Без водяных знаков, без рекламы, без лимитов. Скачивай и используй где угодно.",
          },
          {
            kicker: "Превью",
            title: "30-секундные сэмплы для всех",
            body: "Слушай на любом устройстве — регистрация не требуется.",
          },
          {
            kicker: "Дропы",
            title: "Свежие релизы каждую неделю",
            body: "Новые треки добавляются ежедневно. Будь первым, кто их сыграет.",
          },
          {
            kicker: "От DJ для DJ",
            title: "Сделано теми, кто играет сам",
            body: "Каждый бит, каждая обложка, каждая обложка под живой сет.",
          },
        ]
      : [
          {
            kicker: "Catalog",
            title: "Thousands of tracks from top producers",
            body: "House, Club House, Bass House, Tech House, Garage, Baile Funk, Pop-Dance, D'n'B, Rap & Hip-Hop, Techno — every release moderated.",
          },
          {
            kicker: "Downloads",
            title: "Full-quality, one click away",
            body: "No watermarks, no ads, no limits. Download and play anywhere.",
          },
          {
            kicker: "Previews",
            title: "30-second samples on every track",
            body: "Listen on any device — no signup required.",
          },
          {
            kicker: "Drops",
            title: "Fresh releases every week",
            body: "New tracks added daily. Be first to play them out.",
          },
          {
            kicker: "By DJs for DJs",
            title: "Built by people who play out",
            body: "Every beat, every cover, every detail tuned for the live set.",
          },
        ];

  const plans =
    lang === "ru"
      ? [
          {
            name: "Бесплатный",
            price: "0₽",
            period: "/ навсегда",
            features: [
              "Полный каталог",
              "30-секундные превью",
              "Загрузка своих треков",
              "Поддержка ru/en",
            ],
            cta: "Зарегистрироваться",
            href: `${lp}/signup`,
            featured: false,
          },
          {
            name: "Premium",
            price: "499 ₽",
            period: "/ месяц",
            features: [
              "Безлимитные скачивания",
              "Ранний доступ к новинкам",
              "Полное качество, без рекламы",
              "Отмена в любой момент",
            ],
            cta: "Оформить подписку",
            href: `${lp}/pricing`,
            featured: true,
          },
          {
            name: "All-Access",
            price: "Скоро",
            period: "",
            features: [
              "Всё из Premium",
              "Эксклюзивные дропы",
              "Прямая связь с продюсерами",
            ],
            cta: "Уведомить",
            href: `${lp}/pricing`,
            featured: false,
          },
        ]
      : [
          {
            name: "Free",
            price: "$0",
            period: "/ forever",
            features: [
              "Browse full catalog",
              "30-sec previews",
              "Upload your own tracks",
              "EN / RU support",
            ],
            cta: "Sign up free",
            href: `${lp}/signup`,
            featured: false,
          },
          {
            name: "Premium",
            price: "499 ₽",
            period: "/ month",
            features: [
              "Unlimited full-quality downloads",
              "Early access to new uploads",
              "No ads, no limits",
              "Cancel anytime",
            ],
            cta: "Get Premium",
            href: `${lp}/pricing`,
            featured: true,
          },
          {
            name: "All-Access",
            price: "Soon",
            period: "",
            features: [
              "Everything in Premium",
              "Exclusive drops",
              "Direct producer DMs",
            ],
            cta: "Notify me",
            href: `${lp}/pricing`,
            featured: false,
          },
        ];

  return (
    <div>
      {/* HERO — POOL UP with violet halo background */}
      <section className="hero-violet relative overflow-hidden">
        <div aria-hidden className="hero-violet-stars" />

        <div className="relative max-w-[1400px] mx-auto px-5 md:px-10 pt-12 md:pt-20 pb-10 md:pb-16">
          {/* Eyebrow — small editorial label */}
          <div className="hero-eyebrow">
            <span aria-hidden className="hero-eyebrow-dot" />
            <span>BUGATTI SOUND · DJ POOL · EST. 2026</span>
          </div>

          {/* Massive display title — chrome shimmer "pool up" */}
          <h1
            className="pool-up-title font-display font-bold leading-[0.84] tracking-[-0.06em] lowercase whitespace-nowrap"
            style={{ fontSize: "clamp(72px, 15vw, 240px)" }}
          >
            pool up
          </h1>

          {/* Cinematic subtitle — thin, semi-transparent, glowing */}
          <p className="hero-subtitle mt-5 md:mt-7">
            {lang === "ru" ? (
              <>
                Эксклюзивная музыка для DJ —{" "}
                <em>раньше, чем мир услышит.</em>
              </>
            ) : (
              <>
                Exclusive music for DJs <em>before the world hears it.</em>
              </>
            )}
          </p>

          {/* Refined accent rule — a thin line that fades into the violet */}

          {/* 3-column caption row + CTA on the right */}
          <div className="mt-8 md:mt-12 grid md:grid-cols-12 gap-6 md:gap-8 items-end">
            <div className="md:col-span-3">
              <p className="font-display text-[15px] md:text-base font-semibold text-white leading-snug">
                {lang === "ru"
                  ? "Подними свой DJ-сет на новый уровень."
                  : "Level up your DJ set with Bugatti Sound."}
              </p>
            </div>
            <div className="md:col-span-3">
              <p className="font-display text-[15px] md:text-base font-semibold text-white leading-snug">
                {approvedCount >= 50
                  ? lang === "ru"
                    ? `${approvedCount.toLocaleString()} треков от лучших продюсеров.`
                    : `${approvedCount.toLocaleString()} tracks from top producers worldwide.`
                  : lang === "ru"
                    ? "Первые релизы — будь одним из основателей."
                    : "First releases in — be a founding artist."}
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
        </div>
      </section>

      {/* MARQUEE — full-bleed strip between hero and trending */}
      <section className="border-y border-[var(--border)] bg-black/30 backdrop-blur-sm">
        <Marquee items={marqueeItems} speed={45} />
      </section>

      {/* EARLY PRODUCERS BANNER — shown when the catalog is still empty / tiny */}
      {approvedCount < 3 && (
        <section className="relative max-w-[1400px] mx-auto px-5 md:px-10 py-20 md:py-28">
          <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-[#0e0e12] via-[#17121b] to-[#0e0e12] px-6 py-16 md:px-16 md:py-24">
            <div
              aria-hidden
              className="absolute inset-0 -z-[1]"
              style={{
                background:
                  "radial-gradient(60% 60% at 15% 20%, rgba(255,122,0,0.18), transparent 70%), radial-gradient(55% 55% at 85% 85%, rgba(91,140,255,0.22), transparent 70%)",
              }}
            />
            <div className="grid md:grid-cols-12 gap-8 items-center">
              <div className="md:col-span-8">
                <div className="text-[11px] tracking-[0.28em] uppercase text-[var(--accent-3)] mb-4">
                  {dict.earlyProducers.eyebrow}
                </div>
                <h2 className="font-display text-4xl md:text-6xl lg:text-7xl font-bold tracking-tight text-white leading-[0.98]">
                  {dict.earlyProducers.title}
                </h2>
                <p className="mt-6 text-[var(--muted)] text-base md:text-lg max-w-2xl">
                  {dict.earlyProducers.body}
                </p>
              </div>
              <div className="md:col-span-4 flex flex-col gap-3 md:items-end">
                <Link
                  href={`${lp}/upload`}
                  className="bs-button bs-button-primary text-base whitespace-nowrap"
                >
                  {dict.earlyProducers.cta} →
                </Link>
                <Link
                  href={`${lp}/pricing`}
                  className="text-sm text-[var(--muted)] hover:text-white underline underline-offset-4"
                >
                  {dict.earlyProducers.secondary}
                </Link>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* SECTION 01 — TRENDING / 3D COVERFLOW */}
      {coverflowTracks.length >= 3 && (
        <section id="trending" className="relative max-w-[1400px] mx-auto px-5 md:px-10 py-20 md:py-28 scroll-mt-24">
          <header className="grid md:grid-cols-12 gap-6 md:gap-10 items-end mb-12 md:mb-16">
            <div className="md:col-span-1 font-display text-5xl md:text-6xl font-bold tabular-nums tracking-tighter text-white/90">
              01
            </div>
            <div className="md:col-span-7">
              <div className="text-[11px] tracking-[0.28em] uppercase text-[var(--accent-3)] mb-3">
                {genres.length}+ {lang === "ru" ? "жанров" : "Genres"}
              </div>
              <h2 className="font-display text-5xl md:text-7xl lg:text-8xl font-bold tracking-tighter leading-[0.95] text-white">
                <TextReveal
                  text={lang === "ru" ? "Trending" : "Trending"}
                  stagger={0.04}
                  trigger="mount"
                />
              </h2>
            </div>
            <div className="md:col-span-4 flex md:justify-end">
              <Link
                href={`${lp}/catalog`}
                className="group inline-flex items-center gap-2 font-display text-sm font-semibold tracking-[0.18em] uppercase"
              >
                <span>{lang === "ru" ? "Все жанры" : "Explore Genres"}</span>
                <span
                  aria-hidden
                  className="inline-block transition-transform group-hover:translate-x-1"
                >
                  →
                </span>
              </Link>
            </div>
          </header>

          <Coverflow
            tracks={coverflowTracks}
            supabaseUrl={baseUrl}
            locale={lang}
          />
        </section>
      )}

      {/* SECTION 02 — SUBSCRIBE */}
      <section className="relative max-w-[1400px] mx-auto px-5 md:px-10 py-20 md:py-28 border-t border-[var(--border)]">
        <header className="grid md:grid-cols-12 gap-6 md:gap-10 items-end">
          <div className="md:col-span-1 font-display text-5xl md:text-6xl font-bold tabular-nums tracking-tighter text-white/90">
            02
          </div>
          <div className="md:col-span-7">
            <div className="text-[11px] tracking-[0.28em] uppercase text-[var(--accent-3)] mb-3">
              {lang === "ru" ? "Подписка" : "Subscribe"}
            </div>
            <h2 className="font-display text-5xl md:text-7xl lg:text-8xl font-bold tracking-tighter leading-[0.95] text-white">
              <TextReveal
                text={lang === "ru" ? "Subscribe" : "Subscribe"}
                stagger={0.04}
                trigger="mount"
              />
            </h2>
            <p className="mt-6 text-[var(--muted)] text-base md:text-xl max-w-2xl">
              {lang === "ru"
                ? "Скачивай треки. Используй где угодно. Без воды."
                : "Download tracks. Use them anywhere. No fluff."}
            </p>
          </div>
          <div className="md:col-span-4 flex md:justify-end">
            <Link
              href={`${lp}/pricing`}
              className="bs-button bs-button-primary text-base"
            >
              {lang === "ru" ? "Выбрать план" : "Choose plan"} →
            </Link>
          </div>
        </header>
      </section>

      {/* SECTION 03 — PLANS */}
      <section className="relative max-w-[1400px] mx-auto px-5 md:px-10 pb-20 md:pb-28">
        <header className="grid md:grid-cols-12 gap-6 md:gap-10 items-end mb-12 md:mb-16">
          <div className="md:col-span-1 font-display text-5xl md:text-6xl font-bold tabular-nums tracking-tighter text-white/90">
            03
          </div>
          <div className="md:col-span-11">
            <div className="text-[11px] tracking-[0.28em] uppercase text-[var(--accent-3)] mb-3">
              {lang === "ru" ? "Тарифы" : "Plans"}
            </div>
            <h2 className="font-display text-5xl md:text-7xl lg:text-8xl font-bold tracking-tighter leading-[0.95] text-white">
              <TextReveal
                text={lang === "ru" ? "Plans" : "Plans"}
                stagger={0.04}
                trigger="mount"
              />
            </h2>
          </div>
        </header>

        <div className="grid md:grid-cols-3 gap-5 md:gap-6">
          {plans.map((plan, idx) => (
            <RevealOnScroll key={plan.name} delay={idx * 0.08}>
            <div
              className={`relative rounded-3xl p-7 md:p-8 border ${
                plan.featured
                  ? "border-[var(--accent)]/60 bg-gradient-to-br from-[var(--accent)]/15 via-black/60 to-[var(--accent-2)]/10"
                  : "border-[var(--border)] bg-black/40"
              } backdrop-blur-sm flex flex-col h-full transition-transform duration-300 hover:-translate-y-1`}
            >
              {plan.featured && (
                <div className="absolute top-5 right-5 text-[10px] tracking-[0.24em] uppercase text-[var(--accent-3)] font-display font-bold">
                  {lang === "ru" ? "Популярный" : "Most popular"}
                </div>
              )}
              <div className="font-display text-2xl font-bold text-white">
                {plan.name}
              </div>
              <div className="mt-6 flex items-baseline gap-2">
                <span className="font-display text-6xl font-bold tracking-tighter text-white tabular-nums">
                  {plan.price}
                </span>
                <span className="text-[var(--muted)] text-sm">
                  {plan.period}
                </span>
              </div>
              <ul className="mt-8 space-y-3 text-[var(--foreground)] text-sm md:text-base flex-1">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-start gap-3">
                    <span
                      aria-hidden
                      className="mt-2 h-1.5 w-1.5 rounded-full bg-[var(--accent)] shrink-0"
                    />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
              <Link
                href={plan.href}
                className={`mt-8 ${
                  plan.featured ? "bs-button bs-button-primary" : "bs-button bs-button-ghost"
                } text-base justify-center`}
              >
                {plan.cta} →
              </Link>
            </div>
            </RevealOnScroll>
          ))}
        </div>
      </section>

      {/* SECTION 04 — ACCESS TO / BENEFITS */}
      <section className="relative max-w-[1400px] mx-auto px-5 md:px-10 py-20 md:py-28 border-t border-[var(--border)]">
        <header className="grid md:grid-cols-12 gap-6 md:gap-10 items-end mb-12 md:mb-16">
          <div className="md:col-span-1 font-display text-5xl md:text-6xl font-bold tabular-nums tracking-tighter text-white/90">
            04
          </div>
          <div className="md:col-span-11">
            <div className="text-[11px] tracking-[0.28em] uppercase text-[var(--accent-3)] mb-3">
              {lang === "ru" ? "Что внутри" : "Access to"}
            </div>
            <h2 className="font-display text-5xl md:text-7xl lg:text-8xl font-bold tracking-tighter leading-[0.95] text-white">
              <TextReveal
                text={lang === "ru" ? "Everything." : "Everything."}
                stagger={0.04}
                trigger="mount"
              />
            </h2>
          </div>
        </header>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-x-10 gap-y-12 md:gap-y-16">
          {benefits.map((b, i) => (
            <RevealOnScroll key={b.title} delay={i * 0.06}>
              <div className="relative">
                <div className="font-display text-3xl font-bold tabular-nums tracking-tighter text-white/30 mb-3">
                  {String(i + 1).padStart(2, "0")}
                </div>
                <div className="text-[11px] tracking-[0.28em] uppercase text-[var(--accent-3)] mb-3">
                  {b.kicker}
                </div>
                <h3 className="font-display text-2xl md:text-3xl font-bold tracking-tight text-white leading-tight">
                  {b.title}
                </h3>
                <p className="mt-4 text-[var(--muted)] text-base">{b.body}</p>
              </div>
            </RevealOnScroll>
          ))}
        </div>
      </section>

      {/* SECTION 05 — GENRES (curated) */}
      {(() => {
        const curated: {
          slug: string;
          label: string;
          bpm: string;
          from: string;
          to: string;
        }[] = [
          { slug: "house",      label: "House",           bpm: "120–128",  from: "#ffb800", to: "#ff5a00" },
          { slug: "club-house", label: "Club House",      bpm: "124–128",  from: "#ff3d9a", to: "#7a1fad" },
          { slug: "bass-house", label: "Bass House",      bpm: "126–132",  from: "#00d4ff", to: "#1e40ff" },
          { slug: "tech-house", label: "Tech House",      bpm: "122–126",  from: "#00e5a8", to: "#00867d" },
          { slug: "garage",     label: "Garage",          bpm: "130–135",  from: "#cfd9e4", to: "#4a5b6a" },
          { slug: "baile-funk", label: "Baile Funk",      bpm: "130",      from: "#c7ff3d", to: "#ff3d9a" },
          { slug: "pop-dance",  label: "Pop-Dance",       bpm: "118–126",  from: "#ff8a2a", to: "#ff4fa3" },
          { slug: "drum-bass",  label: "D'n'B",           bpm: "170–176",  from: "#ff2e4d", to: "#8b0014" },
          { slug: "hip-hop",    label: "Rap & Hip-Hop",   bpm: "80–105",   from: "#f9d26e", to: "#8a5a1b" },
          { slug: "techno",     label: "Techno",          bpm: "128–140",  from: "#9b7aff", to: "#3b1d9c" },
        ];
        return (
          <section id="genres" className="relative max-w-[1400px] mx-auto px-5 md:px-10 py-20 md:py-28 border-t border-[var(--border)] scroll-mt-24">
            <header className="grid md:grid-cols-12 gap-6 md:gap-10 items-end mb-12 md:mb-16">
              <div className="md:col-span-1 font-display text-5xl md:text-6xl font-bold tabular-nums tracking-tighter text-white/90">
                05
              </div>
              <div className="md:col-span-7">
                <div className="text-[11px] tracking-[0.28em] uppercase text-[var(--accent-3)] mb-3">
                  {curated.length} {lang === "ru" ? "стилей" : "Styles"}
                </div>
                <h2 className="font-display text-5xl md:text-7xl lg:text-8xl font-bold tracking-tighter leading-[0.95] text-white">
                  <TextReveal text="Genres" stagger={0.04} trigger="mount" />
                </h2>
              </div>
              <div className="md:col-span-4 flex md:justify-end">
                <Link
                  href={`${lp}/catalog`}
                  className="group inline-flex items-center gap-2 font-display text-sm font-semibold tracking-[0.18em] uppercase"
                >
                  <span>{lang === "ru" ? "Весь каталог" : "View all"}</span>
                  <span
                    aria-hidden
                    className="inline-block transition-transform group-hover:translate-x-1"
                  >
                    →
                  </span>
                </Link>
              </div>
            </header>

            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 md:gap-4">
              {curated.map((g, i) => (
                <Link
                  key={g.slug}
                  href={`${lp}/catalog?genre=${g.slug}`}
                  className="genre-card group"
                  style={
                    {
                      "--gc-from": g.from,
                      "--gc-to": g.to,
                    } as React.CSSProperties
                  }
                >
                  {/* layered gradients */}
                  <span aria-hidden className="genre-card-base" />
                  <span aria-hidden className="genre-card-glow" />
                  <span aria-hidden className="genre-card-ring" />
                  <span aria-hidden className="genre-card-sheen" />

                  {/* top row: counter + BPM */}
                  <div className="relative flex items-start justify-between">
                    <span className="font-display text-[11px] font-semibold tabular-nums tracking-[0.18em] text-white/65">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <span className="font-display text-[10px] font-semibold tracking-[0.14em] uppercase text-white/55 px-2 py-[3px] rounded-full border border-white/15 bg-white/[0.04] backdrop-blur-sm">
                      {g.bpm} BPM
                    </span>
                  </div>

                  {/* bottom: label + arrow */}
                  <div className="relative flex items-end justify-between gap-3 mt-auto">
                    <span className="font-display text-[22px] md:text-[26px] font-bold tracking-[-0.02em] leading-[1.02] text-white">
                      {g.label}
                    </span>
                    <span
                      aria-hidden
                      className="shrink-0 inline-flex w-8 h-8 rounded-full items-center justify-center bg-white/10 border border-white/15 text-white opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-300"
                    >
                      <svg
                        viewBox="0 0 24 24"
                        width="14"
                        height="14"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M5 12h14" />
                        <path d="M13 6l6 6-6 6" />
                      </svg>
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        );
      })()}

      {/* SECTION 06 — NEW RELEASES GRID */}
      {newTracks.length > 0 && (
        <section className="relative max-w-[1400px] mx-auto px-5 md:px-10 py-20 md:py-28 border-t border-[var(--border)]">
          <header className="grid md:grid-cols-12 gap-6 md:gap-10 items-end mb-12 md:mb-16">
            <div className="md:col-span-1 font-display text-5xl md:text-6xl font-bold tabular-nums tracking-tighter text-white/90">
              06
            </div>
            <div className="md:col-span-7">
              <div className="text-[11px] tracking-[0.28em] uppercase text-[var(--accent-3)] mb-3">
                {lang === "ru" ? "Свежие дропы" : "Fresh drops"}
              </div>
              <h2 className="font-display text-5xl md:text-7xl lg:text-8xl font-bold tracking-tighter leading-[0.95] text-white">
                <TextReveal
                  text={lang === "ru" ? "New" : "New"}
                  stagger={0.04}
                  trigger="mount"
                />
              </h2>
            </div>
            <div className="md:col-span-4 flex md:justify-end">
              <Link
                href={`${lp}/catalog?sort=new`}
                className="group inline-flex items-center gap-2 font-display text-sm font-semibold tracking-[0.18em] uppercase"
              >
                <span>{lang === "ru" ? "Все новинки" : "View all"}</span>
                <span
                  aria-hidden
                  className="inline-block transition-transform group-hover:translate-x-1"
                >
                  →
                </span>
              </Link>
            </div>
          </header>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 md:gap-5">
            {newTracks.slice(0, 8).map((t, idx) => {
              const cover = publicCover(t.cover_image_path);
              const genreName = t.genre
                ? lang === "ru"
                  ? t.genre.name_ru
                  : t.genre.name_en
                : "";
              return (
                <RevealOnScroll key={t.id} delay={(idx % 4) * 0.06}>
                  <Link
                    href={`${lp}/track/${t.id}`}
                    className="group relative block"
                  >
                    <div className="relative aspect-square rounded-2xl overflow-hidden ring-1 ring-white/10 bg-black/40 transition-shadow duration-300 group-hover:ring-[var(--accent-2)]/40 group-hover:shadow-[0_18px_44px_-18px_rgba(122,85,255,0.6)]">
                      {cover ? (
                        <Image
                          src={cover}
                          alt={t.title}
                          fill
                          sizes="(min-width: 768px) 25vw, 50vw"
                          className="object-cover transition-transform duration-500 group-hover:scale-[1.06]"
                        />
                      ) : (
                        <div className="absolute inset-0 bg-gradient-to-br from-[var(--accent)]/30 to-[var(--accent-2)]/20" />
                      )}
                      <div
                        aria-hidden
                        className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300"
                        style={{
                          background:
                            "radial-gradient(60% 60% at 50% 50%, rgba(184,157,255,0.18), transparent 70%)",
                        }}
                      />
                    </div>
                    <div className="mt-3">
                      <div className="font-display text-base md:text-lg font-bold text-white truncate group-hover:text-[var(--accent-3)] transition-colors">
                        {t.title}
                      </div>
                      <div className="text-sm text-[var(--muted)] truncate">
                        {t.artist}
                        {genreName ? ` · ${genreName}` : ""}
                      </div>
                    </div>
                  </Link>
                </RevealOnScroll>
              );
            })}
          </div>
        </section>
      )}

      {/* FINAL CTA — your next set starts here */}
      <section className="relative overflow-hidden border-t border-[var(--border)]">
        <div
          aria-hidden
          className="absolute inset-0 -z-[1]"
          style={{
            background:
              "radial-gradient(60% 60% at 50% 50%, rgba(91,140,255,0.18), transparent 70%), radial-gradient(40% 40% at 80% 100%, rgba(255,122,0,0.18), transparent 70%)",
          }}
        />
        <div className="max-w-[1400px] mx-auto px-5 md:px-10 py-24 md:py-36">
          <div className="text-[11px] uppercase tracking-[0.28em] text-[var(--accent-3)] mb-6">
            {lang === "ru" ? "Присоединяйся" : "Join the pool"}
          </div>
          <h2
            className="font-display font-bold leading-[0.86] tracking-[-0.04em] lowercase text-[#f1ece4] [word-spacing:0.01em]"
            style={{
              fontSize: "clamp(54px, 11vw, 180px)",
              textShadow:
                "0 4px 80px rgba(91, 140, 255, 0.3), 0 2px 30px rgba(255, 122, 0, 0.22)",
              overflowWrap: "normal",
              wordBreak: "keep-all",
              hyphens: "none",
            }}
          >
            <TextReveal
              text={
                lang === "ru"
                  ? "твой следующий сет начинается здесь."
                  : "your next set starts here."
              }
              stagger={0.08}
              trigger="mount"
              mode="word"
              allowWrap
            />
          </h2>
          <div className="mt-10 flex flex-wrap items-center gap-4">
            <Link
              href={`${lp}/signup`}
              className="bs-button bs-button-primary text-base"
            >
              {lang === "ru" ? "Зарегистрироваться" : "Sign up free"} →
            </Link>
            <Link
              href={`${lp}/catalog`}
              className="bs-button bs-button-ghost text-base"
            >
              {lang === "ru" ? "Смотреть каталог" : "Browse catalog"}
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
