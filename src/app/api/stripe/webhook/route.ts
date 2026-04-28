import { NextResponse, type NextRequest } from "next/server";
import type Stripe from "stripe";
import { getStripe } from "@/lib/stripe/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { env, hasStripeEnv, hasSupabaseEnv } from "@/lib/env";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  if (!hasStripeEnv() || !hasSupabaseEnv()) {
    return NextResponse.json({ error: "Not configured" }, { status: 500 });
  }
  const sig = request.headers.get("stripe-signature");
  if (!sig) return NextResponse.json({ error: "No signature" }, { status: 400 });
  const body = await request.text();

  const stripe = getStripe();
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, env.stripeWebhookSecret());
  } catch (err) {
    return NextResponse.json(
      { error: `Webhook signature verification failed: ${(err as Error).message}` },
      { status: 400 },
    );
  }

  const admin = createSupabaseAdminClient();

  function readPeriodEnd(sub: Stripe.Subscription): number | null {
    // In Stripe API ≤ 2025, current_period_end lives on the subscription root.
    // In API 2025-08+ (e.g. 2026-04-22.dahlia) it moved to subscription.items.data[i].current_period_end.
    const root = (sub as unknown as { current_period_end?: number }).current_period_end;
    if (typeof root === "number") return root;
    const item = sub.items?.data?.[0] as unknown as { current_period_end?: number } | undefined;
    if (item && typeof item.current_period_end === "number") return item.current_period_end;
    return null;
  }

  async function setPremium(
    customerId: string,
    subscriptionId: string | null,
    isActive: boolean,
    periodEnd: number | null,
  ) {
    const { data: profile, error: selErr } = await admin
      .from("profiles")
      .select("id")
      .eq("stripe_customer_id", customerId)
      .maybeSingle();
    if (selErr) {
      console.error("[stripe-webhook] profile lookup error", selErr, { customerId });
      throw new Error(`profile lookup failed: ${selErr.message}`);
    }
    if (!profile) {
      console.warn("[stripe-webhook] no profile for customer", { customerId });
      return;
    }
    const { error: updErr } = await admin
      .from("profiles")
      .update({
        is_premium: isActive,
        stripe_subscription_id: subscriptionId,
        premium_until: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
      })
      .eq("id", profile.id);
    if (updErr) {
      console.error("[stripe-webhook] profile update error", updErr, {
        customerId,
        profileId: profile.id,
        isActive,
      });
      throw new Error(`profile update failed: ${updErr.message}`);
    }
    console.log("[stripe-webhook] premium updated", {
      profileId: profile.id,
      isActive,
      subscriptionId,
      periodEnd,
    });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.mode === "subscription" && session.customer && session.subscription) {
          const sub = await stripe.subscriptions.retrieve(session.subscription as string);
          await setPremium(
            session.customer as string,
            sub.id,
            sub.status === "active" || sub.status === "trialing",
            readPeriodEnd(sub),
          );
        }
        break;
      }
      case "customer.subscription.created":
      case "customer.subscription.updated": {
        const sub = event.data.object as Stripe.Subscription;
        await setPremium(
          sub.customer as string,
          sub.id,
          sub.status === "active" || sub.status === "trialing",
          readPeriodEnd(sub),
        );
        break;
      }
      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        await setPremium(sub.customer as string, sub.id, false, null);
        break;
      }
      default:
        break;
    }
    return NextResponse.json({ received: true });
  } catch (e) {
    console.error("[stripe-webhook] handler error", e, { eventType: event.type, eventId: event.id });
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
