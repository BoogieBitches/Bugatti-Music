import { isLocale } from "@/i18n/config";
import { notFound, redirect } from "next/navigation";
import { getDictionary } from "@/i18n/dictionaries";
import { hasSupabaseEnv } from "@/lib/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { TrackWithGenre } from "@/types/db";
import { AdminTrackRow } from "@/components/AdminTrackRow";

export default async function AdminPage({ params }: PageProps<"/[lang]/admin">) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();
  if (!hasSupabaseEnv()) notFound();
  const dict = await getDictionary(lang);

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/${lang}/login?next=/${lang}/admin`);

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  if (profile?.role !== "admin") notFound();

  const { data: pending } = await supabase
    .from("tracks")
    .select(
      "*, genre:genres(id, slug, name_en, name_ru), uploader:profiles(id, full_name, avatar_url)",
    )
    .eq("status", "pending")
    .order("created_at", { ascending: false });

  const { data: recentlyApproved } = await supabase
    .from("tracks")
    .select(
      "*, genre:genres(id, slug, name_en, name_ru), uploader:profiles(id, full_name, avatar_url)",
    )
    .eq("status", "approved")
    .order("approved_at", { ascending: false })
    .limit(20);

  const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const publicCover = (p: string | null) =>
    p && baseUrl ? `${baseUrl}/storage/v1/object/public/covers/${p}` : null;
  const publicPreview = (p: string | null) =>
    p && baseUrl ? `${baseUrl}/storage/v1/object/public/audio-previews/${p}` : null;

  const decorate = (t: TrackWithGenre) => ({
    track: t,
    previewUrl: publicPreview(t.preview_path),
    imageUrl: publicCover(t.cover_image_path),
    videoUrl: publicCover(t.cover_video_path),
  });

  return (
    <div className="max-w-6xl mx-auto px-4 py-10">
      <h1 className="text-3xl md:text-4xl font-bold tracking-tight">{dict.admin.title}</h1>

      <section className="mt-8">
        <h2 className="font-semibold">{dict.admin.queue}</h2>
        {(!pending || pending.length === 0) ? (
          <p className="text-[var(--muted)] mt-2">{dict.admin.noPending}</p>
        ) : (
          <ul className="mt-3 space-y-3">
            {(pending as TrackWithGenre[]).map((t) => (
              <AdminTrackRow key={t.id} {...decorate(t)} dict={dict} mode="pending" />
            ))}
          </ul>
        )}
      </section>

      <section className="mt-12">
        <h2 className="font-semibold">{dict.admin.approved}</h2>
        {recentlyApproved && recentlyApproved.length > 0 && (
          <ul className="mt-3 space-y-3">
            {(recentlyApproved as TrackWithGenre[]).map((t) => (
              <AdminTrackRow key={t.id} {...decorate(t)} dict={dict} mode="approved" />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
