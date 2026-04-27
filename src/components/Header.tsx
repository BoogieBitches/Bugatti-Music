import Link from "next/link";
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
    <header className="sticky top-0 z-30 backdrop-blur-md bg-black/40 border-b border-[var(--border)]">
      <div className="max-w-6xl mx-auto px-4 h-14 flex items-center gap-4">
        <Link href={lp} className="flex items-center gap-2">
          <span className="inline-block w-7 h-7 rounded-md bg-gradient-to-br from-[var(--accent)] to-[var(--accent-2)]" />
          <span className="font-bold tracking-tight">{dict.brand.name}</span>
        </Link>
        <nav className="hidden md:flex items-center gap-1 ml-4 text-sm text-[var(--muted)]">
          <Link href={`${lp}/catalog`} className="px-3 py-1.5 hover:text-white">
            {dict.nav.catalog}
          </Link>
          <Link href={`${lp}/pricing`} className="px-3 py-1.5 hover:text-white">
            {dict.nav.pricing}
          </Link>
          {userEmail && (
            <Link href={`${lp}/upload`} className="px-3 py-1.5 hover:text-white">
              {dict.nav.upload}
            </Link>
          )}
          {userEmail && (
            <Link href={`${lp}/dashboard`} className="px-3 py-1.5 hover:text-white">
              {dict.nav.dashboard}
            </Link>
          )}
          {role === "admin" && (
            <Link href={`${lp}/admin`} className="px-3 py-1.5 hover:text-white">
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
