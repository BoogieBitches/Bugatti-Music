"use client";

import Link from "next/link";
import { useState } from "react";
import type { Dictionary } from "@/i18n/dictionaries";
import type { Locale } from "@/i18n/config";

interface Props {
  locale: Locale;
  dict: Dictionary;
  isLoggedIn: boolean;
  isPremium: boolean;
  yookassaReady: boolean;
}

export function CheckoutButton({ locale, dict, isLoggedIn, isPremium, yookassaReady }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isLoggedIn) {
    return (
      <Link href={`/${locale}/login?next=/${locale}/pricing`} className="bs-button bs-button-primary w-full">
        {dict.nav.login}
      </Link>
    );
  }

  if (isPremium) {
    return (
      <button
        onClick={async () => {
          setLoading(true);
          try {
            const res = await fetch("/api/yookassa/portal", { method: "POST" });
            const j = await res.json();
            if (j.url) window.location.href = j.url;
            else alert(j.error ?? "Failed");
          } finally {
            setLoading(false);
          }
        }}
        className="bs-button w-full"
        disabled={loading}
      >
        {loading ? dict.common.loading : dict.dashboard.subscription.manage}
      </button>
    );
  }

  if (!yookassaReady) {
    return (
      <div className="bs-button w-full opacity-60 pointer-events-none">
        ЮKassa not configured
      </div>
    );
  }

  async function handle() {
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/yookassa/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ locale }),
      });
      const j = await res.json();
      if (j.url) window.location.href = j.url;
      else throw new Error(j.error ?? "Failed");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <button onClick={handle} disabled={loading} className="bs-button bs-button-primary w-full">
        {loading ? dict.common.loading : dict.pricing.premium.cta}
      </button>
      {error && <div className="text-xs text-red-300 mt-2">{error}</div>}
    </div>
  );
}
