import { NextResponse, type NextRequest } from "next/server";
import { createHmac } from "node:crypto";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { hasCloudpaymentsEnv, hasSupabaseEnv } from "@/lib/env";

export const runtime = "nodejs";

const PREMIUM_PERIOD_MS = 30 * 24 * 60 * 60 * 1000;

interface CpWebhookPayload {
  TransactionId: number;
  Amount: number;
  Currency: string;
  Status: string;
  AccountId?: string;
  Token?: string;
  PaymentAmount?: number;
  InvoiceId?: string;
  Data?: string;
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

/**
 * Parse CloudPayments webhook body.
 * CP sends application/x-www-form-urlencoded (not JSON).
 * Falls back to JSON for forward-compatibility.
 */
function parseBody(rawBody: string, contentType: string | null): CpWebhookPayload | null {
  if (!contentType || !contentType.includes("json")) {
    try {
      const params = new URLSearchParams(rawBody);
      const obj: Record<string, unknown> = {};
      for (const [key, val] of params.entries()) {
        if (["TransactionId", "Amount", "PaymentAmount"].includes(key) && val !== "") {
          obj[key] = Number(val);
        } else {
          obj[key] = val;
        }
      }
      if (obj.TransactionId) return obj as unknown as CpWebhookPayload;
    } catch {
      // fall through to JSON
    }
  }
  try {
    return JSON.parse(rawBody) as CpWebhookPayload;
  } catch {
    return null;
  }
}

export async function POST(request: NextRequest) {
  if (!hasCloudpaymentsEnv() || !hasSupabaseEnv()) {
    return NextResponse.json({ code: 13 });
  }

  const rawBody = await request.text();
  const contentType = request.headers.get("content-type");
  const secretKey = process.env.CLOUDPAYMENTS_SECRET_KEY ?? "";

  // Strict HMAC verification — rejects any request that does not carry
  // a valid Content-HMAC signature. This prevents spoofed webhook calls.
  const hmacHeader =
    request.headers.get("content-hmac") ??
    request.headers.get("x-content-hmac");

  if (!verifyHmac(rawBody, secretKey, hmacHeader)) {
    console.warn("[cp-webhook] HMAC verification failed — rejecting request", {
      hasHeader: !!hmacHeader,
      contentType,
    });
    // Return 200 with code 13 per CP docs (non-200 causes aggressive retries).
    return NextResponse.json({ code: 13 });
  }

  const payload = parseBody(rawBody, contentType);
  if (!payload) {
    console.error("[cp-webhook] failed to parse body", { rawBody: rawBody.slice(0, 300) });
    return NextResponse.json({ code: 13 });
  }

  console.log("[cp-webhook] received", {
    transactionId: payload.TransactionId,
    status: payload.Status,
    accountId: payload.AccountId,
    hasToken: !!payload.Token,
  });

  if (payload.Status !== "Completed") {
    return NextResponse.json({ code: 0 });
  }

  const userId = payload.AccountId;
  if (!userId) {
    console.warn("[cp-webhook] no AccountId in payload");
    return NextResponse.json({ code: 0 });
  }

  const admin = createSupabaseAdminClient();

  const { data: existing } = await admin
    .from("profiles")
    .select("cloudpayments_last_transaction_id, premium_until")
    .eq("id", userId)
    .maybeSingle();

  if (existing?.cloudpayments_last_transaction_id === payload.TransactionId) {
    console.log("[cp-webhook] duplicate transaction", payload.TransactionId);
    return NextResponse.json({ code: 0 });
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
    return NextResponse.json({ code: 13 });
  }

  console.log("[cp-webhook] premium activated", {
    userId,
    transactionId: payload.TransactionId,
    savedToken: !!savedToken,
    premiumUntil: premiumUntil(existing?.premium_until),
  });

  return NextResponse.json({ code: 0 });
}
