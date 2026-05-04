"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import type { Dictionary } from "@/i18n/dictionaries";
import type { Locale } from "@/i18n/config";

interface Props {
  locale: Locale;
  dict: Dictionary;
}

export function ForgotPasswordForm({ locale, dict }: Props) {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const lp = `/${locale}`;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!email.trim()) return;
    setLoading(true);
    try {
      const supabase = createSupabaseBrowserClient();
      const redirectTo = `${window.location.origin}/${locale}/auth/callback?next=${encodeURIComponent(`/${locale}/reset-password`)}`;
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo,
      });
      if (error) throw error;
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : dict.errors.generic);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="bs-card p-6">
      {error && (
        <div className="mb-3 text-sm text-red-300 border border-red-900/50 bg-red-900/20 rounded-lg px-3 py-2">
          {error}
        </div>
      )}
      {sent ? (
        <div className="space-y-4">
          <div className="text-sm text-emerald-200 border border-emerald-900/50 bg-emerald-900/20 rounded-lg px-3 py-2">
            {dict.auth.forgotSent}
          </div>
          <Link
            href={`${lp}/login`}
            className="bs-button bs-button-primary w-full inline-flex justify-center"
          >
            {dict.auth.backToLogin}
          </Link>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-3">
          <p className="text-sm text-[var(--muted)]">{dict.auth.forgotIntro}</p>
          <input
            type="email"
            required
            className="bs-input"
            placeholder={dict.auth.email}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <button
            type="submit"
            disabled={loading}
            className="bs-button bs-button-primary w-full disabled:opacity-60"
          >
            {loading ? dict.common.loading : dict.auth.forgotSubmit}
          </button>
          <div className="pt-2 text-sm">
            <Link
              href={`${lp}/login`}
              className="text-[var(--muted)] hover:text-white underline underline-offset-2"
            >
              {dict.auth.backToLogin}
            </Link>
          </div>
        </form>
      )}
    </div>
  );
}
