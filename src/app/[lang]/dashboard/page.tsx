import Link from "next/link";
import { isLocale } from "@/i18n/config";
import { notFound, redirect } from "next/navigation";
import { getDictionary } from "@/i18n/dictionaries";
import { hasSupabaseEnv } from "@/lib/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Track } from "@/types/db";
import { ManageSubscriptionButton } from "@/components/ManageSubscriptionButton";

export default async function DashboardPage({ params }: PageProps<"/[lang]/dashboard">) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();
  if (!hasSupabaseEnv()) notFound();
  const dict = await getDictionary(lang);

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/${lang}/login?next=/${lang}/dashboard`);

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  const { data: myTracks } = await supabase
    .from("tracks")
    .select("*")
    .eq("uploader_id", user.id)
    .order("created_at", { ascending: false });
  const tracks = (myTracks ?? []) as Track[];

  const isPremium =
    !!profile?.is_premium &&
    (!profile.premium_until || new Date(profile.premium_until) > new Date());

  const formattedUntil = profile?.premium_until
    ? new Date(profile.premium_until).toLocaleDateString(lang === "ru" ? "ru-RU" : "en-US")
    : "";

  return (
    <div className="max-w-5xl mx-auto px-4 py-10">
      <h1 className="text-3xl md:text-4xl font-bold tracking-tight">{dict.dashboard.title}</h1>

      <section className="mt-6 bs-card p-5">
        <h2 className="font-semibold">{dict.dashboard.subscription.title}</h2>
        <p className="text-[var(--muted)] mt-1">
          {isPremium
            ? dict.dashboard.subscription.premiumActive.replace("{date}", formattedUntil)
            : dict.dashboard.subscription.free}
        </p>
        <div className="mt-4">
          {isPremium ? (
            <ManageSubscriptionButton
              dict={dict}
              hasSavedCard={!!profile?.yookassa_payment_method_id}
            />
          ) : (
            <Link href={`/${lang}/pricing`} className="bs-button bs-button-primary">
              {dict.dashboard.subscription.upgrade}
            </Link>
          )}
        </div>
      </section>

      <section className="mt-8">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">{dict.dashboard.myTracks.title}</h2>
          <Link href={`/${lang}/upload`} className="bs-button bs-button-primary">
            {dict.nav.upload}
          </Link>
        </div>

        {tracks.length === 0 ? (
          <p className="mt-4 text-[var(--muted)]">{dict.dashboard.myTracks.empty}</p>
        ) : (
          <ul className="mt-4 space-y-2">
            {tracks.map((t) => (
              <li
                key={t.id}
                className="bs-card p-4 flex items-center justify-between gap-3"
              >
                <div className="min-w-0">
                  <Link
                    href={`/${lang}/track/${t.id}`}
                    className="font-semibold truncate hover:underline"
                  >
                    {t.title}
                  </Link>
                  <div className="text-sm text-[var(--muted)] truncate">{t.artist}</div>
                  {t.status === "rejected" && t.rejection_reason && (
                    <div className="text-xs text-red-300 mt-1">{t.rejection_reason}</div>
                  )}
                </div>
                <span
                  className={`bs-badge ${
                    t.status === "approved"
                      ? "bs-badge-premium"
                      : t.status === "rejected"
                      ? ""
                      : ""
                  }`}
                >
                  {dict.dashboard.myTracks.status[t.status]}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
