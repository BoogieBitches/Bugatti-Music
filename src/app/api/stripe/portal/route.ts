import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getStripe } from "@/lib/stripe/server";
import { env, hasStripeEnv, hasSupabaseEnv } from "@/lib/env";

export async function POST() {
  if (!hasSupabaseEnv() || !hasStripeEnv()) {
    return NextResponse.json({ error: "Stripe or Supabase not configured" }, { status: 500 });
  }
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createSupabaseAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("stripe_customer_id, preferred_locale")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile?.stripe_customer_id) {
    return NextResponse.json({ error: "No Stripe customer" }, { status: 400 });
  }

  const stripe = getStripe();
  const session = await stripe.billingPortal.sessions.create({
    customer: profile.stripe_customer_id,
    return_url: `${env.appUrl()}/${profile.preferred_locale ?? "en"}/dashboard`,
  });
  return NextResponse.json({ url: session.url });
}
