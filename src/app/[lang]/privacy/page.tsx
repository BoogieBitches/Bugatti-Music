import { isLocale } from "@/i18n/config";
import { notFound } from "next/navigation";
import { getDictionary } from "@/i18n/dictionaries";
import Link from "next/link";

export const metadata = {
  title: "Privacy Policy · Bugatti Sound",
  description:
    "How Bugatti Sound collects, stores, and processes your personal data.",
};

const LAST_UPDATED_ISO = "2026-05-05";

export default async function PrivacyPage({ params }: PageProps<"/[lang]/privacy">) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();
  const dict = await getDictionary(lang);
  const lp = `/${lang}`;
  const isRu = lang === "ru";

  return (
    <article className="max-w-3xl mx-auto px-4 py-16 md:py-20">
      <header className="mb-10">
        <div className="text-[11px] tracking-[0.28em] uppercase text-[var(--accent-3)] mb-3">
          {isRu ? "Правовое" : "Legal"}
        </div>
        <h1 className="font-display text-4xl md:text-5xl font-bold tracking-tight text-white">
          {dict.legal.privacy.title}
        </h1>
        <p className="mt-3 text-sm text-[var(--muted)]">
          {dict.legal.privacy.lastUpdated}: {LAST_UPDATED_ISO}
        </p>
        <p className="mt-6 text-[var(--muted)]">{dict.legal.privacy.intro}</p>
      </header>

      <div className="prose-legal space-y-8 text-[15px] leading-relaxed text-[var(--foreground)]/90">
        {isRu ? <PrivacyRu /> : <PrivacyEn />}
      </div>

      <div className="mt-14 pt-8 border-t border-[var(--border)] text-sm text-[var(--muted)]">
        <Link href={`${lp}/terms`} className="underline hover:text-white">
          {isRu ? "Условия использования" : "Terms of Service"}
        </Link>
        {" · "}
        <Link href={lp} className="underline hover:text-white">
          {isRu ? "На главную" : "Home"}
        </Link>
      </div>
    </article>
  );
}

function H2({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="font-display text-2xl md:text-3xl font-bold text-white mt-10 mb-3 tracking-tight">
      {children}
    </h2>
  );
}

function PrivacyRu() {
  return (
    <>
      <H2>1. Кто обрабатывает ваши данные</H2>
      <p>
        Оператор — проект Bugatti Sound (далее — «мы», «нас»). Связь: matrix198605@gmail.com.
      </p>

      <H2>2. Какие данные мы собираем</H2>
      <ul className="list-disc pl-6 space-y-2">
        <li>
          <strong>Регистрационные</strong>: email, имя (если указали), пароль в зашифрованном
          виде, дата регистрации.
        </li>
        <li>
          <strong>При входе через Google</strong>: email, публичное имя и аватар (только то, что
          вернул Google OAuth). Пароль Google мы не видим.
        </li>
        <li>
          <strong>Контент</strong>: загруженные вами треки, обложки, метаданные (название,
          артист, BPM, тональность, жанр, описание).
        </li>
        <li>
          <strong>Платёжные</strong>: данные о подписке (план, статус, даты). Номера карт мы
          не храним — их обрабатывает CloudPayments.
        </li>
        <li>
          <strong>Технические</strong>: IP, user-agent браузера, базовая информация о сессии для
          защиты от взломов.
        </li>
        <li>
          <strong>Активность</strong>: прослушанные превью, скачанные треки, статус модерации
          загруженного контента. Используется для показа персонального «Кабинета» и рекомендаций.
        </li>
      </ul>

      <H2>3. Зачем мы их обрабатываем</H2>
      <ul className="list-disc pl-6 space-y-2">
        <li>Чтобы предоставить вам сам Сервис (каталог, подписка, загрузка).</li>
        <li>
          Чтобы принимать платежи и подтверждать статус Premium (через CloudPayments).
        </li>
        <li>
          Чтобы отправлять транзакционные письма: подтверждение регистрации, сброс пароля,
          статус модерации трека, квитанции об оплате (через Resend).
        </li>
        <li>
          Чтобы модераторам было видно ваши загруженные треки и мы могли решать о их публикации.
        </li>
        <li>
          Чтобы обеспечивать безопасность (защита от ботов, спама, несанкционированных входов).
        </li>
      </ul>

      <H2>4. Кому мы передаём данные</H2>
      <p>Мы не продаём ваши данные рекламодателям. Мы используем следующих обработчиков:</p>
      <ul className="list-disc pl-6 space-y-2">
        <li>
          <strong>Supabase</strong> (инфраструктура: аутентификация, база данных, хранение
          файлов). Серверы находятся в ЕС.
        </li>
        <li>
          <strong>CloudPayments</strong> (платежи, ООО «Клаудпейментс», Россия). Номера карт и
          детали платежей хранятся у CloudPayments согласно их политике.
        </li>
        <li>
          <strong>Resend</strong> (отправка email). Получает ваш email и тему/содержимое письма.
        </li>
        <li>
          <strong>Vercel</strong> (хостинг фронтенда). Видит IP и user-agent при запросах.
        </li>
        <li>
          <strong>Google</strong> (если входите через Google OAuth) — получает информацию о
          факте входа в наш Сервис.
        </li>
      </ul>

      <H2>5. Сколько мы храним</H2>
      <ul className="list-disc pl-6 space-y-2">
        <li>Аккаунт и загруженные треки — пока вы их не удалите.</li>
        <li>Платёжная история — 6 лет (требование налогового и бухгалтерского учёта).</li>
        <li>Технические логи — 30 дней, затем автоматически удаляются.</li>
      </ul>

      <H2>6. Ваши права</H2>
      <p>Вы можете в любой момент:</p>
      <ul className="list-disc pl-6 space-y-2">
        <li>Запросить копию всех данных, которые мы о вас храним.</li>
        <li>Исправить неточные данные через настройки или поддержку.</li>
        <li>Удалить аккаунт (в разделе «Кабинет» или по запросу).</li>
        <li>Отозвать согласие на обработку (удаление аккаунта = отзыв).</li>
        <li>Пожаловаться в надзорный орган (в РФ — Роскомнадзор, в ЕС — местное DPA).</li>
      </ul>

      <H2>7. Cookies и аналитика</H2>
      <p>
        Мы используем только технически необходимые cookies для работы авторизации. Аналитики
        сторонних сервисов (Google Analytics, Meta Pixel и т.п.) на Сервисе сейчас не установлено.
        Если мы подключим аналитику — обновим эту политику и спросим согласие, где это требуется
        по GDPR.
      </p>

      <H2>8. Дети</H2>
      <p>
        Сервис не предназначен для лиц младше 16 лет. Если мы узнаем, что у нас есть аккаунт
        несовершеннолетнего без согласия родителей — мы удалим его.
      </p>

      <H2>9. Международная передача</H2>
      <p>
        Данные могут обрабатываться в России (CloudPayments, согласно 152-ФЗ), ЕС (Supabase) и США (Vercel,
        Resend, Google). Все поставщики прошли аудит безопасности и соответствуют GDPR.
      </p>

      <H2>10. Изменения политики</H2>
      <p>
        Мы уведомим вас о существенных изменениях по email и в интерфейсе минимум за 14 дней до
        вступления в силу.
      </p>

      <H2>11. Контакты</H2>
      <p>
        Вопросы по приватности: <a href="mailto:matrix198605@gmail.com" className="underline">matrix198605@gmail.com</a>.
      </p>
    </>
  );
}

function PrivacyEn() {
  return (
    <>
      <H2>1. Who processes your data</H2>
      <p>
        Data controller: the Bugatti Sound project (&quot;we&quot;, &quot;us&quot;). Contact:
        matrix198605@gmail.com.
      </p>

      <H2>2. What we collect</H2>
      <ul className="list-disc pl-6 space-y-2">
        <li>
          <strong>Registration</strong>: email, name (if provided), hashed password, sign-up date.
        </li>
        <li>
          <strong>Google sign-in</strong>: email, public name, avatar (only what Google OAuth
          returns). We never see your Google password.
        </li>
        <li>
          <strong>Content</strong>: tracks you upload, cover art, metadata (title, artist, BPM,
          key, genre, description).
        </li>
        <li>
          <strong>Billing</strong>: subscription details (plan, status, dates). We do NOT store
          card numbers — CloudPayments handles all card data.
        </li>
        <li>
          <strong>Technical</strong>: IP address, browser user-agent, minimal session info to
          prevent account takeovers.
        </li>
        <li>
          <strong>Activity</strong>: tracks previewed, tracks downloaded, moderation status of
          uploaded content. Used to power your Dashboard and recommendations.
        </li>
      </ul>

      <H2>3. Why we process it</H2>
      <ul className="list-disc pl-6 space-y-2">
        <li>To provide the Service (catalog, subscription, uploads).</li>
        <li>To process payments and confirm Premium status (via CloudPayments).</li>
        <li>
          To send transactional email: sign-up confirmation, password reset, upload moderation
          status, payment receipts (via Resend).
        </li>
        <li>
          To let moderators review uploaded tracks and decide about publication.
        </li>
        <li>To maintain security (anti-bot, anti-spam, anti-takeover).</li>
      </ul>

      <H2>4. Who we share data with</H2>
      <p>We never sell your data to advertisers. We use the following processors:</p>
      <ul className="list-disc pl-6 space-y-2">
        <li>
          <strong>Supabase</strong> (auth, database, file storage). Servers in the EU.
        </li>
        <li>
          <strong>CloudPayments</strong> (payments, CloudPayments LLC, Russia). Card details and
          payment records live with CloudPayments per their policy.
        </li>
        <li>
          <strong>Resend</strong> (email delivery). Receives your email address and message contents.
        </li>
        <li>
          <strong>Vercel</strong> (frontend hosting). Sees IP and user-agent on requests.
        </li>
        <li>
          <strong>Google</strong> (if you use Google Sign-in) — sees the fact that you logged in
          to our Service.
        </li>
      </ul>

      <H2>5. How long we keep it</H2>
      <ul className="list-disc pl-6 space-y-2">
        <li>Account and uploaded tracks — until you delete them.</li>
        <li>Billing records — 6 years (tax and bookkeeping requirement).</li>
        <li>Technical logs — 30 days, then auto-deleted.</li>
      </ul>

      <H2>6. Your rights</H2>
      <p>At any time you may:</p>
      <ul className="list-disc pl-6 space-y-2">
        <li>Request a copy of all data we hold about you.</li>
        <li>Correct inaccurate data via settings or support.</li>
        <li>Delete your account (from Dashboard or by request).</li>
        <li>Withdraw consent (deleting the account equals withdrawal).</li>
        <li>
          File a complaint with your local supervisory authority (e.g. your EU DPA, or the UK ICO).
        </li>
      </ul>

      <H2>7. Cookies and analytics</H2>
      <p>
        We only use strictly-necessary cookies for authentication. No third-party analytics
        (Google Analytics, Meta Pixel, etc.) is currently installed. If we add analytics we will
        update this policy and request consent where required by GDPR.
      </p>

      <H2>8. Children</H2>
      <p>
        The Service is not directed to users under 16. If we discover an account belongs to a
        minor without parental consent, we will delete it.
      </p>

      <H2>9. International transfers</H2>
      <p>
        Data may be processed in Russia (CloudPayments, under 152-FZ), the EU (Supabase) and the USA
        (Vercel, Resend, Google). All processors have been vetted and are GDPR-compliant.
      </p>

      <H2>10. Changes to this policy</H2>
      <p>
        We will notify you of material changes by email and in-app at least 14 days before they
        take effect.
      </p>

      <H2>11. Contact</H2>
      <p>
        Privacy questions: <a href="mailto:matrix198605@gmail.com" className="underline">matrix198605@gmail.com</a>.
      </p>
    </>
  );
}
