import { NextResponse } from "next/server";

export const runtime = "nodejs";

// Skeleton route — full implementation lands in the next phase.
// Will handle YooKassa webhook events:
//   - payment.succeeded → activate Premium, store payment_method id for autopay.
//   - payment.canceled / refund.succeeded → revoke Premium.
// YooKassa does not sign webhooks — instead we whitelist their source IPs and
// also re-fetch the payment object via API as a verification step.
export async function POST() {
  return NextResponse.json(
    { error: "YooKassa webhook is not implemented yet (PR #2)." },
    { status: 501 },
  );
}
