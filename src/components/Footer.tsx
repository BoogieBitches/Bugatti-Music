import Image from "next/image";
import Link from "next/link";
import { getDictionary } from "@/i18n/dictionaries";
import type { Locale } from "@/i18n/config";

export async function Footer({ locale }: { locale: Locale }) {
  const dict = await getDictionary(locale);
  const year = new Date().getFullYear();
  const lp = `/${locale}`;
  return (
    <footer className="relative mt-24 border-t border-[var(--border)] backdrop-blur-sm">
      <div className="max-w-7xl mx-auto px-4 py-12 grid gap-10 md:grid-cols-4">
        <div className="md:col-span-2">
          <div className="flex items-center gap-2.5">
            <span className="relative inline-block w-9 h-9 rounded-xl overflow-hidden ring-1 ring-white/10">
              <Image src="/bugatti-logo.png" alt="Bugatti Sound" fill sizes="36px" className="object-contain" />
            </span>
            <span className="font-display font-bold tracking-tight">
              BUGATTI <span className="text-[var(--accent-2)]">SOUND</span>
            </span>
          </div>
          <p className="mt-4 text-sm text-[var(--muted)] max-w-sm">{dict.brand.tagline}</p>
        </div>
        <div>
          <div className="text-xs uppercase tracking-[0.18em] text-[var(--muted)] mb-3">
            {locale === "ru" ? "Каталог" : "Catalog"}
          </div>
          <ul className="space-y-2 text-sm">
            <li><Link href={`${lp}/catalog`} className="hover:text-white text-[var(--muted)]">{dict.nav.catalog}</Link></li>
            <li><Link href={`${lp}/catalog?sort=popular`} className="hover:text-white text-[var(--muted)]">{locale === "ru" ? "Чарт" : "Top chart"}</Link></li>
            <li><Link href={`${lp}/pricing`} className="hover:text-white text-[var(--muted)]">{dict.nav.pricing}</Link></li>
          </ul>
        </div>
        <div>
          <div className="text-xs uppercase tracking-[0.18em] text-[var(--muted)] mb-3">
            {locale === "ru" ? "Аккаунт" : "Account"}
          </div>
          <ul className="space-y-2 text-sm">
            <li><Link href={`${lp}/login`} className="hover:text-white text-[var(--muted)]">{dict.nav.login}</Link></li>
            <li><Link href={`${lp}/signup`} className="hover:text-white text-[var(--muted)]">{dict.nav.signup}</Link></li>
            <li><Link href={`${lp}/upload`} className="hover:text-white text-[var(--muted)]">{dict.nav.upload}</Link></li>
          </ul>
        </div>
      </div>
      <div className="border-t border-[var(--border)]">
        <div className="max-w-7xl mx-auto px-4 py-5 text-xs text-[var(--muted)] flex flex-wrap items-center justify-between gap-3">
          <div>© {year} {dict.brand.name}. {dict.footer.rights}</div>
          <div className="opacity-70">Built for serious DJs.</div>
        </div>
      </div>
    </footer>
  );
}
