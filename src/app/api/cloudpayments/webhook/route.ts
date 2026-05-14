import { NextResponse, type NextRequest } from "next/server";
import { createHmac } from "node:crypto";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { hasCloudpaymentsEnv, hasSupabaseEnv } from "@/lib/env";

export const runtime = "nodejs";

const PREMIUM_PERIOD_MS = 30 * 24 * 60 * 60 * 1000;

// CloudPayments webhook payload for a completed payment.
interface CpWebhookPayload {
  TransactionId: number;
  Amount: number;
  Currency: string;
  Status: string; // "Completed" | "Declined" | "Authorized"
  AccountId?: string; // supabase user id — we pass this when opening the widget
  Token?: string; // saved card token (if SaveCard was requested)
  PaymentAmount?: number;
  InvoiceId?: string;
  Data?: string; // JSON string with extra metadata
}

function premiumUntil(prevIso?: string | null): string {
  const now = Date.now();
  if (prevIso) {
    const prevTs = new Date(prevIso).getTime();
    if (Number.isFinite(prevTs) && prevTs > now) {
      return new Date(prevTs + PREMIUM_PERIOD_MS).toISOString();
    }
  }
  return new Date(now + PREMIUM_PERIOD_MS).toISOString();
}

function verifyHmac(rawBody: string, secretKey: string, headerValue: string | null): boolean {
  if (!headerValue) return false;
  const expected = createHmac("sha256", secretKey)
    .update(rawBody, "utf8")
    .digest("base64");
  return expected === headerValue;
}

export async function POST(request: NextRequest) {
  if (!hasCloudpaymentsEnv() || !hasSupabaseEnv()) {
    return NextResponse.json({ code: 13 }); // internal error — CP will retry
  }

  const rawBody = await request.text();
  const secretKey = process.env.CLOUDPAYMENTS_SECRET_KEY ?? "";
  const hmacHeader = request.headers.get("content-hmac");

  if (!verifyHmac(rawBody, secretKey, hmacHeader)) {
    // Return 200 with code 13 (fail) per CP docs — returning non-200 causes
    // aggressive retries that flood the endpoint.
    return NextResponse.json({ code: 13 });
  }

  let payload: CpWebhookPayload;
  try {
    payload = JSON.parse(rawBody) as CpWebhookPayload;
  } catch {
    return NextResponse.json({ code: 13 });
  }

  // We only care about successful payments.
  if (payload.Status !== "Completed") {
    return NextResponse.json({ code: 0 }); // 0 = OK, event acknowledged
  }

  const userId = payload.AccountId;
  if (!userId) {
    return NextResponse.json({ code: 0 }); // nothing we can do
  }

  const admin = createSupabaseAdminClient();

  // Idempotency: check if this transaction was already processed.
  const { data: existing } = await admin
    .from("profiles")
    .select("cloudpayments_last_transaction_id, premium_until")
    .eq("id", userId)
    .maybeSingle();

  if (existing?.cloudpayments_last_transaction_id === payload.TransactionId) {
    return NextResponse.json({ code: 0 }); // duplicate webhook
  }

  const savedToken = payload.Token ?? null;

  const { error: updErr } = await admin
    .from("profiles")
    .update({
      is_premium: true,
      premium_until: premiumUntil(existing?.premium_until),
      cloudpayments_last_transaction_id: payload.TransactionId,
      ...(savedToken ? { cloudpayments_token: savedToken } : {}),
    })
    .eq("id", userId);

  if (updErr) {
    console.error("[cp-webhook] profile update error", updErr, { userId });
    return NextResponse.json({ code: 13 }); // signal CP to retry
  }

  console.log("[cp-webhook] premium activated", {
    userId,
    transactionId: payload.TransactionId,
    savedToken: !!savedToken,
  });

  return NextResponse.json({ code: 0 });
}
