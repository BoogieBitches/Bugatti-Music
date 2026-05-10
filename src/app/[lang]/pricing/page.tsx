import { isLocale } from "@/i18n/config";
import { notFound } from "next/navigation";
import { getDictionary } from "@/i18n/dictionaries";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { hasSupabaseEnv, hasYookassaEnv } from "@/lib/env";
import { CheckoutButton } from "@/components/CheckoutButton";
import { Check } from "lucide-react";

export default async function PricingPage({ params }: PageProps<"/[lang]/pricing">) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();
  const dict = await getDictionary(lang);

  let isLoggedIn = false;
  let isPremium = false;
  if (hasSupabaseEnv()) {
    try {
      const supabase = await createSupabaseServerClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        isLoggedIn = true;
        const { data: profile } = await supabase
          .from("profiles")
          .select("is_premium, premium_until")
          .eq("id", user.id)
          .maybeSingle();
        isPremium =
          !!profile?.is_premium &&
          (!profile.premium_until || new Date(profile.premium_until) > new Date());
      }
    } catch {
      // ignore
    }
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-16">
      <h1 className="text-4xl md:text-5xl font-bold tracking-tight">{dict.pricing.title}</h1>
      <p className="text-[var(--muted)] mt-2 text-lg">{dict.pricing.subtitle}</p>

      <div className="mt-10 grid md:grid-cols-2 gap-4">
        <div className="bs-card p-6">
          <h3 className="text-xl font-semibold">{dict.pricing.free.name}</h3>
          <div className="mt-2 text-4xl font-bold">{dict.pricing.free.price}</div>
          <ul className="mt-4 space-y-2 text-sm">
            {dict.pricing.free.features.map((f, i) => (
              <li key={i} className="flex items-start gap-2">
                <Check size={16} className="mt-0.5 text-[var(--muted)]" /> {f}
              </li>
            ))}
          </ul>
        </div>

        <div className="bs-card p-6 relative overflow-hidden">
          <div
            aria-hidden
            className="absolute -top-12 -right-12 w-40 h-40 rounded-full opacity-30"
            style={{
              background: "radial-gradient(closest-side, var(--accent), transparent 70%)",
            }}
          />
          <div className="flex items-center gap-2">
            <h3 className="text-xl font-semibold">{dict.pricing.premium.name}</h3>
            <span className="bs-badge bs-badge-premium">{dict.common.premiumBadge}</span>
          </div>
          <div className="mt-2 text-4xl font-bold">
            {dict.pricing.premium.price}
            <span className="text-base text-[var(--muted)] ml-1">
              {dict.pricing.premium.period}
            </span>
          </div>
          <ul className="mt-4 space-y-2 text-sm">
            {dict.pricing.premium.features.map((f, i) => (
              <li key={i} className="flex items-start gap-2">
                <Check size={16} className="mt-0.5 text-[var(--accent-2)]" /> {f}
              </li>
            ))}
          </ul>
          <div className="mt-6">
            <CheckoutButton
              locale={lang}
              dict={dict}
              isLoggedIn={isLoggedIn}
              isPremium={isPremium}
              yookassaReady={hasYookassaEnv()}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
