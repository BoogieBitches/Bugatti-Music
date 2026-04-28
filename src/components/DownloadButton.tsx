"use client";

import Link from "next/link";
import { useState } from "react";
import { Download, Lock } from "lucide-react";
import type { Dictionary } from "@/i18n/dictionaries";
import type { Locale } from "@/i18n/config";

interface Props {
  trackId: string;
  locale: Locale;
  isLoggedIn: boolean;
  canDownload: boolean;
  dict: Dictionary;
}

export function DownloadButton({ trackId, locale, isLoggedIn, canDownload, dict }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isLoggedIn) {
    return (
      <Link href={`/${locale}/login?next=/${locale}/track/${trackId}`} className="bs-button">
        <Lock size={16} /> {dict.track.loginToDownload}
      </Link>
    );
  }

  if (!canDownload) {
    return (
      <Link href={`/${locale}/pricing`} className="bs-button bs-button-primary">
        <Lock size={16} /> {dict.track.premiumGate}
      </Link>
    );
  }

  async function handle() {
    setError(null);
    setLoading(true);
    try {
      const res = await fetch(`/api/tracks/${trackId}/download`, { method: "POST" });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? "Failed");
      }
      const j = (await res.json()) as { url: string };
      window.location.href = j.url;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <button onClick={handle} disabled={loading} className="bs-button bs-button-primary">
        <Download size={16} /> {loading ? dict.common.loading : dict.track.downloadFull}
      </button>
      {error && <div className="text-xs text-red-300 mt-2">{error}</div>}
    </div>
  );
}
