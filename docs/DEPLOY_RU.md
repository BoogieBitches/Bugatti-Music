# Bugatti Sound — деплой на Vercel (по шагам)

## 1. Что такое "репозиторий" (repo)

**Репозиторий** = папка с кодом сайта, хранится на GitHub. Ваш репо: **`BoogieBitches/Bugatti-Music`**.

- Адрес: https://github.com/BoogieBitches/Bugatti-Music
- Внутри: весь код сайта (Next.js + Supabase + Stripe).

Сейчас весь рабочий код лежит **в ветке** `devin/1777332310-music-pool-mvp` (это Pull Request #1: https://github.com/BoogieBitches/Bugatti-Music/pull/1). Нужно его **смерджить (merge)** в основную ветку `main` — тогда Vercel будет деплоить именно его.

### 1a. Как смерджить PR
1. Откройте: https://github.com/BoogieBitches/Bugatti-Music/pull/1
2. Прокрутите вниз → большая зелёная кнопка **"Merge pull request"** → **Confirm merge**.
3. После мёрджа можно нажать "Delete branch" — ветка больше не нужна.

После этого `main` содержит весь рабочий код.

---

## 2. Деплой на Vercel

### 2a. Регистрация (если ещё нет)
1. Откройте https://vercel.com/signup
2. Нажмите **"Continue with GitHub"** → войдите вашим GitHub-аккаунтом (`BoogieBitches`).
3. Выберите бесплатный тариф **Hobby** (для личных проектов — бесплатно навсегда).

### 2b. Импорт репо
1. После входа: https://vercel.com/new
2. Раздел **"Import Git Repository"** → если репо не виден, нажмите **"Adjust GitHub App Permissions"** → дайте Vercel доступ к `Bugatti-Music`.
3. Найдите `BoogieBitches/Bugatti-Music` → нажмите **"Import"**.

### 2c. Настройка проекта
На странице импорта Vercel сам определит:
- **Framework**: Next.js ✓
- **Build Command**: `next build` (по умолчанию, не трогайте)
- **Output Directory**: `.next` (не трогайте)
- **Install Command**: `pnpm install` (определится автоматически по `pnpm-lock.yaml`)

**ВАЖНО:** На этой же странице есть раздел **"Environment Variables"** — туда нужно вставить 6 ключей. **Не нажимайте Deploy раньше, чем их добавите.**

---

## 3. Environment Variables (env vars) — что и куда

**Что это:** секретные значения, которые Vercel передаёт сайту во время работы. У вас есть локальный файл `.env.local`, в который я их сохранил у себя на машине. На Vercel их нужно добавить через UI.

### 3a. Где взять значения

Все 6 значений у вас уже есть (вы мне их сами присылали). Вот напоминалка где что лежит:

| Переменная | Где взять |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase Dashboard → Settings → API → "Project URL" |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase Dashboard → Settings → API → "anon public" / publishable key |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase Dashboard → Settings → API → "service_role" / secret key (нажать "Reveal") |
| `STRIPE_SECRET_KEY` | Stripe Dashboard → Developers → API keys → "Secret key" |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Stripe Dashboard → Developers → API keys → "Publishable key" |
| `STRIPE_PREMIUM_PRICE_ID` | Stripe Dashboard → Product catalog → Bugatti Sound Premium → копировать "Price ID" (`price_...`) |

Я могу прислать вам ваши значения отдельным защищённым сообщением, если хотите — но Vercel поле для секретов само маскирует ввод, так что можно просто скопировать из `.env.local` который у меня (попросите, и я выдам).

### 3b. Куда вставить в Vercel

На странице импорта (или потом в **Settings → Environment Variables** уже созданного проекта):

Для каждой переменной:
1. **Name** — имя переменной (например `NEXT_PUBLIC_SUPABASE_URL`)
2. **Value** — значение
3. **Environment** — оставить все три галочки (Production, Preview, Development) ✓
4. Нажать **"Add"** (или Enter)
5. Повторить для всех 6 ключей.

После добавления всех 6 переменных нажать **"Deploy"** внизу страницы.

Деплой займёт ~1–2 минуты. После этого Vercel выдаст публичный URL вида `bugatti-music-<random>.vercel.app`.

---

## 4. После первого деплоя

### 4a. Обновить Site URL в Supabase
Чтобы письма-подтверждения (после регистрации) вели на ваш домен, а не на localhost:

1. https://supabase.com/dashboard/project/zfwgmrdtrbmvnrnisghp/auth/url-configuration
2. **Site URL**: вставьте ваш Vercel URL (например `https://bugatti-music-abcd.vercel.app`).
3. **Redirect URLs** → Add URL → `https://bugatti-music-abcd.vercel.app/**` (со звёздочками).
4. **Save**.

### 4b. Подключить Stripe webhook
Чтобы оплата автоматически включала премиум:

1. https://dashboard.stripe.com/test/webhooks → **+ Add endpoint**
2. **Endpoint URL**: `https://bugatti-music-abcd.vercel.app/api/stripe/webhook`
3. **Events to listen to**: добавить
   - `checkout.session.completed`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
4. **Add endpoint** → на странице нового вебхука будет блок **"Signing secret"** → "Reveal" → скопировать `whsec_...`.
5. Вернуться в Vercel → **Settings → Environment Variables** → добавить ещё одну переменную:
   - **Name**: `STRIPE_WEBHOOK_SECRET`
   - **Value**: `whsec_...`
6. Vercel → **Deployments** → последний деплой → **"..." → Redeploy** (чтобы новая env-переменная подтянулась).

### 4c. (Опционально) Подключить свой домен
Если у вас есть домен (например `bugattisound.com`):
1. Vercel → ваш проект → **Settings → Domains** → Add → ваш домен.
2. Vercel покажет какие DNS-записи (A или CNAME) нужно добавить у регистратора (Namecheap/GoDaddy/Reg.ru/etc.).
3. После DNS-обновления (от 5 минут до пары часов) сайт будет доступен по вашему домену.
4. Обновите Site URL в Supabase и Webhook URL в Stripe на новый домен.

---

## 5. Чек-лист

- [ ] Смерджил PR #1 в main
- [ ] Создал Vercel-аккаунт через GitHub
- [ ] Импортировал репо в Vercel
- [ ] Добавил 6 env vars
- [ ] Нажал Deploy → получил публичный URL
- [ ] Обновил Site URL и Redirect URLs в Supabase
- [ ] Создал Stripe webhook → добавил `STRIPE_WEBHOOK_SECRET` → передеплоил
- [ ] (опционально) Подключил свой домен

После всего — у вас рабочий сайт на публичном URL, регистрация, загрузка треков, модерация, оплата подписки тестовой картой `4242 4242 4242 4242` (любой будущий месяц/год, любой CVC, любой ZIP).
