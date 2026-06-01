import { type NextRequest } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { hasRobokassaEnv, hasSupabaseEnv, env } from "@/lib/env";
import { verifyWebhookSignature } from "@/lib/robokassa/server";

export const runtime = "nodejs";

const PREMIUM_PERIOD_MS = 30 * 24 * 60 * 60 * 1000;

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

function textResponse(body: string) {
  return new Response(body, { status: 200, headers: { "Content-Type": "text/plain" } });
}

export async function POST(request: NextRequest) {
  if (!hasRobokassaEnv() || !hasSupabaseEnv()) {
    console.error("[rk-webhook] env not configured");
    return textResponse("FAIL0");
  }

  const rawBody = await request.text();
  const params = new URLSearchParams(rawBody);

  const outSum = params.get("OutSum") ?? "";
  const invId = params.get("InvId") ?? "";
  const signatureValue = params.get("SignatureValue") ?? "";
  const userId = params.get("Shp_userId") ?? "";

  const allParams: Record<string, string> = {};
  params.forEach((v, k) => { allParams[k] = v; });
  console.log("[rk-webhook] received params", JSON.stringify(allParams));

  const shpParams: Record<string, string> = {};
  if (userId) shpParams["Shp_userId"] = userId;

  const password2 = env.robokassaPassword2();
  const sigOk = verifyWebhookSignature(outSum, invId, password2, signatureValue, shpParams);

  console.log("[rk-webhook] signature check", {
    outSum, invId, hasUserId: !!userId,
    shpKeys: Object.keys(shpParams),
    receivedSig: signatureValue,
    sigOk,
  });

  const admin = createSupabaseAdminClient();

  // Store every webhook call in audit_log for admin inspection
  await admin.from("audit_log").insert({
    action: "rk_webhook",
    meta: {
      invId,
      outSum,
      userId,
      sigOk,
      receivedSig: signatureValue,
      allParams,
    },
  }).catch(() => {});

  if (!sigOk) {
    console.warn("[rk-webhook] signature mismatch — wrong ROBOKASSA_PASSWORD2 or shp params order");
    return textResponse(`FAIL${invId}`);
  }

  if (!userId) {
    console.warn("[rk-webhook] missing Shp_userId, cannot activate premium");
    return textResponse(`OK${invId}`);
  }

  const { data: existing } = await admin
    .from("profiles")
    .select("robokassa_last_inv_id, premium_until")
    .eq("id", userId)
    .maybeSingle();

  const parsedInvId = parseInt(invId, 10);

  if (existing?.robokassa_last_inv_id === parsedInvId) {
    console.log("[rk-webhook] duplicate InvId", invId);
    return textResponse(`OK${invId}`);
  }

  const { error: updErr } = await admin
    .from("profiles")
    .update({
      is_premium: true,
      premium_until: premiumUntil(existing?.premium_until),
      robokassa_last_inv_id: parsedInvId,
      robokassa_rebill_id: parsedInvId,
    })
    .eq("id", userId);

  if (updErr) {
    console.error("[rk-webhook] profile update error", updErr, { userId });
    return textResponse(`FAIL${invId}`);
  }

  console.log("[rk-webhook] premium activated", {
    userId, invId, amount: outSum,
  });

  return textResponse(`OK${invId}`);
}
