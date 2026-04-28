"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import type { Dictionary } from "@/i18n/dictionaries";
import type { Locale } from "@/i18n/config";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export function HeaderUser({
  locale,
  userEmail,
  dict,
}: {
  locale: Locale;
  userEmail: string | null;
  dict: Dictionary;
}) {
  const router = useRouter();
  const lp = `/${locale}`;

  if (!userEmail) {
    return (
      <div className="flex items-center gap-2">
        <Link href={`${lp}/login`} className="bs-button text-sm">
          {dict.nav.login}
        </Link>
        <Link href={`${lp}/signup`} className="bs-button bs-button-primary text-sm">
          {dict.nav.signup}
        </Link>
      </div>
    );
  }

  async function handleLogout() {
    const supabase = createSupabaseBrowserClient();
    await supabase.auth.signOut();
    router.push(`${lp}`);
    router.refresh();
  }

  return (
    <div className="flex items-center gap-2">
      <span className="hidden sm:inline text-sm text-[var(--muted)] max-w-[180px] truncate">
        {userEmail}
      </span>
      <button onClick={handleLogout} className="bs-button text-sm" title={dict.nav.logout}>
        <LogOut size={16} />
        <span className="hidden md:inline">{dict.nav.logout}</span>
      </button>
    </div>
  );
}
