import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { hasSupabaseEnv } from "@/lib/env";
import {
  telegramDisplayName,
  telegramSyntheticEmail,
  verifyTelegramAuth,
} from "@/lib/telegram";

export const runtime = "nodejs";
// Auth side-effects (createUser, generateLink) must not be cached anywhere.
export const dynamic = "force-dynamic";

const ALLOWED_LANGS = new Set(["ru", "en"]);

/**
 * Telegram Login Widget endpoint.
 *
 * Widget config: <script ... data-auth-url="/api/auth/telegram?lang=ru&next=/ru">.
 * Telegram redirects the browser here with the auth payload in the query string
 * (id, first_name, last_name, username, photo_url, auth_date, hash). We:
 *
 *   1. Verify the HMAC signature with the bot token (proves Telegram signed it).
 *   2. Reject payloads older than 1h (replay defense, enforced in lib/telegram).
 *   3. Provision or update the matching Supabase user via the service role.
 *   4. Mint a magic-link OTP, verify it through the SSR server client to write
 *      the auth cookies onto the response, then 303 to `next`. We deliberately
 *      do NOT redirect the browser to Supabase's `action_link`: that flow
 *      returns the session in the URL hash (`#access_token=...`), which never
 *      reaches the server and so never becomes a cookie.
 */
export async function GET(req: NextRequest) {
  const reqUrl = new URL(req.url);
  const lang = pickLang(reqUrl.searchParams.get("lang"));
  const next = pickNext(reqUrl.searchParams.get("next"), lang);

  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken || !hasSupabaseEnv()) {
    return redirectToLogin(reqUrl, lang, next, "telegram_not_configured");
  }

  // Collect the Telegram-supplied params (everything except our own lang/next).
  const payload: Record<string, unknown> = {};
  for (const [key, value] of reqUrl.searchParams.entries()) {
    if (key === "lang" || key === "next") continue;
    if (key === "id" || key === "auth_date") {
      const n = Number(value);
      payload[key] = Number.isFinite(n) ? n : value;
    } else {
      payload[key] = value;
    }
  }

  const verified = verifyTelegramAuth(payload, botToken);
  if (!verified) {
    return redirectToLogin(reqUrl, lang, next, "telegram_invalid_signature");
  }

  const admin = createSupabaseAdminClient();
  const email = telegramSyntheticEmail(verified.id);
  const displayName = telegramDisplayName(verified);
  const userMetadata = {
    full_name: displayName,
    name: displayName,
    avatar_url: verified.photo_url ?? null,
    telegram_id: verified.id,
    telegram_username: verified.username ?? null,
    provider: "telegram",
  };

  // Provision-or-refresh. createUser fails if the email already exists; in
  // that case we look the user up and update their metadata to keep avatar
  // and username fresh.
  const { data: createData, error: createErr } = await admin.auth.admin.createUser({
    email,
    email_confirm: true,
    user_metadata: userMetadata,
  });

  if (createErr) {
    const msg = createErr.message ?? "";
    const alreadyExists =
      /already.*registered|already.*exists|email_exists|user_exists|duplicate/i.test(msg);
    if (!alreadyExists) {
      console.error("[telegram-auth] createUser failed", createErr);
      return redirectToLogin(reqUrl, lang, next, "telegram_provision_failed");
    }
    const existingId = await findUserIdByEmail(admin, email);
    if (!existingId) {
      console.error("[telegram-auth] user said to exist but was not found", { email });
      return redirectToLogin(reqUrl, lang, next, "telegram_provision_failed");
    }
    const { error: updateErr } = await admin.auth.admin.updateUserById(existingId, {
      user_metadata: userMetadata,
    });
    if (updateErr) {
      // Non-fatal: still try to sign them in.
      console.warn("[telegram-auth] updateUserById warning", updateErr);
    }
  } else if (!createData?.user) {
    console.error("[telegram-auth] createUser returned no user without error");
    return redirectToLogin(reqUrl, lang, next, "telegram_provision_failed");
  }

  // Mint a magic-link OTP server-side, then verify it through our SSR server
  // client so the auth cookies land on the outgoing response. Following the
  // action_link directly puts tokens in the URL hash (implicit flow), which
  // never reaches the server and so never gets exchanged for a cookie.
  const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email,
  });
  if (linkErr || !linkData?.properties?.email_otp) {
    console.error("[telegram-auth] generateLink failed", linkErr);
    return redirectToLogin(reqUrl, lang, next, "telegram_session_failed");
  }

  const server = await createSupabaseServerClient();
  const { error: verifyErr } = await server.auth.verifyOtp({
    email,
    token: linkData.properties.email_otp,
    type: "magiclink",
  });
  if (verifyErr) {
    console.error("[telegram-auth] verifyOtp failed", verifyErr);
    return redirectToLogin(reqUrl, lang, next, "telegram_session_failed");
  }

  // verifyOtp wrote the auth cookies via the SSR cookies handler; just
  // redirect into the protected area. 303 forces the browser to GET.
  return NextResponse.redirect(new URL(next, reqUrl), 303);
}

function pickLang(raw: string | null): "ru" | "en" {
  if (raw && ALLOWED_LANGS.has(raw)) return raw as "ru" | "en";
  return "ru";
}

function pickNext(raw: string | null, lang: "ru" | "en"): string {
  // Same-origin-only: reject anything that isn't a leading-slash path.
  if (raw && raw.startsWith("/") && !raw.startsWith("//")) return raw;
  return `/${lang}`;
}

function redirectToLogin(
  reqUrl: URL,
  lang: string,
  next: string,
  errorCode: string,
): NextResponse {
  const target = new URL(`/${lang}/login`, reqUrl);
  target.searchParams.set("error", errorCode);
  target.searchParams.set("next", next);
  return NextResponse.redirect(target, 303);
}

/**
 * Supabase JS doesn't expose `getUserByEmail` on the admin API and PostgREST
 * refuses to query the `auth` schema (PGRST106). The remaining option is
 * `listUsers`, which paginates over `auth.users`. For our scale (telegram
 * sign-ins per minute, not per second), scanning the first page is fine.
 *
 * If user count grows past ~1k, switch to the GoTrue admin REST endpoint
 * directly: `GET /auth/v1/admin/users?email=<email>`.
 */
async function findUserIdByEmail(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  email: string,
): Promise<string | null> {
  const { data, error } = await admin.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  });
  if (error || !data?.users) return null;
  const match = data.users.find((u) => u.email === email);
  return match?.id ?? null;
}
