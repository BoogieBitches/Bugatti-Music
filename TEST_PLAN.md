# Bugatti Sound — Adversarial Test Plan (PR #1)

## What changed (user-visible)
First end-to-end implementation of the Bugatti Sound music pool: signup, locale-aware UI (en/ru), public catalog of approved tracks only, user uploads with admin-moderation gating, and Premium-gated full-quality downloads via Stripe.

## Environment for execution
- Local dev server: `http://localhost:3000`, real Supabase project `zfwgmrdtrbmvnrnisghp`, real Stripe **test-mode** account.
- Pre-existing admin user (already created via Supabase admin API): `matrix198605@gmail.com` / `BugattiSound!2026`, `profiles.role='admin'`.
- A second non-admin / non-premium user will be created during the test (`tester+nonpremium@bugatti.local`) to exercise the gating from the consumer side.
- Test audio asset will be generated with ffmpeg (a 5-second 440 Hz sine wave) to keep upload fast and deterministic.

## Tests

### T1 — Catalog visibility is gated by moderation status
**Why this matters:** The single biggest claim of the PR is "tracks pass admin moderation before they go public". A broken implementation would either (a) show pending tracks to the public, or (b) hide approved tracks. Both fail visibly.

Steps (executed in browser unless noted):
1. Open `/en/catalog` while logged out. **Expected:** Page renders with header "Catalog" and an empty state or only previously-approved tracks. Specifically: zero rows match the title `T1-PENDING-DO-NOT-SHOW` because that track will only be created in step 4.
2. Sign up a fresh consumer user (Sign up → email `tester+nonpremium@bugatti.local`, password `Tester!2026`). Confirm landing page now shows the user logged in (header changes to email + sign-out).
   - *(Pre-confirmed via Supabase Auth admin API to avoid email confirmation flow.)*
3. Open `/en/upload` as that consumer user. Fill `Title=T1-PENDING-DO-NOT-SHOW`, `Artist=Devin`, attach the generated `sine.mp3` as Audio, submit.
   **Expected on submit:** Success card with text containing the i18n key `upload.successBody` (English: "It's now in the moderation queue."). Network: a `POST` to `/rest/v1/tracks` returning 201 with `status: "pending"`.
4. **Adversarial check:** While still logged in as the consumer, navigate to `/en/catalog`. **Expected:** `T1-PENDING-DO-NOT-SHOW` is NOT in the grid. (RLS allows the uploader to see their own pending track only on `/en/dashboard`, not in the public catalog query.)
5. Open `/en/dashboard`. **Expected:** "Pending" section contains exactly one row with title `T1-PENDING-DO-NOT-SHOW`.
6. Sign out. Sign in as admin (`matrix198605@gmail.com`). Open `/en/admin`.
   **Expected:** "Pending tracks" list contains the row with title `T1-PENDING-DO-NOT-SHOW`. The "Approve" and "Reject" buttons are visible.
7. Click **Approve**. **Expected:** Network shows `POST /api/admin/moderate` returning `{ok:true}`; row disappears from the pending list and reappears in the "Approved" list above; the page does NOT show an error banner.
8. Sign out. As anonymous visitor (cookies cleared), open `/en/catalog`. **Expected:** `T1-PENDING-DO-NOT-SHOW` IS now visible in the grid as a card with the right title and artist.

**Pass criteria, all of:**
- Step 4 grid does NOT contain the pending title.
- Step 5 dashboard DOES contain it under "Pending".
- Step 6 admin queue DOES contain it.
- Step 7 returns 200/`ok:true` and the row moves to "Approved".
- Step 8 catalog DOES contain it after approval.

A broken moderation gate would fail step 4 (track shows up before approval) or step 8 (track never shows up after approval) — both visible from the screenshots.

### T2 — Premium download gate
**Why this matters:** The other defining claim is "30-sec preview is free, full download requires Premium." A broken gate would either let any signed-in user download the full file, or block premium users.

Steps:
1. Still as the anonymous visitor on `/en/catalog`, click into the approved track from T1. **Expected:** Track detail page renders. The "Download" button is either hidden or replaced by a "Sign in" prompt.
2. Sign in as the non-premium consumer (`tester+nonpremium@bugatti.local`). Reload the track page. Click **Download**.
   **Expected:** Network `POST /api/tracks/<id>/download` returns **HTTP 403** with body `{"error":"Premium required"}`. UI shows an error toast / inline error containing "Premium" text. No file is downloaded.
3. *Out-of-band, simulating the Stripe webhook flip:* From a shell, set `is_premium=true` for the consumer's profile via the service-role REST API (this is what the webhook does in production after `checkout.session.completed`). Verify the row was updated (`role:'user', is_premium:true`).
4. Reload the track page in the browser, click **Download** again.
   **Expected:** Network `POST /api/tracks/<id>/download` returns **HTTP 200** with body `{"url":"https://...supabase.co/storage/v1/object/sign/audio-tracks/..."}`. Open the URL — the audio file (or a 200 audio/mpeg response) is served.
5. Sign out, sign back in as admin. Click **Download** on the same track. **Expected:** Same 200 + signed URL — admins bypass premium check (`isAdmin || isPremium` in `download/route.ts:33`).

**Pass criteria, all of:**
- Step 2 returns 403, body contains "Premium".
- Step 4 returns 200 with a `supabase.co/storage/v1/object/sign/...` URL that resolves to the audio.
- Step 5 returns 200 (admin bypass).

A broken gate would let step 2 succeed (privacy hole) or step 4/5 fail (paying users locked out).

### T3 — Stripe Checkout session is actually created (smoke)
**Why this matters:** Without a public webhook URL we can't fully exercise entitlement flow locally, but we CAN prove that hitting "Subscribe" creates a real Stripe Checkout session (i.e. our keys + Price ID are wired up).

Steps:
1. Sign in as the non-premium consumer. Open `/en/pricing`. Click **Subscribe to Premium**.
2. **Expected:** Browser is redirected to `https://checkout.stripe.com/c/pay/...` (the Stripe-hosted Checkout page) with the product name "Bugatti Sound Premium" and the configured `price_1TQyuCJ6TDOmhs3HO4GOKIQX` (~9.99 USD/month).
3. **Do NOT actually complete payment.** Observing the Stripe Checkout page proves: (a) `STRIPE_SECRET_KEY` is valid, (b) `STRIPE_PREMIUM_PRICE_ID` resolves on Stripe's side, (c) `success_url` and `cancel_url` are set.

**Pass criteria:**
- The redirect target hostname is `checkout.stripe.com`.
- The product name visible on the Stripe page is "Bugatti Sound Premium".

A broken integration (wrong key, wrong price ID, or missing `STRIPE_PREMIUM_PRICE_ID`) would either return an inline error or redirect to a Stripe error page — that would be visibly different.

## Out of scope (will be flagged, not tested)
- Actual webhook delivery + signature verification: requires a public URL (Vercel deploy). Will be tested manually after deploy with the README-provided checklist.
- Email-confirmation flow: bypassed by creating users via the admin API. The user can re-enable "Confirm email" in Supabase before going to production.
- Mobile responsiveness deep-dive: covered visually by one mobile-width screenshot of `/en/catalog` if time permits.

## Evidence captured
- Screen recording covering T1 + T2 + T3 in one continuous session.
- Network response evidence for the three critical endpoints (`/rest/v1/tracks`, `/api/admin/moderate`, `/api/tracks/<id>/download`).
- Screenshot of Stripe Checkout page for T3.
