"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import type { Dictionary } from "@/i18n/dictionaries";
import type { Locale } from "@/i18n/config";
import { TelegramLoginButton } from "@/components/TelegramLoginButton";

interface Props {
  locale: Locale;
  next: string;
  dict: Dictionary;
}

// Auth providers:
//   - Google (always available)
//   - Telegram (only if NEXT_PUBLIC_TELEGRAM_BOT_USERNAME is configured)
//
// Email/password is intentionally hidden because the default Supabase SMTP
// is rate-limited too aggressively to ship without a custom mail provider.
// Google + Telegram cover ~all of the target audience.
export function LoginForm({ locale, next, dict }: Props) {
  // Errors come from two sources we treat uniformly:
  //   1. /api/auth/telegram redirects back with ?error=... — derived from the URL.
  //   2. Google sign-in failures — set as local state when handleGoogle errors.
  // The Google handler sets `urlErrorDismissed=true` so a fresh failure
  // doesn't get overshadowed by a stale URL error from a previous attempt.
  const [googleError, setGoogleError] = useState<string | null>(null);
  const [urlErrorDismissed, setUrlErrorDismissed] = useState(false);
  const [loading, setLoading] = useState(false);
  const searchParams = useSearchParams();

  const botUsername = process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME ?? "";
  const telegramEnabled = botUsername.length > 0;

  const urlError = (() => {
    if (urlErrorDismissed) return null;
    const code = searchParams.get("error");
    if (!code) return null;
    if (code === "telegram_invalid_signature") return dict.auth.telegramErrorInvalid;
    if (
      code === "telegram_not_configured" ||
      code === "telegram_provision_failed" ||
      code === "telegram_session_failed"
    ) {
      return dict.auth.telegramErrorConfig;
    }
    return null;
  })();
  const error = googleError ?? urlError;

  async function handleGoogle() {
    setGoogleError(null);
    setUrlErrorDismissed(true);
    setLoading(true);
    const supabase = createSupabaseBrowserClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/${locale}/auth/callback?next=${encodeURIComponent(next)}`,
      },
    });
    if (error) {
      setGoogleError(error.message);
      setLoading(false);
    }
    // If no error, the browser is being redirected to Google — leave the
    // loading state on to prevent a double-click.
  }

  return (
    <div className="bs-card p-6">
      {error && (
        <div className="mb-3 text-sm text-red-300 border border-red-900/50 bg-red-900/20 rounded-lg px-3 py-2">
          {error}
        </div>
      )}

      <button
        type="button"
        onClick={handleGoogle}
        disabled={loading}
        className="bs-button bs-button-google w-full disabled:opacity-60"
      >
        <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden>
          <path
            fill="#4285F4"
            d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z"
          />
          <path
            fill="#34A853"
            d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z"
          />
          <path
            fill="#FBBC05"
            d="M3.964 10.706A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.706V4.962H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.038l3.007-2.332z"
          />
          <path
            fill="#EA4335"
            d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.962L3.964 7.294C4.672 5.167 6.656 3.58 9 3.58z"
          />
        </svg>
        {loading ? dict.common.loading : dict.auth.googleContinue}
      </button>

      {telegramEnabled && (
        <>
          <div className="flex items-center gap-3 my-4 text-xs uppercase tracking-wider text-[var(--muted)]">
            <span className="flex-1 h-px bg-white/10" />
            <span>{dict.auth.or}</span>
            <span className="flex-1 h-px bg-white/10" />
          </div>
          <TelegramLoginButton
            botUsername={botUsername}
            lang={locale}
            next={next}
            hint={dict.auth.telegramHint}
          />
        </>
      )}

      <p className="mt-5 text-center text-xs text-[var(--muted)] leading-relaxed">
        {telegramEnabled ? dict.auth.socialOnlyHint : dict.auth.googleOnlyHint}
      </p>
    </div>
  );
}
