"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import type { Dictionary } from "@/i18n/dictionaries";
import type { Locale } from "@/i18n/config";
import { TelegramLoginButton } from "@/components/TelegramLoginButton";

interface Props {
  locale: Locale;
  next: string;
  dict: Dictionary;
  mode?: "login" | "signup";
}

export function LoginForm({ locale, next, dict, mode = "login" }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [urlErrorDismissed, setUrlErrorDismissed] = useState(false);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [loading, setLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [checkEmail, setCheckEmail] = useState(false);

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

  const error = formError ?? (urlErrorDismissed ? null : urlError);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    setUrlErrorDismissed(true);

    if (password.length < 8) {
      setFormError(dict.auth.passwordTooShort);
      return;
    }

    setLoading(true);
    const supabase = createSupabaseBrowserClient();

    if (mode === "signup") {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { full_name: fullName },
          emailRedirectTo: `${window.location.origin}/${locale}/auth/callback?next=${encodeURIComponent(next)}`,
        },
      });
      if (error) {
        setFormError(error.message);
        setLoading(false);
        return;
      }
      setCheckEmail(true);
      setLoading(false);
      return;
    }

    // login
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setFormError(dict.auth.invalidCreds);
      setLoading(false);
      return;
    }
    router.push(next);
    router.refresh();
  }

  if (checkEmail) {
    return (
      <div className="bs-card p-6 text-center text-sm text-[var(--muted)]">
        {dict.auth.checkEmail}
      </div>
    );
  }

  return (
    <div className="bs-card p-6 flex flex-col gap-4">
      {error && (
        <div
          className="text-sm text-red-300 border border-red-900/50 bg-red-900/20 rounded-lg px-3 py-2 cursor-pointer"
          onClick={() => { setFormError(null); setUrlErrorDismissed(true); }}
        >
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        {mode === "signup" && (
          <input
            type="text"
            required
            placeholder={dict.auth.fullName}
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            className="bs-input w-full"
          />
        )}
        <input
          type="email"
          required
          placeholder={dict.auth.email}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="bs-input w-full"
        />
        <input
          type="password"
          required
          placeholder={dict.auth.password}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="bs-input w-full"
        />
        {mode === "login" && (
          <div className="text-right">
            <a
              href={`/${locale}/forgot-password`}
              className="text-xs text-[var(--muted)] hover:text-white transition-colors"
            >
              {dict.auth.forgotPassword}
            </a>
          </div>
        )}
        <button
          type="submit"
          disabled={loading}
          className="bs-button bs-button-primary w-full disabled:opacity-60"
        >
          {loading
            ? dict.common.loading
            : mode === "signup"
            ? dict.auth.submitSignup
            : dict.auth.submitLogin}
        </button>
      </form>

      {mode === "login" && (
        <p className="text-center text-xs text-[var(--muted)]">
          {dict.auth.noAccount}{" "}
          <a href={`/${locale}/signup`} className="underline hover:text-white transition-colors">
            {dict.auth.submitSignup}
          </a>
        </p>
      )}
      {mode === "signup" && (
        <p className="text-center text-xs text-[var(--muted)]">
          {dict.auth.haveAccount}{" "}
          <a href={`/${locale}/login`} className="underline hover:text-white transition-colors">
            {dict.auth.submitLogin}
          </a>
        </p>
      )}

      {telegramEnabled && (
        <>
          <div className="flex items-center gap-3 text-xs uppercase tracking-wider text-[var(--muted)]">
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
    </div>
  );
}
