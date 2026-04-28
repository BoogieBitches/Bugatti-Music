import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/** Public URL for objects in a public bucket. */
export async function getPublicUrl(
  bucket: "covers" | "audio-previews",
  path: string | null | undefined,
): Promise<string | null> {
  if (!path) return null;
  try {
    const supabase = await createSupabaseServerClient();
    const { data } = supabase.storage.from(bucket).getPublicUrl(path);
    return data.publicUrl ?? null;
  } catch {
    return null;
  }
}

/** Signed URL for objects in a private bucket. Used for premium full downloads. */
export async function createSignedUrl(
  bucket: "audio-tracks",
  path: string,
  expiresInSeconds = 60 * 5,
): Promise<string | null> {
  try {
    const admin = createSupabaseAdminClient();
    const { data, error } = await admin.storage.from(bucket).createSignedUrl(path, expiresInSeconds);
    if (error) return null;
    return data?.signedUrl ?? null;
  } catch {
    return null;
  }
}
