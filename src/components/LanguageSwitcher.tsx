"use client";

import { usePathname, useRouter } from "next/navigation";
import { LOCALES, type Locale } from "@/i18n/config";

export function LanguageSwitcher({ currentLocale }: { currentLocale: Locale }) {
  const router = useRouter();
  const pathname = usePathname() ?? "/";

  function switchTo(locale: Locale) {
    if (locale === currentLocale) return;
    const parts = pathname.split("/");
    if (parts.length > 1 && (LOCALES as readonly string[]).includes(parts[1])) {
      parts[1] = locale;
    } else {
      parts.splice(1, 0, locale);
    }
    router.push(parts.join("/") || `/${locale}`);
  }

  return (
    <div className="hidden sm:flex items-center bg-[var(--muted-2)] border border-[var(--border)] rounded-full overflow-hidden text-xs">
      {LOCALES.map((l) => (
        <button
          key={l}
          onClick={() => switchTo(l)}
          className={`px-3 py-1.5 ${
            l === currentLocale ? "bg-white text-black" : "text-[var(--muted)] hover:text-white"
          }`}
        >
          {l.toUpperCase()}
        </button>
      ))}
    </div>
  );
}
