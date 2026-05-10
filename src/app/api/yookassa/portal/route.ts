import { NextResponse } from "next/server";

// Skeleton route — full implementation lands in PR #3.
// YooKassa has no hosted "billing portal" like Stripe. Instead we will
// expose our own /dashboard subscription pane that calls this endpoint to
// cancel autopay (delete saved payment_method id from profiles, mark
// subscription as canceled at end of current period).
export async function POST() {
  return NextResponse.json(
    { error: "YooKassa subscription cancel is not implemented yet (PR #3)." },
    { status: 501 },
  );
}
