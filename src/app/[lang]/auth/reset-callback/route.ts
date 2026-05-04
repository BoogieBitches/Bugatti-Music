import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { hasSupabaseEnv } from "@/lib/env";

/**
 * Dedicated callback for the password-reset flow. We cannot reuse the
 * generic `auth/callback` with a `?next=/reset-password` query param,
 * because Supabase drops extra query params when it redirects to
 * `redirect_to` after verifying the recovery token. Instead, we point
 * the email link straight at this route and always funnel users to
 * `/[lang]/reset-password` once the session is established.
 */
export async function GET(
  request: NextRequest,
  ctx: { params: Promise<{ lang: string }> },
) {
  const { lang } = await ctx.params;
  const url = new URL(request.url);
  const code = url.searchParams.get("code");

  if (code && hasSupabaseEnv()) {
    const supabase = await createSupabaseServerClient();
    await supabase.auth.exchangeCodeForSession(code);
  }

  return NextResponse.redirect(new URL(`/${lang}/reset-password`, request.url));
}
