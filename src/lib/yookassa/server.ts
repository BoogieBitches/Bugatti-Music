import "server-only";
import { YooCheckout } from "@a2seven/yoo-checkout";
import { env } from "@/lib/env";

let cached: YooCheckout | null = null;

export function getYooCheckout(): YooCheckout {
  if (cached) return cached;
  cached = new YooCheckout({
    shopId: env.yookassaShopId(),
    secretKey: env.yookassaSecretKey(),
  });
  return cached;
}

export const YOOKASSA_CURRENCY = "RUB" as const;
export const YOOKASSA_PREMIUM_AMOUNT = "499.00" as const;
