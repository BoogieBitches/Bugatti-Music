"use client";

import { useEffect, useRef } from "react";

interface Props {
  /** Bot username without the leading "@". From NEXT_PUBLIC_TELEGRAM_BOT_USERNAME. */
  botUsername: string;
  /** Where /api/auth/telegram should land users on success. */
  lang: "ru" | "en";
  next: string;
  hint?: string;
}

/**
 * Telegram Login Widget wrapper.
 *
 * Telegram serves the button itself from telegram.org as an iframe — we can't
 * style it directly. We just mount their script tag inside our container; the
 * script self-injects the iframe. The button shows the user's avatar and a
 * "Log in with Telegram" label once the script has loaded.
 *
 * Auth flow: when the user authorises, Telegram redirects the whole page to
 * `data-auth-url` with the auth payload appended as a query string. Our
 * /api/auth/telegram route handler verifies the HMAC and continues the
 * Supabase sign-in flow from there. We pass `?lang=...&next=...` so the
 * handler knows which locale to use for the post-login redirect.
 */
export function TelegramLoginButton({ botUsername, lang, next, hint }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Strip whatever was there before (e.g. an iframe left over from a previous
    // mount during client-side navigation).
    container.innerHTML = "";

    const authUrl = new URL("/api/auth/telegram", window.location.origin);
    authUrl.searchParams.set("lang", lang);
    authUrl.searchParams.set("next", next);

    const script = document.createElement("script");
    script.async = true;
    script.src = "https://telegram.org/js/telegram-widget.js?22";
    script.setAttribute("data-telegram-login", botUsername);
    script.setAttribute("data-size", "large");
    script.setAttribute("data-radius", "10");
    script.setAttribute("data-userpic", "false");
    script.setAttribute("data-request-access", "write");
    script.setAttribute("data-auth-url", authUrl.toString());

    container.appendChild(script);

    return () => {
      container.innerHTML = "";
    };
  }, [botUsername, lang, next]);

  return (
    <div className="mt-3">
      <div ref={containerRef} className="flex justify-center min-h-[44px]" />
      {hint && (
        <p className="mt-2 text-center text-xs text-[var(--muted)] leading-relaxed">
          {hint}
        </p>
      )}
    </div>
  );
}
