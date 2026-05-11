import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { env, hasSupabaseEnv } from "@/lib/env";
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
 *   4. Generate a magic-link action_link and 302 the browser to it. Supabase
 *      verifies the token and PKCE-redirects to /[lang]/auth/callback?code=...,
 *      which our existing handler exchanges for a session cookie. From the
 *      browser's perspective this is identical to a Google sign-in landing.
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

  // Issue a magic-link action_link pointed at our normal /auth/callback.
  // The redirect_to has to be on a domain explicitly allowed in the Supabase
  // dashboard (Authentication → URL Configuration). We use APP_URL which is
  // the same origin the rest of the site runs on.
  const redirectTo = `${env.appUrl()}/${lang}/auth/callback?next=${encodeURIComponent(next)}`;
  const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email,
    options: { redirectTo },
  });
  if (linkErr || !linkData?.properties?.action_link) {
    console.error("[telegram-auth] generateLink failed", linkErr);
    return redirectToLogin(reqUrl, lang, next, "telegram_session_failed");
  }

  // 303 ensures the browser switches to GET when following the redirect.
  return NextResponse.redirect(linkData.properties.action_link, 303);
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
 * Supabase JS doesn't expose `getUserByEmail` on the admin API, so we query
 * auth.users directly via the service-role REST endpoint. The auth schema is
 * exposed via PostgREST when the service role is in use.
 */
async function findUserIdByEmail(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  email: string,
): Promise<string | null> {
  type AuthUserRow = { id: string };
  const { data, error } = await admin
    .schema("auth")
    .from("users")
    .select("id")
    .eq("email", email)
    .maybeSingle<AuthUserRow>();
  if (error || !data) return null;
  return data.id;
}
