"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import type { Dictionary } from "@/i18n/dictionaries";
import type { Locale } from "@/i18n/config";

interface Props {
  locale: Locale;
  next: string;
  dict: Dictionary;
  mode: "login" | "signup";
}

export function LoginForm({ locale, next, dict, mode }: Props) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const lp = `/${locale}`;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);
    if (password.length < 8) {
      setError(dict.auth.passwordTooShort);
      return;
    }
    setLoading(true);
    const supabase = createSupabaseBrowserClient();
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { full_name: name || undefined },
            emailRedirectTo: `${window.location.origin}/${locale}/auth/callback`,
          },
        });
        if (error) throw error;
        setInfo(dict.auth.checkEmail);
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        router.push(next);
        router.refresh();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : dict.errors.generic);
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogle() {
    setError(null);
    const supabase = createSupabaseBrowserClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/${locale}/auth/callback?next=${encodeURIComponent(next)}`,
      },
    });
    if (error) setError(error.message);
  }

  return (
    <div className="bs-card p-6">
      {error && (
        <div className="mb-3 text-sm text-red-300 border border-red-900/50 bg-red-900/20 rounded-lg px-3 py-2">
          {error}
        </div>
      )}
      {info && (
        <div className="mb-3 text-sm text-emerald-200 border border-emerald-900/50 bg-emerald-900/20 rounded-lg px-3 py-2">
          {info}
        </div>
      )}
      <form onSubmit={handleSubmit} className="space-y-3">
        {mode === "signup" && (
          <input
            className="bs-input"
            placeholder={dict.auth.fullName}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        )}
        <input
          type="email"
          required
          className="bs-input"
          placeholder={dict.auth.email}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <input
          type="password"
          required
          minLength={8}
          className="bs-input"
          placeholder={dict.auth.password}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        {mode === "login" && (
          <div className="-mt-1 flex justify-end">
            <Link
              href={`${lp}/forgot-password`}
              className="text-xs text-[var(--muted)] hover:text-white underline underline-offset-2"
            >
              {dict.auth.forgotPassword}
            </Link>
          </div>
        )}
        <button
          type="submit"
          disabled={loading}
          className="bs-button bs-button-primary w-full disabled:opacity-60"
        >
          {loading ? dict.common.loading : mode === "login" ? dict.auth.submitLogin : dict.auth.submitSignup}
        </button>
      </form>

      <div className="my-4 flex items-center gap-3 text-xs uppercase text-[var(--muted)]">
        <span className="flex-1 h-px bg-[var(--border)]" />
        <span>{dict.auth.or}</span>
        <span className="flex-1 h-px bg-[var(--border)]" />
      </div>

      <button
        type="button"
        onClick={handleGoogle}
        className="bs-button bs-button-google w-full"
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
        {dict.auth.googleContinue}
      </button>

      <div className="mt-5 text-sm text-[var(--muted)]">
        {mode === "login" ? (
          <>
            {dict.auth.noAccount}{" "}
            <Link className="text-white underline" href={`${lp}/signup`}>
              {dict.nav.signup}
            </Link>
          </>
        ) : (
          <>
            {dict.auth.haveAccount}{" "}
            <Link className="text-white underline" href={`${lp}/login`}>
              {dict.nav.login}
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
