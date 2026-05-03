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

export default async function HomePage({ params }: PageProps<"/[lang]">) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();
  await getDictionary(lang);
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

  const benefits =
    lang === "ru"
      ? [
          {
            kicker: "Каталог",
            title: "Тысячи треков от лучших продюсеров",
            body: "Hip-Hop, House, EDM, Reggaeton, Phonk и не только — каждый трек проходит модерацию.",
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
            body: "Hip-Hop, House, EDM, Reggaeton, Phonk and beyond — every release moderated.",
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
            price: "$5",
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
              "Скидки на оборудование",
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
            price: "$5",
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
              "Hardware discounts",
              "Direct producer DMs",
            ],
            cta: "Notify me",
            href: `${lp}/pricing`,
            featured: false,
          },
        ];

  return (
    <div>
      {/* HERO — BPM-Supreme-style massive lowercase title only */}
      <section className="relative overflow-hidden">
        <div
          aria-hidden
          className="absolute inset-0 -z-[1]"
          style={{
            background:
              "radial-gradient(60% 60% at 50% 30%, rgba(91,140,255,0.18), transparent 70%), radial-gradient(50% 50% at 80% 80%, rgba(255,122,0,0.14), transparent 70%)",
          }}
        />

        <div className="relative max-w-[1400px] mx-auto px-5 md:px-10 pt-12 md:pt-20 pb-10 md:pb-16">
          {/* Massive display title — fills width like BPM */}
          <h1
            className="font-display font-bold leading-[0.86] tracking-[-0.05em] text-[#f1ece4] whitespace-nowrap"
            style={{
              fontSize: "clamp(56px, 11.5vw, 168px)",
              textShadow:
                "0 4px 80px rgba(91, 140, 255, 0.25), 0 2px 30px rgba(255, 122, 0, 0.18)",
            }}
          >
            <TextReveal text="Bugatti Sound" stagger={0.035} trigger="mount" />
          </h1>

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
                {lang === "ru"
                  ? `${approvedCount > 0 ? approvedCount.toLocaleString() : "1000+"} треков от лучших продюсеров.`
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
        </div>
      </section>

      {/* MARQUEE — full-bleed strip between hero and trending */}
      <section className="border-y border-[var(--border)] bg-black/30 backdrop-blur-sm">
        <Marquee items={marqueeItems} speed={45} />
      </section>

      {/* SECTION 01 — TRENDING / 3D COVERFLOW */}
      {coverflowTracks.length >= 1 && (
        <section className="relative max-w-[1400px] mx-auto px-5 md:px-10 py-20 md:py-28">
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
                ? "Скачивай треки. Используй где угодно. Без бредятины."
                : "Download tracks. Use them anywhere. No bullshit."}
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
          {plans.map((plan) => (
            <div
              key={plan.name}
              className={`relative rounded-3xl p-7 md:p-8 border ${
                plan.featured
                  ? "border-[var(--accent)]/60 bg-gradient-to-br from-[var(--accent)]/15 via-black/60 to-[var(--accent-2)]/10"
                  : "border-[var(--border)] bg-black/40"
              } backdrop-blur-sm flex flex-col`}
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
            <div key={b.title} className="relative">
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
          ))}
        </div>
      </section>

      {/* SECTION 05 — GENRES */}
      {genres.length > 0 && (
        <section className="relative max-w-[1400px] mx-auto px-5 md:px-10 py-20 md:py-28 border-t border-[var(--border)]">
          <header className="grid md:grid-cols-12 gap-6 md:gap-10 items-end mb-12 md:mb-16">
            <div className="md:col-span-1 font-display text-5xl md:text-6xl font-bold tabular-nums tracking-tighter text-white/90">
              05
            </div>
            <div className="md:col-span-7">
              <div className="text-[11px] tracking-[0.28em] uppercase text-[var(--accent-3)] mb-3">
                {genres.length}+ {lang === "ru" ? "стилей" : "Styles"}
              </div>
              <h2 className="font-display text-5xl md:text-7xl lg:text-8xl font-bold tracking-tighter leading-[0.95] text-white">
                <TextReveal
                  text={lang === "ru" ? "Genres" : "Genres"}
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

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 md:gap-4">
            {genres.slice(0, 20).map((g) => (
              <Link
                key={g.id}
                href={`${lp}/catalog?genre=${g.slug}`}
                className="group relative aspect-[5/4] rounded-2xl overflow-hidden border border-[var(--border)] bg-gradient-to-br from-white/5 to-transparent flex items-end p-4 hover:border-white/30 transition-colors"
              >
                <div
                  aria-hidden
                  className="absolute inset-0 opacity-40 group-hover:opacity-60 transition-opacity"
                  style={{
                    background: `radial-gradient(120% 80% at 50% 100%, ${
                      [
                        "#5b8cff",
                        "#ff7a00",
                        "#7b49ff",
                        "#22c55e",
                        "#ff3d6b",
                        "#00d4ff",
                        "#ffd000",
                      ][g.position % 7]
                    }, transparent 70%)`,
                  }}
                />
                <span className="relative font-display text-lg md:text-xl font-bold tracking-tight text-white">
                  {lang === "ru" ? g.name_ru : g.name_en}
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}

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
            {newTracks.slice(0, 8).map((t) => {
              const cover = publicCover(t.cover_image_path);
              const genreName = t.genre
                ? lang === "ru"
                  ? t.genre.name_ru
                  : t.genre.name_en
                : "";
              return (
                <Link
                  key={t.id}
                  href={`${lp}/track/${t.id}`}
                  className="group relative block"
                >
                  <div className="relative aspect-square rounded-2xl overflow-hidden ring-1 ring-white/10 bg-black/40">
                    {cover ? (
                      <Image
                        src={cover}
                        alt={t.title}
                        fill
                        sizes="(min-width: 768px) 25vw, 50vw"
                        className="object-cover transition-transform duration-500 group-hover:scale-[1.04]"
                      />
                    ) : (
                      <div className="absolute inset-0 bg-gradient-to-br from-[var(--accent)]/30 to-[var(--accent-2)]/20" />
                    )}
                  </div>
                  <div className="mt-3">
                    <div className="font-display text-base md:text-lg font-bold text-white truncate">
                      {t.title}
                    </div>
                    <div className="text-sm text-[var(--muted)] truncate">
                      {t.artist}
                      {genreName ? ` · ${genreName}` : ""}
                    </div>
                  </div>
                </Link>
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
            className="font-display font-bold leading-[0.86] tracking-[-0.04em] lowercase text-[#f1ece4]"
            style={{
              fontSize: "clamp(54px, 11vw, 180px)",
              textShadow:
                "0 4px 80px rgba(91, 140, 255, 0.3), 0 2px 30px rgba(255, 122, 0, 0.22)",
            }}
          >
            <TextReveal
              text={
                lang === "ru"
                  ? "твой следующий сет начинается здесь."
                  : "your next set starts here."
              }
              stagger={0.03}
              trigger="mount"
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
