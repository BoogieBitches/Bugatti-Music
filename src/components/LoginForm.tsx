"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import type { Dictionary } from "@/i18n/dictionaries";
import type { Locale } from "@/i18n/config";
import { TelegramLoginButton } from "@/components/TelegramLoginButton";

interface Props {
  locale: Locale;
  next: string;
  dict: Dictionary;
}

// Auth providers:
//   - Telegram (only if NEXT_PUBLIC_TELEGRAM_BOT_USERNAME is configured)
//
// Google is temporarily hidden.
// Email/password is intentionally hidden because the default Supabase SMTP
// is rate-limited too aggressively to ship without a custom mail provider.
export function LoginForm({ locale, next, dict }: Props) {
  const [urlErrorDismissed, setUrlErrorDismissed] = useState(false);
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

  return (
    <div className="bs-card p-6">
      {urlError && !urlErrorDismissed && (
        <div
          className="mb-3 text-sm text-red-300 border border-red-900/50 bg-red-900/20 rounded-lg px-3 py-2 cursor-pointer"
          onClick={() => setUrlErrorDismissed(true)}
        >
          {urlError}
        </div>
      )}

      {telegramEnabled ? (
        <TelegramLoginButton
          botUsername={botUsername}
          lang={locale}
          next={next}
          hint={dict.auth.telegramHint}
        />
      ) : (
        <p className="text-center text-sm text-[var(--muted)]">
          {dict.auth.googleOnlyHint}
        </p>
      )}

      <p className="mt-5 text-center text-xs text-[var(--muted)] leading-relaxed">
        {dict.auth.socialOnlyHint}
      </p>
    </div>
  );
}
