"use client";

import Link from "next/link";
import Script from "next/script";
import { useState } from "react";
import type { Dictionary } from "@/i18n/dictionaries";
import type { Locale } from "@/i18n/config";

interface Props {
  locale: Locale;
  dict: Dictionary;
  isLoggedIn: boolean;
  isPremium: boolean;
  cloudpaymentsReady: boolean;
}

declare global {
  interface Window {
    cp?: {
      CloudPayments: new () => {
        pay: (
          action: "charge" | "auth",
          options: Record<string, unknown>,
          callbacks: {
            onSuccess?: (options: unknown) => void;
            onFail?: (reason: string, options: unknown) => void;
            onComplete?: (paymentResult: unknown, options: unknown) => void;
          },
        ) => void;
      };
    };
  }
}

export function CheckoutButton({
  locale,
  dict,
  isLoggedIn,
  isPremium,
  cloudpaymentsReady,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isLoggedIn) {
    return (
      <Link
        href={`/${locale}/login?next=/${locale}/pricing`}
        className="bs-button bs-button-primary w-full"
      >
        {dict.nav.login}
      </Link>
    );
  }

  if (isPremium) {
    return (
      <Link href={`/${locale}/dashboard`} className="bs-button w-full">
        {dict.dashboard.subscription.manage}
      </Link>
    );
  }

  if (!cloudpaymentsReady) {
    return (
      <div className="bs-button w-full opacity-60 pointer-events-none">
        CloudPayments not configured
      </div>
    );
  }

  async function handle() {
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/cloudpayments/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ locale }),
      });
      const data = await res.json();
      if (!res.ok || !data.publicId) throw new Error(data.error ?? "Failed");

      const widget = new window.cp!.CloudPayments();
      widget.pay(
        "charge",
        {
          publicId: data.publicId,
          description: data.description,
          amount: data.amount,
          currency: data.currency,
          accountId: data.accountId,
          email: data.email ?? undefined,
          requireEmail: false,
          skin: "mini",
          autoClose: 3,
          data: {
            CloudPayments: {
              CustomerReceipt: {
                Items: [
                  {
                    label: data.description,
                    price: data.amount,
                    quantity: 1,
                    amount: data.amount,
                    vat: null,
                    method: 0,
                    object: 0,
                  },
                ],
                taxationSystem: 0,
                email: data.email ?? "",
              },
            },
          },
        },
        {
          onSuccess: () => {
            window.location.href = `/${locale}/dashboard?checkout=processing`;
          },
          onFail: (_reason: string) => {
            setError(dict.common.error ?? "Платёж не прошёл. Попробуйте ещё раз.");
            setLoading(false);
          },
        },
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
      setLoading(false);
    }
  }

  return (
    <>
      <Script
        src="https://widget.cloudpayments.ru/bundles/cloudpayments.js"
        strategy="lazyOnload"
      />
      <div>
        <button
          onClick={handle}
          disabled={loading}
          className="bs-button bs-button-primary w-full"
        >
          {loading ? dict.common.loading : dict.pricing.premium.cta}
        </button>
        {error && <div className="text-xs text-red-300 mt-2">{error}</div>}
      </div>
    </>
  );
}
