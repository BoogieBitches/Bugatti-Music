import { isLocale } from "@/i18n/config";
import { notFound } from "next/navigation";
import { AIMixStudioTabs } from "@/components/AIMixStudioTabs";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export default async function AIMixStudioPage({
  params,
}: PageProps<"/[lang]/ai-mix-studio">) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();

  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  let role: "user" | "admin" = "user";
  let isPremium = false;
  let generationsUsed = 0;
  let isLoggedIn = false;

  if (user) {
    isLoggedIn = true;
    const admin = createSupabaseAdminClient();
    const { data: profile } = await admin
      .from("profiles")
      .select("role, is_premium, premium_until, mix_generations_count")
      .eq("id", user.id)
      .single();

    if (profile) {
      role = profile.role as "user" | "admin";
      isPremium =
        profile.is_premium &&
        (!profile.premium_until || new Date(profile.premium_until) > new Date());
      generationsUsed = profile.mix_generations_count ?? 0;
    }
  }

  return (
    <AIMixStudioTabs
      userRole={role}
      isPremium={isPremium}
      generationsUsed={generationsUsed}
      isLoggedIn={isLoggedIn}
    />
  );
}
