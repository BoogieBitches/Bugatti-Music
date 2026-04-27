import "server-only";
import Stripe from "stripe";
import { env } from "@/lib/env";

let cached: Stripe | null = null;

export function getStripe(): Stripe {
  if (cached) return cached;
  cached = new Stripe(env.stripeSecretKey(), {
    apiVersion: "2025-01-27.acacia" as Stripe.LatestApiVersion,
    typescript: true,
  });
  return cached;
}
