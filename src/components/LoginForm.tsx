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

      <button onClick={handleGoogle} className="bs-button w-full">
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
