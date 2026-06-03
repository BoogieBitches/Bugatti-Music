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

async function handleWebhook(request: NextRequest) {
  if (!hasRobokassaEnv() || !hasSupabaseEnv()) {
    console.error("[rk-webhook] env not configured");
    return textResponse("FAIL0");
  }

  // Robokassa may send params via POST body OR GET query string
  let params: URLSearchParams;
  if (request.method === "GET") {
    params = new URL(request.url).searchParams;
  } else {
    const rawBody = await request.text();
    params = new URLSearchParams(rawBody);
  }

  const outSum = params.get("OutSum") ?? "";
  const invId = params.get("InvId") ?? "";
  const signatureValue = params.get("SignatureValue") ?? "";
  const userId = params.get("Shp_userId") ?? "";

  const allParams: Record<string, string> = {};
  params.forEach((v, k) => { allParams[k] = v; });
  console.log("[rk-webhook] method=" + request.method + " params=" + JSON.stringify(allParams));

  const shpParams: Record<string, string> = {};
  if (userId) shpParams["Shp_userId"] = userId;

  const password2 = env.robokassaPassword2();
  const sigOk = verifyWebhookSignature(outSum, invId, password2, signatureValue, shpParams);

  console.log("[rk-webhook] sig check", { outSum, invId, userId, sigOk });

  const admin = createSupabaseAdminClient();

  // Store every webhook call in audit_log for admin inspection
  try {
    await admin.from("audit_log").insert({
      action: "rk_webhook",
      meta: { invId, outSum, userId, sigOk, method: request.method, allParams },
    });
  } catch (_) {}

  if (!sigOk) {
    console.warn("[rk-webhook] sig mismatch — check ROBOKASSA_PASSWORD2 in Vercel");
    return textResponse(`FAIL${invId}`);
  }

  if (!userId) {
    console.warn("[rk-webhook] missing Shp_userId");
    return textResponse(`OK${invId}`);
  }

  const { data: existing } = await admin
    .from("profiles")
    .select("premium_until")
    .eq("id", userId)
    .maybeSingle();

  const newPremiumUntil = premiumUntil(existing?.premium_until);

  const { error: updErr } = await admin
    .from("profiles")
    .update({
      is_premium: true,
      premium_until: newPremiumUntil,
    })
    .eq("id", userId);

  if (updErr) {
    console.error("[rk-webhook] profile update error", updErr, { userId });
    return textResponse(`FAIL${invId}`);
  }

  // Record activation for deduplication
  try {
    await admin.from("audit_log").insert({
      action: "rk_premium_activated",
      meta: { invId, outSum, userId, premiumUntil: newPremiumUntil },
    });
  } catch (_) {}

  console.log("[rk-webhook] PREMIUM ACTIVATED userId=" + userId + " until=" + newPremiumUntil);
  return textResponse(`OK${invId}`);
}

export async function POST(request: NextRequest) {
  return handleWebhook(request);
}

export async function GET(request: NextRequest) {
  return handleWebhook(request);
}
