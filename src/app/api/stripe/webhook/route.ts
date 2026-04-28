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

  async function setPremium(
    customerId: string,
    subscriptionId: string | null,
    isActive: boolean,
    periodEnd: number | null,
  ) {
    const { data: profile } = await admin
      .from("profiles")
      .select("id")
      .eq("stripe_customer_id", customerId)
      .maybeSingle();
    if (!profile) return;
    await admin
      .from("profiles")
      .update({
        is_premium: isActive,
        stripe_subscription_id: subscriptionId,
        premium_until: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
      })
      .eq("id", profile.id);
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
            sub.current_period_end ?? null,
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
          sub.current_period_end ?? null,
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
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
