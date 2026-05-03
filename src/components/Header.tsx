import Link from "next/link";
import Image from "next/image";
import { getDictionary } from "@/i18n/dictionaries";
import type { Locale } from "@/i18n/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { hasSupabaseEnv } from "@/lib/env";
import { LanguageSwitcher } from "./LanguageSwitcher";
import { HeaderUser } from "./HeaderUser";

export async function Header({ locale }: { locale: Locale }) {
  const dict = await getDictionary(locale);

  let userEmail: string | null = null;
  let role: "user" | "admin" = "user";
  if (hasSupabaseEnv()) {
    try {
      const supabase = await createSupabaseServerClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        userEmail = user.email ?? null;
        const { data: profile } = await supabase
          .from("profiles")
          .select("role")
          .eq("id", user.id)
          .maybeSingle();
        role = (profile?.role as "user" | "admin") ?? "user";
      }
    } catch {
      // Supabase not reachable — render anonymous header.
    }
  }

  const lp = `/${locale}`;
  return (
    <header className="sticky top-0 z-30 backdrop-blur-xl bg-[rgba(5,6,8,0.55)] border-b border-[var(--border)]">
      <div className="max-w-7xl mx-auto px-4 h-20 flex items-center gap-5">
        <Link href={lp} className="flex items-center gap-3 group shrink-0">
          <span className="relative inline-block w-11 h-11 rounded-xl overflow-hidden ring-1 ring-white/10 transition-transform group-hover:scale-105">
            <Image
              src="/bugatti-logo.png"
              alt="Bugatti Sound"
              fill
              sizes="44px"
              className="object-contain"
              priority
            />
          </span>
          <span className="relative inline-flex items-baseline">
            <span
              className="bs-fire-glow leading-none text-[26px] md:text-[30px] tracking-[0.01em]"
              data-text="Bugatti Sound"
            >
              <span className="bs-fire">Bugatti Sound</span>
            </span>
            <span className="ml-2 mb-[-2px] text-[10px] font-bold tracking-[0.4em] text-[var(--accent-2)]/90 self-end">
              POOL
            </span>
          </span>
        </Link>
        <nav className="hidden md:flex items-center gap-1 ml-2 text-[15px] font-semibold text-white/80">
          <Link href={`${lp}/catalog`} className="px-3 py-2 rounded-md hover:text-white hover:bg-white/5 transition-colors">
            {dict.nav.catalog}
          </Link>
          <Link href={`${lp}/pricing`} className="px-3 py-2 rounded-md hover:text-white hover:bg-white/5 transition-colors">
            {dict.nav.pricing}
          </Link>
          {userEmail && (
            <Link href={`${lp}/upload`} className="px-3 py-2 rounded-md hover:text-white hover:bg-white/5 transition-colors">
              {dict.nav.upload}
            </Link>
          )}
          {userEmail && (
            <Link href={`${lp}/dashboard`} className="px-3 py-2 rounded-md hover:text-white hover:bg-white/5 transition-colors">
              {dict.nav.dashboard}
            </Link>
          )}
          {role === "admin" && (
            <Link href={`${lp}/admin`} className="px-3 py-2 rounded-md hover:text-white hover:bg-white/5 transition-colors">
              {dict.nav.admin}
            </Link>
          )}
        </nav>
        <div className="flex-1" />
        <LanguageSwitcher currentLocale={locale} />
        <HeaderUser locale={locale} userEmail={userEmail} dict={dict} />
      </div>
    </header>
  );
}
