"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import type { Dictionary } from "@/i18n/dictionaries";
import type { Locale } from "@/i18n/config";

interface Props {
  locale: Locale;
  dict: Dictionary;
}

export function ResetPasswordForm({ locale, dict }: Props) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [hasSession, setHasSession] = useState<boolean | null>(null);
  const lp = `/${locale}`;

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    supabase.auth.getSession().then(({ data }) => {
      setHasSession(!!data.session);
    });
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError(dict.auth.passwordTooShort);
      return;
    }
    if (password !== confirm) {
      setError(dict.auth.passwordsMismatch);
      return;
    }
    setLoading(true);
    try {
      const supabase = createSupabaseBrowserClient();
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      setDone(true);
      setTimeout(() => {
        router.push(`${lp}/dashboard`);
        router.refresh();
      }, 1200);
    } catch (err) {
      setError(err instanceof Error ? err.message : dict.errors.generic);
    } finally {
      setLoading(false);
    }
  }

  if (hasSession === false) {
    return (
      <div className="bs-card p-6 space-y-4">
        <div className="text-sm text-red-300 border border-red-900/50 bg-red-900/20 rounded-lg px-3 py-2">
          {dict.auth.resetNoSession}
        </div>
        <Link
          href={`${lp}/forgot-password`}
          className="bs-button bs-button-primary w-full inline-flex justify-center"
        >
          {dict.auth.resetRequestAgain}
        </Link>
      </div>
    );
  }

  if (hasSession === null) {
    return (
      <div className="bs-card p-6 text-sm text-[var(--muted)]">
        {dict.common.loading}
      </div>
    );
  }

  return (
    <div className="bs-card p-6">
      {error && (
        <div className="mb-3 text-sm text-red-300 border border-red-900/50 bg-red-900/20 rounded-lg px-3 py-2">
          {error}
        </div>
      )}
      {done ? (
        <div className="text-sm text-emerald-200 border border-emerald-900/50 bg-emerald-900/20 rounded-lg px-3 py-2">
          {dict.auth.resetSuccess}
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-3">
          <p className="text-sm text-[var(--muted)]">{dict.auth.resetIntro}</p>
          <input
            type="password"
            required
            minLength={8}
            className="bs-input"
            placeholder={dict.auth.resetNewPassword}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <input
            type="password"
            required
            minLength={8}
            className="bs-input"
            placeholder={dict.auth.resetConfirmPassword}
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />
          <button
            type="submit"
            disabled={loading}
            className="bs-button bs-button-primary w-full disabled:opacity-60"
          >
            {loading ? dict.common.loading : dict.auth.resetSubmit}
          </button>
        </form>
      )}
    </div>
  );
}
