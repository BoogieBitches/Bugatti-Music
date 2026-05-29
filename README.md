# Bugatti Sound

A modern music pool (DJ-City / ZipDJ / BPM Supreme style) built with Next.js 16, Supabase, and Robokassa. Free to listen, premium to download. Built for top DJs.

Production: <https://bugattisound.online>

## Stack

- **Next.js 16** (App Router) + TypeScript + Tailwind v4
- **Supabase**: Postgres + Auth (email + Google OAuth + Telegram login) + Storage
- **Robokassa**: subscription billing for the Premium plan (RUB), with recurring auto-renewal
- **i18n**: built-in dictionaries for `en` and `ru`, locale-prefixed routes (`/en/...`, `/ru/...`)
- **Vercel**: hosting target (+ Vercel Cron for auto-renewal)

## Features

- Catalog with genre / BPM / key / search filters
- 30-second public previews; full-quality downloads gated by Premium subscription
- Cover artwork with optional looping video / animated GIF
- User uploads with admin moderation (`pending` → `approved` / `rejected`)
- Admin moderation panel (auto-shows for users with `role = 'admin'`)
- User dashboard with subscription status & track history
- Robokassa hosted payment page, recurring auto-renewal via saved rebill id, webhook-driven Premium entitlement
- Mobile-first responsive layout
- Russian / English language switch (locale persisted in cookie + Supabase profile)

## Quick start

### 1. Clone & install

```bash
pnpm install
```

### 2. Create a Supabase project

1. Sign in at <https://supabase.com> and create a new project.
2. In **Settings → API**, copy the project URL, the `anon` key and the `service_role` key.
3. Open the **SQL Editor** and run the migrations from `supabase/migrations/` in order (`001` → `010`). Notably:
   - `001_init.sql` — tables, RLS, triggers
   - `002_storage.sql` — buckets and storage policies
   - `003_seed_genres.sql` / `004` / `005` — curated genre list
   - `010_add_robokassa.sql` — `robokassa_rebill_id` / `robokassa_last_inv_id` columns (required by the webhook)
4. (Optional) **Authentication → Providers → Google**: paste the Client ID / Secret you create in Google Cloud Console for OAuth login.

### 3. Set up Robokassa

1. Sign up / log in at <https://robokassa.ru> and create a shop (магазин).
2. In **Технические настройки** copy:
   - **Идентификатор магазина** → `ROBOKASSA_LOGIN`
   - **Пароль #1** → `ROBOKASSA_PASSWORD1` (signs the outgoing payment link)
   - **Пароль #2** → `ROBOKASSA_PASSWORD2` (verifies the incoming Result webhook)
3. Set the hashing **algorithm to MD5** (the app signs with MD5).
4. Configure the callback URLs in the shop settings:
   - **Result URL** = `https://YOUR-DOMAIN/api/robokassa/webhook` — **method must be POST** (this webhook only accepts POST; if it is set to GET, Premium will not activate).
   - **Success URL** = `https://YOUR-DOMAIN/ru/dashboard?checkout=processing`
   - **Fail URL** = `https://YOUR-DOMAIN/ru/pricing?checkout=failed`
5. Enable **recurring payments (рекуррентные платежи / Recurring)** for the shop — the first checkout sends `Recurring=true` so subsequent monthly charges can run automatically.
6. While developing, keep `ROBOKASSA_IS_TEST=1` to use Robokassa test mode; remove it (or set `0`) for live payments.

### 4. Configure environment variables

Copy `.env.example` to `.env.local` and fill in every value:

```bash
cp .env.example .env.local
```

### 5. Run the dev server

```bash
pnpm dev
```

Open <http://localhost:3000>. You'll be redirected to `/en` (or `/ru` based on your browser language).

### 6. Bootstrap the first admin

1. Sign up with the email you listed in `ADMIN_EMAILS`.
2. After confirming your email, send a one-shot request:
   ```bash
   curl -X POST http://localhost:3000/api/admin/bootstrap \
     --cookie "$(cat path/to/your-browser-cookie)"
   ```
   …or simply call it from your browser DevTools while logged in:
   ```js
   await fetch('/api/admin/bootstrap', { method: 'POST' }).then((r) => r.json())
   ```
3. Refresh — the **Admin** link will appear in the header.

## Deployment to Vercel

1. Push the repo to GitHub.
2. Import the project on <https://vercel.com>.
3. In **Settings → Environment Variables**, add every variable from `.env.example` (including `CRON_SECRET`).
4. Set `NEXT_PUBLIC_APP_URL` to your production URL (`https://bugattisound.online`).
5. In the Robokassa shop, set the **Result URL** to the production `https://bugattisound.online/api/robokassa/webhook` (POST) and update Success/Fail URLs to the production domain.
6. The Premium auto-renewal cron is defined in `vercel.json` (`/api/robokassa/autopay`, daily at 03:00 UTC) and is protected by `CRON_SECRET`.
7. In Supabase **Authentication → URL Configuration**, add the production URL plus `/auth/callback` to the allow-list.

## Project layout

```
src/
  app/
    [lang]/                 # locale-prefixed routes (en / ru)
      page.tsx              # landing
      catalog/page.tsx      # browse + filter
      track/[id]/page.tsx   # detail + player + download
      login | signup
      forgot-password | reset-password
      auth/callback         # Supabase OAuth/email callback
      upload                # user upload form
      dashboard             # subscription + my tracks
      admin                 # moderation panel
      pricing
    api/
      robokassa/{checkout,webhook,autopay}/route.ts
      cloudpayments/{checkout,portal,webhook,autopay}/route.ts  # legacy, unused by UI
      auth/telegram/route.ts
      tracks/[id]/download/route.ts
      admin/{moderate,bootstrap}/route.ts
  components/               # client + server components
  i18n/                     # en.json / ru.json + provider
  lib/
    supabase/{server,client,admin,proxy}.ts
    robokassa/server.ts
    cloudpayments/server.ts
    storage.ts
    email.ts
    env.ts
  types/db.ts
proxy.ts                    # locale routing + auth gate (was middleware.ts in Next 15)
supabase/migrations/        # SQL you run in Supabase SQL editor
```

## Scripts

| Command         | What it does                                |
|-----------------|---------------------------------------------|
| `pnpm dev`      | Start the local dev server                  |
| `pnpm build`    | Production build                            |
| `pnpm start`    | Run the production server                   |
| `pnpm lint`     | ESLint                                      |
| `pnpm typecheck`| `tsc --noEmit`                              |

## Security model

- **Row Level Security** is enabled on every table.
- Approved tracks are publicly readable; pending / rejected ones are visible only to their uploader and admins.
- Full audio lives in the **private** `audio-tracks` bucket — only reachable via signed URLs minted by the server after verifying the caller's `is_premium` flag (or `admin` role).
- Previews and covers live in **public** buckets so they can be streamed by anonymous visitors.
- The Robokassa Result webhook is verified by recomputing the MD5 signature `OutSum:InvId:Password2[:Shp_...]`; only on a match does the server use the service-role key to flip `profiles.is_premium`. Duplicate `InvId`s are ignored for idempotency.

## Roadmap (good first follow-ups)

- [ ] Server-side automatic preview generation (ffmpeg) so users don't have to upload one
- [ ] Waveform thumbnails on track cards
- [ ] User playlists / crates
- [ ] Email notifications when a track is approved/rejected
- [ ] More languages
