import { NextResponse, type NextRequest } from "next/server";
import { getYooCheckout } from "@/lib/yookassa/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { hasYookassaEnv, hasSupabaseEnv } from "@/lib/env";

export const runtime = "nodejs";

// ЮKassa events we react to.
type YooKassaEventType =
  | "payment.succeeded"
  | "payment.canceled"
  | "payment.waiting_for_capture"
  | "refund.succeeded";

interface YooKassaEvent {
  type: "notification";
  event: YooKassaEventType;
  object: {
    id: string;
    payment_id?: string;
    metadata?: Record<string, string> | null;
  };
}

const PREMIUM_PERIOD_DAYS = 30;

// Anchor premium_until to the payment's captured_at (or created_at as a
// fallback) rather than Date.now(). This makes replays harmless: a second
// invocation of payment.succeeded for the same payment id always recomputes
// the same expiry instead of pushing it forward by another 30 days.
function premiumUntilFromPayment(payment: { captured_at?: string; created_at?: string }): string {
  const anchor = payment.captured_at ?? payment.created_at;
  const base = anchor ? new Date(anchor).getTime() : Date.now();
  const ms = PREMIUM_PERIOD_DAYS * 24 * 60 * 60 * 1000;
  return new Date(base + ms).toISOString();
}

export async function POST(request: NextRequest) {
  if (!hasYookassaEnv() || !hasSupabaseEnv()) {
    return NextResponse.json({ error: "Not configured" }, { status: 500 });
  }

  let body: YooKassaEvent;
  try {
    body = (await request.json()) as YooKassaEvent;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (body?.type !== "notification" || !body.event || !body.object?.id) {
    return NextResponse.json({ error: "Invalid event shape" }, { status: 400 });
  }

  // ЮKassa does not sign webhook bodies. Verify by re-fetching the payment
  // (or refund) via the API using our secret key, which proves the event is
  // authentic — no attacker can fabricate a payment with a chosen id and
  // metadata in our shop without that key.
  const yoo = getYooCheckout();
  const admin = createSupabaseAdminClient();

  try {
    if (body.event === "payment.succeeded") {
      const payment = await yoo.getPayment(body.object.id);
      if (payment.status !== "succeeded" || !payment.paid) {
        console.warn("[yookassa-webhook] payment.succeeded but verified status differs", {
          paymentId: payment.id,
          status: payment.status,
          paid: payment.paid,
        });
        return NextResponse.json({ received: true, ignored: true });
      }
      const userId = (payment.metadata as Record<string, string> | null)?.supabase_user_id;
      if (!userId) {
        console.warn("[yookassa-webhook] payment without supabase_user_id metadata", {
          paymentId: payment.id,
        });
        return NextResponse.json({ received: true, orphan: true });
      }

      // Idempotency: if we already recorded this payment id, do nothing.
      // Combined with the captured_at anchor below, this blocks replay attacks
      // where someone re-POSTs an old succeeded webhook to extend their
      // subscription.
      const { data: existing } = await admin
        .from("profiles")
        .select("yookassa_last_payment_id")
        .eq("id", userId)
        .maybeSingle();
      if (existing?.yookassa_last_payment_id === payment.id) {
        return NextResponse.json({ received: true, duplicate: true });
      }

      const savedMethodId = payment.payment_method?.saved
        ? payment.payment_method.id
        : null;

      const { error: updErr } = await admin
        .from("profiles")
        .update({
          is_premium: true,
          premium_until: premiumUntilFromPayment(payment),
          yookassa_last_payment_id: payment.id,
          ...(savedMethodId ? { yookassa_payment_method_id: savedMethodId } : {}),
        })
        .eq("id", userId);
      if (updErr) {
        console.error("[yookassa-webhook] profile update error", updErr, {
          userId,
          paymentId: payment.id,
        });
        return NextResponse.json({ error: updErr.message }, { status: 500 });
      }
      console.log("[yookassa-webhook] premium activated", {
        userId,
        paymentId: payment.id,
        savedMethodId,
      });
      return NextResponse.json({ received: true });
    }

    if (body.event === "payment.canceled") {
      // No-op: we never granted Premium on a canceled payment. Just log.
      console.log("[yookassa-webhook] payment canceled", { paymentId: body.object.id });
      return NextResponse.json({ received: true });
    }

    if (body.event === "refund.succeeded") {
      // Verify the refund itself via API — never trust payment_id from the
      // unsigned body. Without this an attacker holding any valid payment_id
      // could forge a refund.succeeded webhook to revoke that user's Premium.
      const refund = await yoo.getRefund(body.object.id);
      if (refund.status !== "succeeded") {
        console.warn("[yookassa-webhook] refund.succeeded but verified status differs", {
          refundId: refund.id,
          status: refund.status,
        });
        return NextResponse.json({ received: true, ignored: true });
      }
      const payment = await yoo.getPayment(refund.payment_id);
      const userId = (payment.metadata as Record<string, string> | null)?.supabase_user_id;
      if (!userId) {
        return NextResponse.json({ received: true, orphan: true });
      }
      const { error: updErr } = await admin
        .from("profiles")
        .update({ is_premium: false, premium_until: null })
        .eq("id", userId);
      if (updErr) {
        console.error("[yookassa-webhook] revoke premium error", updErr);
        return NextResponse.json({ error: updErr.message }, { status: 500 });
      }
      console.log("[yookassa-webhook] premium revoked (refund)", {
        userId,
        refundId: refund.id,
        paymentId: refund.payment_id,
      });
      return NextResponse.json({ received: true });
    }

    return NextResponse.json({ received: true, ignored: true });
  } catch (err) {
    console.error("[yookassa-webhook] handler error", err, { event: body.event });
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Webhook error" },
      { status: 500 },
    );
  }
}
