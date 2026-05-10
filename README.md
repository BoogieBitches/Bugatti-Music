# Bugatti Sound

A modern music pool (DJ-City / ZipDJ / BPM Supreme style) built with Next.js 16, Supabase, and ЮKassa. Free to listen, premium to download. Built for top DJs.

## Stack

- **Next.js 16** (App Router) + TypeScript + Tailwind v4
- **Supabase**: Postgres + Auth (email + Google OAuth) + Storage
- **ЮKassa**: subscription billing for the Premium plan (RUB)
- **i18n**: built-in dictionaries for `en` and `ru`, locale-prefixed routes (`/en/...`, `/ru/...`)
- **Vercel**: free hosting target

## Features

- Catalog with genre / BPM / key / search filters
- 30-second public previews; full-quality downloads gated by Premium subscription
- Cover artwork with optional looping video / animated GIF
- User uploads with admin moderation (`pending` → `approved` / `rejected`)
- Admin moderation panel (auto-shows for users with `role = 'admin'`)
- User dashboard with subscription status & track history
- ЮKassa hosted payment page, autopay via saved payment method, webhook-driven Premium entitlement
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
3. Open the **SQL Editor** and run the migrations from `supabase/migrations/` in order:
   - `001_init.sql` — tables, RLS, triggers
   - `002_storage.sql` — buckets and storage policies
   - `003_seed_genres.sql` — initial genre list
4. (Optional) **Authentication → Providers → Google**: paste the Client ID / Secret you create in Google Cloud Console for OAuth login.

### 3. Set up ЮKassa

1. Sign up at <https://yookassa.ru> (самозанятый / ИП / ООО).
2. In ЛК ЮKassa create a **test shop** for development (separate `shopId` with a `test_*` secret key) — see <https://yookassa.ru/developers/payment-acceptance/testing-and-going-live/testing>.
3. **Settings → Ключи API → "Выпустить секретный ключ"** for both the test and live shops. Copy the key the moment it is shown — ЮKassa only displays it once.
4. **Settings → Уведомления (HTTP)** → add a notification URL pointing at `https://YOUR-DOMAIN/api/yookassa/webhook` and subscribe to:
   - `payment.succeeded`
   - `payment.canceled`
   - `refund.succeeded`

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
3. In **Settings → Environment Variables**, add every variable from `.env.example`.
4. Set `NEXT_PUBLIC_APP_URL` to your production URL (e.g. `https://bugatti-sound.vercel.app`).
5. After the first deploy, update your ЮKassa notification (webhook) URL to point at the production `/api/yookassa/webhook`.
6. In Supabase **Authentication → URL Configuration**, add the production URL plus `/auth/callback` to the allow-list.

## Project layout

```
src/
  app/
    [lang]/                 # locale-prefixed routes (en / ru)
      page.tsx              # landing
      catalog/page.tsx      # browse + filter
      track/[id]/page.tsx   # detail + player + download
      login | signup
      auth/callback         # Supabase OAuth/email callback
      upload                # user upload form
      dashboard             # subscription + my tracks
      admin                 # moderation panel
      pricing
    api/
      yookassa/{checkout,portal,webhook}/route.ts
      tracks/[id]/download/route.ts
      admin/{moderate,bootstrap}/route.ts
  components/               # client + server components
  i18n/                     # en.json / ru.json + provider
  lib/
    supabase/{server,client,admin,proxy}.ts
    yookassa/server.ts
    storage.ts
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
- ЮKassa webhooks re-fetch each payment via the API to verify it (ЮKassa does not sign webhook bodies) and use the service-role key to flip `profiles.is_premium`.

## Roadmap (good first follow-ups)

- [ ] Server-side automatic preview generation (ffmpeg) so users don't have to upload one
- [ ] Waveform thumbnails on track cards
- [ ] User playlists / crates
- [ ] Email notifications when a track is approved/rejected
- [ ] More languages
