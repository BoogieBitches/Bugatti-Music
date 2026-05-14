"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Dictionary } from "@/i18n/dictionaries";

interface Props {
  dict: Dictionary;
  hasSavedCard: boolean;
}

/**
 * Subscription management for Premium users. Shows the saved-card status
 * and a self-service "Unbind card" button that stops the daily autopay
 * cron from charging the user again. Premium access stays until
 * premium_until passes naturally.
 */
export function ManageSubscriptionButton({ dict, hasSavedCard }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const s = dict.dashboard.subscription;

  if (!hasSavedCard) {
    return <p className="text-sm text-[var(--muted)]">{s.noCard}</p>;
  }

  async function unbind() {
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/cloudpayments/portal", { method: "POST" });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "Failed");
      setConfirmOpen(false);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <p className="text-sm text-[var(--muted)] mb-3">{s.cardSaved}</p>
      {!confirmOpen ? (
        <button
          type="button"
          onClick={() => setConfirmOpen(true)}
          className="bs-button bs-button-ghost"
        >
          {s.unbindCard}
        </button>
      ) : (
        <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
          <p className="text-sm mb-3">{s.unbindConfirm}</p>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={unbind}
              disabled={loading}
              className="bs-button bs-button-primary"
            >
              {loading ? dict.common.loading : s.unbindConfirmYes}
            </button>
            <button
              type="button"
              onClick={() => setConfirmOpen(false)}
              disabled={loading}
              className="bs-button bs-button-ghost"
            >
              {s.unbindConfirmNo}
            </button>
          </div>
          {error && <div className="text-xs text-red-300 mt-2">{error}</div>}
        </div>
      )}
    </div>
  );
}
