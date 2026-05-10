import { NextResponse } from "next/server";

// Skeleton route — full implementation lands in the next phase.
// Will:
//   1. Authenticate user via Supabase server client.
//   2. Create a YooCheckout payment for 499 RUB with save_payment_method=true.
//   3. Return { url } pointing to the YooKassa confirmation page.
export async function POST() {
  return NextResponse.json(
    { error: "YooKassa checkout is not implemented yet (PR #2)." },
    { status: 501 },
  );
}
