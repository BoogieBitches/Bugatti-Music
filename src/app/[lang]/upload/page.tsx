import { isLocale } from "@/i18n/config";
import { notFound, redirect } from "next/navigation";
import { getDictionary } from "@/i18n/dictionaries";
import { hasSupabaseEnv } from "@/lib/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { UploadForm } from "@/components/UploadForm";
import type { Genre } from "@/types/db";

export default async function UploadPage({ params }: PageProps<"/[lang]/upload">) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();
  if (!hasSupabaseEnv()) notFound();
  const dict = await getDictionary(lang);

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/${lang}/login?next=/${lang}/upload`);

  const { data } = await supabase.from("genres").select("*").order("position");
  const genres = (data ?? []) as Genre[];

  return (
    <div className="max-w-3xl mx-auto px-4 py-12">
      <h1 className="text-3xl md:text-4xl font-bold tracking-tight">{dict.upload.title}</h1>
      <p className="text-[var(--muted)] mt-2">{dict.upload.intro}</p>
      <div className="mt-8">
        <UploadForm locale={lang} dict={dict} genres={genres} userId={user.id} />
      </div>
    </div>
  );
}
