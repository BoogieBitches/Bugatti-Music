import { getDictionary } from "@/i18n/dictionaries";
import type { Locale } from "@/i18n/config";

export async function Footer({ locale }: { locale: Locale }) {
  const dict = await getDictionary(locale);
  const year = new Date().getFullYear();
  return (
    <footer className="border-t border-[var(--border)] mt-16">
      <div className="max-w-6xl mx-auto px-4 py-8 text-sm text-[var(--muted)] flex flex-wrap items-center justify-between gap-4">
        <div>
          <span className="text-white font-semibold">{dict.brand.name}</span>{" "}
          · © {year}. {dict.footer.rights}
        </div>
        <div className="opacity-60">{dict.brand.tagline}</div>
      </div>
    </footer>
  );
}
