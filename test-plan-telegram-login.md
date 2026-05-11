# Test Plan — Telegram Login (PR #27)

## What changed (user-visible)
On `https://bugattisound.online/[lang]/login` a new **Log in with Telegram** button now renders below the Google button when `NEXT_PUBLIC_TELEGRAM_BOT_USERNAME` is set. Clicking it opens a Telegram authorization popup; on success the user is signed into Supabase (using a synthetic email `telegram_<id>@telegram.bugattisound.online`) and lands back on the site logged in.

## Code paths under test
- Widget mounting: `src/components/TelegramLoginButton.tsx` (creates `<script data-telegram-login=... data-auth-url=/api/auth/telegram?...>`)
- Form rendering: `src/components/LoginForm.tsx:99-113` (only renders TG section when `NEXT_PUBLIC_TELEGRAM_BOT_USERNAME` is non-empty)
- HMAC verify + user provision + session issue: `src/app/api/auth/telegram/route.ts`
- Replay/forgery defense: `src/lib/telegram.ts` (rejects payloads >1h old or with bad HMAC)

## Tests

### T1 — Widget renders only when configured (regression / sanity)
Already verified during setup: the "Log in with Telegram" blue button is visible at `/ru/login` between the Google button and the hint text. **PASS** (recorded as setup observation).

### T2 — HMAC enforcement (forgery defense)
**Why this matters**: if HMAC verification is broken, anyone with the auth-url could spoof a Telegram user and sign in as anyone they want by inventing an `id`. This test proves that arbitrary unsigned payloads are rejected.

**Steps**: hit the endpoint with a fabricated payload and bad hash.
```
curl -sS -o /dev/null -w "%{http_code} %{redirect_url}\n" -L --max-redirs 0 \
  "https://bugattisound.online/api/auth/telegram?id=999&first_name=spoof&auth_date=$(date +%s)&hash=deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef&lang=ru&next=/ru/dashboard"
```

**Pass criteria**:
- HTTP status: **303**
- `Location` header: contains `/ru/login` AND `error=telegram_invalid_signature`

**Would look identical if broken?** No: if HMAC check was a no-op, we'd see `Location` pointing at a Supabase `auth/v1/verify?...` URL instead.

### T3 — End-to-end Telegram sign-in (the main flow)
**Why this matters**: the actual user journey we shipped.

**Steps** (browser, fresh incognito-like state — current matrix198605@gmail.com session signed out first):
1. Sign out the current Google session via header "Выйти" button.
2. Open `https://bugattisound.online/ru/login`.
3. Observe the "Log in with Telegram" blue iframe button is present.
4. Click the Telegram button.
5. In the Telegram popup, sign in with my Telegram account (I have one on this machine).
6. Approve the authorization for `@bugattisoundbot`.

**Pass criteria**:
- After Telegram authorizes, browser is redirected through `/api/auth/telegram` → Supabase `auth/v1/verify` → back to `/ru/dashboard` (the configured `next`).
- The header on `/ru/dashboard` shows a user identifier (email like `telegram_<id>@telegram.bugattisound.online`, NOT `matrix198605@gmail.com`).
- No red error banner is visible on either page.

**Would look identical if broken?** No: a bad HMAC would land on `/ru/login?error=telegram_invalid_signature` (red banner). A bad generateLink would land on `/ru/login?error=telegram_session_failed`. A working session is required for the dashboard header to show the new user.

### T4 — Idempotency (sign in twice with same TG account)
**Why this matters**: the route's createUser-or-refresh logic must handle "user already exists" cleanly. If the duplicate-detection branch was broken, the second sign-in would 303 to `/ru/login?error=telegram_provision_failed`.

**Steps**:
1. After T3 succeeds, sign out via header.
2. Repeat steps 2-6 from T3 with the same Telegram account.

**Pass criteria**: lands on `/ru/dashboard` again, same `telegram_<id>@telegram.bugattisound.online` identity, no red error banner.

**Would look identical if broken?** No: the "already exists" path would surface `error=telegram_provision_failed` in the URL and the red error banner.

## Out of scope
- Existing Google login regression — already verified on this domain in a prior session (logged in as matrix198605@gmail.com to do this test).
- Email/password — intentionally hidden, no UI to exercise.
- DB schema changes — none in this PR (telegram_id/telegram_username stored in `auth.users.raw_user_meta_data`, not as columns).
- Cleanup of telegram-test users in Supabase — deferred to user (visible at https://supabase.com/dashboard/project/zfwgmrdtrbmvnrnisghp/auth/users).
