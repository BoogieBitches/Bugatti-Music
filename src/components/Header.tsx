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
      <div className="max-w-7xl mx-auto px-4 h-16 flex items-center gap-4">
        <Link href={lp} className="flex items-center gap-2.5 group">
          <span className="relative inline-block w-9 h-9 rounded-xl overflow-hidden ring-1 ring-white/10 transition-transform group-hover:scale-105">
            <Image
              src="/bugatti-logo.png"
              alt="Bugatti Sound"
              fill
              sizes="36px"
              className="object-contain"
              priority
            />
          </span>
          <span className="font-display font-bold tracking-tight text-[15px]">
            BUGATTI <span className="text-[var(--accent-2)]">SOUND</span>
          </span>
        </Link>
        <nav className="hidden md:flex items-center gap-0.5 ml-4 text-sm text-[var(--muted)]">
          <Link href={`${lp}/catalog`} className="px-3 py-1.5 hover:text-white transition-colors">
            {dict.nav.catalog}
          </Link>
          <Link href={`${lp}/pricing`} className="px-3 py-1.5 hover:text-white transition-colors">
            {dict.nav.pricing}
          </Link>
          {userEmail && (
            <Link href={`${lp}/upload`} className="px-3 py-1.5 hover:text-white transition-colors">
              {dict.nav.upload}
            </Link>
          )}
          {userEmail && (
            <Link href={`${lp}/dashboard`} className="px-3 py-1.5 hover:text-white transition-colors">
              {dict.nav.dashboard}
            </Link>
          )}
          {role === "admin" && (
            <Link href={`${lp}/admin`} className="px-3 py-1.5 hover:text-white transition-colors">
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
