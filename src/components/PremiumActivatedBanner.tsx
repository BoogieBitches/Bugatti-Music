"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

interface Props {
  title: string;
  hint: string;
}

export function PremiumActivatedBanner({ title, hint }: Props) {
  const router = useRouter();
  const cleaned = useRef(false);

  useEffect(() => {
    if (cleaned.current) return;
    cleaned.current = true;
    // Clean ?checkout=processing from URL without triggering a page reload
    const url = new URL(window.location.href);
    url.searchParams.delete("checkout");
    router.replace(url.pathname + (url.search || ""), { scroll: false });
  }, [router]);

  return (
    <div className="mt-4 rounded-xl border border-emerald-400/40 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-200 flex items-start gap-3">
      <span className="text-xl leading-none mt-0.5">✓</span>
      <div>
        <p className="font-semibold">{title}</p>
        <p className="mt-0.5 text-emerald-300/80">{hint}</p>
      </div>
    </div>
  );
}
