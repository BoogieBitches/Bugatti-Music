"use client";

import { useState } from "react";
import type { Dictionary } from "@/i18n/dictionaries";

export function ManageSubscriptionButton({ dict }: { dict: Dictionary }) {
  const [loading, setLoading] = useState(false);
  return (
    <button
      onClick={async () => {
        setLoading(true);
        try {
          const res = await fetch("/api/stripe/portal", { method: "POST" });
          const j = await res.json();
          if (j.url) window.location.href = j.url;
        } finally {
          setLoading(false);
        }
      }}
      disabled={loading}
      className="bs-button"
    >
      {loading ? dict.common.loading : dict.dashboard.subscription.manage}
    </button>
  );
}
