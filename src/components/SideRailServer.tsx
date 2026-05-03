import { getDictionary } from "@/i18n/dictionaries";
import type { Locale } from "@/i18n/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { hasSupabaseEnv } from "@/lib/env";
import { SideRail } from "./SideRail";

export async function SideRailServer({ locale }: { locale: Locale }) {
  const dict = await getDictionary(locale);

  let isAuthed = false;
  let isAdmin = false;
  if (hasSupabaseEnv()) {
    try {
      const supabase = await createSupabaseServerClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        isAuthed = true;
        const { data: profile } = await supabase
          .from("profiles")
          .select("role")
          .eq("id", user.id)
          .maybeSingle();
        isAdmin = profile?.role === "admin";
      }
    } catch {
      // Supabase unreachable — render anonymous rail.
    }
  }

  return (
    <SideRail
      locale={locale}
      dict={dict}
      isAuthed={isAuthed}
      isAdmin={isAdmin}
    />
  );
}
