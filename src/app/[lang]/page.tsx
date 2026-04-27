import Link from "next/link";
import { getDictionary } from "@/i18n/dictionaries";
import { isLocale } from "@/i18n/config";
import { notFound } from "next/navigation";

export default async function HomePage({ params }: PageProps<"/[lang]">) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();
  const dict = await getDictionary(lang);
  const lp = `/${lang}`;

  return (
    <div>
      {/* Hero */}
      <section className="relative overflow-hidden">
        <div
          aria-hidden
          className="absolute inset-0 -z-10 opacity-60"
          style={{
            background:
              "radial-gradient(60% 60% at 30% 30%, rgba(239,68,68,0.25), transparent 60%), radial-gradient(50% 50% at 80% 50%, rgba(245,158,11,0.18), transparent 60%)",
          }}
        />
        <div className="max-w-6xl mx-auto px-4 py-20 md:py-28 grid md:grid-cols-2 gap-10 items-center">
          <div>
            <span className="bs-badge bs-badge-premium">{dict.brand.name}</span>
            <h1 className="mt-4 text-4xl md:text-6xl font-extrabold tracking-tight">
              {dict.home.hero.title}
            </h1>
            <p className="mt-5 text-[var(--muted)] text-lg max-w-xl">
              {dict.home.hero.subtitle}
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href={`${lp}/catalog`} className="bs-button bs-button-primary text-base">
                {dict.home.hero.ctaBrowse}
              </Link>
              <Link href={`${lp}/signup`} className="bs-button text-base">
                {dict.home.hero.ctaJoin}
              </Link>
            </div>
          </div>
          <div className="bs-card p-6 md:p-8">
            <div className="aspect-video rounded-xl bg-gradient-to-br from-[var(--accent)]/30 via-[var(--accent-2)]/20 to-transparent border border-[var(--border)] flex items-center justify-center">
              <span className="text-6xl md:text-7xl font-black tracking-tight bg-gradient-to-br from-white to-[var(--muted)] bg-clip-text text-transparent">
                BUGATTI
                <span className="block text-[var(--accent-2)]">SOUND</span>
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="max-w-6xl mx-auto px-4 py-16">
        <h2 className="text-2xl md:text-3xl font-bold tracking-tight">
          {dict.home.features.title}
        </h2>
        <div className="mt-8 grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {dict.home.features.items.map((item, i) => (
            <div key={i} className="bs-card p-5">
              <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-[var(--accent)] to-[var(--accent-2)]" />
              <h3 className="mt-4 font-semibold">{item.title}</h3>
              <p className="mt-1 text-sm text-[var(--muted)]">{item.body}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
