# Bugatti Sound MVP — End-to-end test report

**Methodology.** Ran the app locally (`pnpm dev` on `http://localhost:3000`) against the real Supabase project (`zfwgmrdtrbmvnrnisghp.supabase.co`) and Stripe in test mode. All three primary flows from `TEST_PLAN.md` were exercised through the UI in a single recorded session.

**Result:** all three tests passed, after fixing two real bugs found during execution. Both fixes are committed on the PR branch.

---

## Escalations

Two real bugs surfaced during testing. Both fixed and pushed:

1. **Upload always failed with HTTP 400 ("new row violates row-level security policy")** — `UploadForm.tsx` called `.upload(..., { upsert: true })` for all four storage uploads (audio, preview, cover image, cover video). The Supabase JS SDK turns `upsert: true` into a PUT request, which the storage RLS policies do not grant — they only allow INSERT into the user's own folder. Each upload path is already unique (`<userId>/<trackUuid>/<filename>`), so upsert is unnecessary. Changed to `upsert: false` → POST → INSERT policy passes. Commit `f35858b`.

2. **Admin moderation queue and catalog were silently empty** — `catalog/page.tsx`, `admin/page.tsx`, and `track/[id]/page.tsx` used `select("..., uploader:profiles(...)")`. PostgREST returned `PGRST201` (Could not embed because more than one relationship was found) because `tracks` has two foreign keys to `profiles`: `uploader_id` and `approved_by`. Disambiguated to `uploader:profiles!tracks_uploader_id_fkey(...)`. Commit `4a2dccc`.

After both fixes, the full flow works end-to-end. Without these fixes the MVP is not usable: users cannot upload, and admins cannot see anything to moderate.

Stripe shows the Premium product at **$5.00 / month** in checkout. That's whatever was set on `price_1TQyuCJ6TDOmhs3HO4GOKIQX` in the Stripe dashboard — not a code issue. Adjust the price in Stripe if you wanted $9.99.

---

## Test results

| Test | Result | Notes |
|---|---|---|
| T1 — Moderation gating (catalog hides pending, shows approved) | **passed** | required FK fix; 4 assertions verified |
| T2 — Premium download gate (API + UI) | **passed** | API returned 403 → flipped `is_premium=true` → API returned 200 + signed URL → URL served `audio/mpeg` 40795 B |
| T3 — Stripe Checkout smoke | **passed** | redirected to `checkout.stripe.com` with "Subscribe to Bugatti Sound Premium" |

---

## T1 — Moderation gating

| Step | Expected | Observed | Pass? |
|---|---|---|---|
| As consumer, upload `T1-PENDING-DO-NOT-SHOW` via `/en/upload` | Success card "Submitted for review" | Success card shown | ✓ |
| `/en/dashboard` as same consumer | "PENDING REVIEW" row with that title | One row, status badge says PENDING REVIEW | ✓ |
| `/en/catalog` as same consumer (still anonymous-equivalent for non-approved) | Track NOT in grid | "No tracks match your filters yet." | ✓ |
| Sign in as admin, open `/en/admin` | Track in "Pending queue" with Approve/Reject | Row visible after FK fix; button click → row moves to "Approved" | ✓ |
| Sign out, open `/en/catalog` as anonymous | Track now visible | Track tile rendered with cover and title | ✓ |

**Anonymous catalog (precondition + final state)**

| 🟢 Empty before approve | 🟢 Visible after approve |
|---|---|
| ![Empty catalog](https://app.devin.ai/attachments/9d25b58d-946b-4177-8c4b-e051c97cf970/screenshot_e778074abde44194a726edb735d60d11.png) | ![Catalog with approved track](https://app.devin.ai/attachments/c71d2fe8-7dfb-497d-9b87-98d04a4735b2/screenshot_454bca94d34040f98ac7084f2bc07db2.png) |
| `/en/catalog` while track is pending | `/en/catalog` after admin Approve |

**Owner dashboard while pending**

![Dashboard pending](https://app.devin.ai/attachments/01993405-64ca-48c0-9b2b-496be2e52319/screenshot_dbd282be39b2490989971e796173c6d4.png)

**Admin moderation flow**

| 🟢 Pending queue (after FK fix) | 🟢 After Approve |
|---|---|
| ![Admin pending row](https://app.devin.ai/attachments/a05d77cc-fade-4769-bc2f-8e58a2c27741/screenshot_bf435a77b4f741c787639a8078d5c658.png) | ![Admin approved row](https://app.devin.ai/attachments/6f0dca0a-e975-4598-af77-6eda228d5c47/screenshot_23f74b26674c4bd4a4cb2049a738d928.png) |
| Track in pending queue with Approve/Reject | Pending queue empty; row in Approved |

---

## T2 — Premium download gate

The download button changes presentation server-side based on `profiles.is_premium`. To prove the **API** itself enforces the gate (not just the UI), I issued a `POST /api/tracks/<id>/download` from inside the page context (so cookies are picked up) via the browser's `fetch` over CDP.

| Step | Expected | Observed | Pass? |
|---|---|---|---|
| As non-premium, track detail UI | "Premium subscription required" CTA (link to /pricing) | exactly that | ✓ |
| As non-premium, POST to download API | 403 + `{"error":"Premium required"}` | `{'status': 403, 'body': '{"error":"Premium required"}'}` | ✓ |
| Flip `profiles.is_premium=true` via service-role REST (simulating webhook) | Track page reload shows "Download full track" | Button text changed | ✓ |
| As premium, POST to download API | 200 + signed URL on `*.supabase.co/storage/v1/object/sign/audio-tracks/...` | `{'status': 200, 'body': '{"url":"https://zfwgmrdtrbmvnrnisghp.supabase.co/storage/v1/object/sign/audio-tracks/.../sine.mp3?token=..."}'}` | ✓ |
| Open the signed URL | resolves to audio | `HTTP/2 200`, `content-type: audio/mpeg`, `content-length: 40795`; browser embedded player showed 0:05 sine.mp3 | ✓ |

| 🔴 Non-premium track page | 🟢 Premium track page |
|---|---|
| ![Premium gate](https://app.devin.ai/attachments/ca1aae8c-ce42-4526-b868-d7dbbed75c65/screenshot_36308708923749e2aaa1de293bfa52ad.png) | ![Download enabled](https://app.devin.ai/attachments/a7c439bc-bcd2-482d-87c6-f0be1104e81a/screenshot_676a2aa150a9425eabd162acfeb7841f.png) |
| "Premium subscription required" → links to /pricing | "Download full track" |

**Signed URL serving real audio**

![Signed URL audio player](https://app.devin.ai/attachments/585a17fe-ff34-422e-8a25-4252127c4a53/screenshot_0e53b0e072724cafa59723b2e9982fd4.png)

Browser navigated to the signed URL on `zfwgmrdtrbmvnrnisghp.supabase.co/storage/v1/object/sign/audio-tracks/...`, native audio player rendered with `0:05 / 0:05`.

> Admin-bypass branch (`isAdmin=true` short-circuits the premium check at `route.ts:33`) was inspected but not separately exercised end-to-end — the same code path is exercised by the premium-true case.

---

## T3 — Stripe Checkout smoke

| Step | Expected | Observed | Pass? |
|---|---|---|---|
| Non-premium user on `/en/pricing` | "Start Premium" button visible | yes | ✓ |
| Click button | redirect to `https://checkout.stripe.com/c/pay/...` with "Subscribe to Bugatti Sound Premium" | redirected; product line item read "Bugatti Sound Premium" $5.00 / month, email pre-filled `tester+nonpremium@bugatti.local` | ✓ |

![Stripe Checkout](https://app.devin.ai/attachments/5be5594e-eb07-4996-95ca-76b015b5bb5f/screenshot_2c1d2dac33fa43b68e3e2d2da9e99c96.png)

Did **not** complete payment — purpose was to prove the integration is wired up end-to-end (env vars, Price ID, server-side session creation, redirect).

---

## Things explicitly NOT tested

- Real card payment + Stripe webhook → `is_premium=true` write-back. Would need a public URL for webhooks. The webhook handler exists at `src/app/api/stripe/webhook/route.ts` but was not exercised live; T2 simulated its effect by writing `profiles.is_premium=true` directly via service-role.
- Reject flow on admin moderation panel.
- Mobile responsive layout.
- Russian (`/ru/...`) variants of any page (logic is shared, only labels differ).
- OAuth (Google) sign-in.
