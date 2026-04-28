import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getStripe } from "@/lib/stripe/server";
import { env, hasStripeEnv, hasSupabaseEnv } from "@/lib/env";

export async function POST(request: NextRequest) {
  if (!hasSupabaseEnv() || !hasStripeEnv()) {
    return NextResponse.json({ error: "Stripe or Supabase not configured" }, { status: 500 });
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await request.json().catch(() => ({}))) as { locale?: string };
  const locale = body.locale === "ru" ? "ru" : "en";

  const admin = createSupabaseAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("stripe_customer_id, email")
    .eq("id", user.id)
    .maybeSingle();

  const stripe = getStripe();

  let customerId = profile?.stripe_customer_id ?? null;
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: user.email ?? profile?.email ?? undefined,
      metadata: { supabase_user_id: user.id },
    });
    customerId = customer.id;
    await admin.from("profiles").update({ stripe_customer_id: customerId }).eq("id", user.id);
  }

  const baseUrl = env.appUrl();
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    line_items: [{ price: env.stripePremiumPriceId(), quantity: 1 }],
    success_url: `${baseUrl}/${locale}/dashboard?checkout=success`,
    cancel_url: `${baseUrl}/${locale}/pricing?checkout=cancel`,
    allow_promotion_codes: true,
    locale: locale === "ru" ? "ru" : "en",
    metadata: { supabase_user_id: user.id },
    subscription_data: { metadata: { supabase_user_id: user.id } },
  });

  return NextResponse.json({ url: session.url });
}
