import { isLocale } from "@/i18n/config";
import { notFound } from "next/navigation";
import { getDictionary } from "@/i18n/dictionaries";
import Link from "next/link";

export const metadata = {
  title: "Terms of Service · Bugatti Sound",
  description:
    "Terms of Service for Bugatti Sound — a DJ music pool with Premium subscription.",
};

const LAST_UPDATED_ISO = "2026-05-05";

export default async function TermsPage({ params }: PageProps<"/[lang]/terms">) {
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
          {dict.legal.terms.title}
        </h1>
        <p className="mt-3 text-sm text-[var(--muted)]">
          {dict.legal.terms.lastUpdated}: {LAST_UPDATED_ISO}
        </p>
        <p className="mt-6 text-[var(--muted)]">{dict.legal.terms.intro}</p>
      </header>

      <div className="prose-legal space-y-8 text-[15px] leading-relaxed text-[var(--foreground)]/90">
        {isRu ? <TermsRu lp={lp} /> : <TermsEn lp={lp} />}
      </div>

      <div className="mt-14 pt-8 border-t border-[var(--border)] text-sm text-[var(--muted)]">
        <Link href={`${lp}/privacy`} className="underline hover:text-white">
          {isRu ? "Политика конфиденциальности" : "Privacy Policy"}
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

function TermsRu({ lp }: { lp: string }) {
  return (
    <>
      <H2>1. О сервисе</H2>
      <p>
        Bugatti Sound — онлайн-пул музыкальных треков для диджеев (далее — «Сервис»).
        Сервис позволяет слушать 30-секундные превью, скачивать полные треки по подписке Premium,
        а зарегистрированным артистам — загружать свои треки на модерацию. Сервис работает
        по адресу bugatti-music.vercel.app и связанным доменам.
      </p>

      <H2>2. Принятие условий</H2>
      <p>
        Используя Сервис, вы подтверждаете, что прочитали и согласны с настоящими Условиями.
        Если вы не согласны с каким-либо пунктом — не используйте Сервис. Мы можем обновлять
        Условия; существенные изменения мы анонсируем по email или в интерфейсе Сервиса
        минимум за 14 дней до вступления в силу.
      </p>

      <H2>3. Аккаунт</H2>
      <p>
        Для скачивания треков и загрузки собственной музыки требуется регистрация. Вы отвечаете
        за сохранность пароля и все действия, совершённые под вашим аккаунтом. Если вы заметили
        подозрительную активность — немедленно смените пароль и напишите нам.
      </p>
      <p>
        Минимальный возраст — 16 лет (или возраст согласия в вашей стране, если он выше).
        Регистрируя аккаунт, вы подтверждаете этот возраст.
      </p>

      <H2>4. Подписка Premium</H2>
      <p>
        Premium — платная подписка за 499 ₽ в месяц. Premium даёт право скачивать
        полные версии одобренных треков без ограничений в течение срока подписки. Оплата
        списывается автоматически каждый месяц через платёжную систему ЮKassa (ООО НКО «ЮМани»,
        Россия).
      </p>
      <p>
        Вы можете отменить подписку в любой момент в разделе «Кабинет». После отмены доступ к
        Premium сохраняется до конца оплаченного периода. Возврат средств за неиспользованные дни
        внутри уже оплаченного периода не предусмотрен, кроме случаев, предусмотренных законом.
      </p>
      <p>
        Мы можем изменять цены; об этом мы предупреждаем минимум за 30 дней. Уже оплаченный
        период не пересчитывается задним числом.
      </p>

      <H2>5. Использование контента</H2>
      <p>
        Скачанные через Premium треки можно использовать в DJ-сетах, плейлистах, стримах и
        коммерческих выступлениях. Нельзя: перезаливать их на другие платформы, продавать как
        свою музыку, раздавать бесплатно третьим лицам. Авторские права на треки принадлежат
        их создателям — мы лишь предоставляем вам лицензию на воспроизведение в рамках ваших
        сетов.
      </p>
      <p>
        Если вы обнаружили, что в Сервисе размещён ваш трек без разрешения — напишите нам на
        matrix198605@gmail.com (или на временный адрес поддержки, указанный в профиле), и мы
        удалим его в течение 24 часов.
      </p>

      <H2>6. Загрузка своих треков</H2>
      <p>
        Загружая трек, вы подтверждаете, что вы — правообладатель (или имеете все необходимые
        лицензии), и даёте Сервису неэксклюзивное право хранить, воспроизводить и распространять
        этот трек подписчикам Premium. Вы сохраняете все авторские права и можете в любой момент
        потребовать удаления своего трека.
      </p>
      <p>
        Запрещены треки, содержащие: чужую музыку без разрешения, призывы к насилию,
        эксплицитный контент с несовершеннолетними, материалы, нарушающие законы страны
        нахождения Сервиса или вашего местонахождения.
      </p>
      <p>
        Модератор Сервиса оставляет за собой право отклонить трек без объяснения причин.
      </p>

      <H2>7. Запрещённое поведение</H2>
      <p>
        Нельзя: взламывать Сервис, использовать ботов для массового скачивания, распространять
        учётные данные, выдавать чужие треки за свои, спамить других пользователей. Нарушение
        ведёт к блокировке аккаунта без возврата средств.
      </p>

      <H2>8. Ответственность</H2>
      <p>
        Сервис предоставляется «как есть». Мы не гарантируем непрерывную работу и отсутствие
        ошибок. Максимальная совокупная ответственность Сервиса перед пользователем ограничена
        суммой, которую пользователь заплатил Сервису за последние 12 месяцев.
      </p>

      <H2>9. Расторжение</H2>
      <p>
        Вы можете удалить аккаунт в любое время в разделе «Кабинет». Мы можем заблокировать
        аккаунт в случае нарушения настоящих Условий, с уведомлением по email.
      </p>

      <H2>10. Контакты</H2>
      <p>
        Вопросы: <a href="mailto:matrix198605@gmail.com" className="underline">matrix198605@gmail.com</a>
        {" "}(или действующий адрес поддержки на странице <a href={`${lp}/`} className="underline">главной</a>).
        Юрисдикция: право Российской Федерации, если иное не предусмотрено императивными
        нормами применимого к пользователю права.
      </p>
    </>
  );
}

function TermsEn({ lp }: { lp: string }) {
  return (
    <>
      <H2>1. The Service</H2>
      <p>
        Bugatti Sound is an online music pool for DJs (the &quot;Service&quot;). The Service lets
        visitors listen to 30-second previews, download full tracks under a Premium subscription,
        and, for registered artists, upload their own tracks for moderation. The Service is
        available at bugatti-music.vercel.app and related domains.
      </p>

      <H2>2. Acceptance</H2>
      <p>
        By using the Service, you confirm that you have read and agree to these Terms. If you
        do not agree to any part of them, do not use the Service. We may update these Terms; we
        will announce material changes by email or in-app at least 14 days before they take effect.
      </p>

      <H2>3. Account</H2>
      <p>
        You need an account to download tracks and to upload your own music. You are responsible
        for the security of your password and for all actions taken under your account. If you
        notice suspicious activity, change your password immediately and contact us.
      </p>
      <p>
        You must be at least 16 (or your country&apos;s age of digital consent, whichever is higher)
        to create an account. By registering, you confirm you meet this requirement.
      </p>

      <H2>4. Premium subscription</H2>
      <p>
        Premium is a paid subscription at 499 ₽ per month. Premium grants unlimited downloads
        of approved full-length tracks during the subscription period. Payments are processed
        automatically each month via ЮKassa (YooMoney NBCO LLC, Russia).
      </p>
      <p>
        You may cancel anytime from your Dashboard. After cancellation, Premium access remains
        until the end of the paid period. We do not prorate refunds for unused days within an
        already-paid period, except where required by law.
      </p>
      <p>
        We may change pricing with at least 30 days&apos; notice. Already-paid periods are not
        re-charged.
      </p>

      <H2>5. Use of content</H2>
      <p>
        Tracks downloaded under Premium may be played in your DJ sets, playlists, streams, and
        paid performances. You may not: re-upload them to other platforms, sell them as your
        own work, or give them away for free to third parties. Copyright remains with the
        original creators; we grant you a license to perform within the scope of your sets.
      </p>
      <p>
        If you discover your track on the Service without permission, email
        matrix198605@gmail.com (or the support address shown in your profile); we will remove
        it within 24 hours.
      </p>

      <H2>6. Uploading your tracks</H2>
      <p>
        When you upload a track, you confirm that you are the rightsholder (or have all necessary
        licenses) and grant the Service a non-exclusive right to store, reproduce, and distribute
        that track to Premium subscribers. You retain all copyrights and may request removal of
        your track at any time.
      </p>
      <p>
        Forbidden: tracks containing third-party music without permission, incitement to
        violence, explicit content involving minors, or any material breaching the law of the
        Service&apos;s hosting jurisdiction or your own.
      </p>
      <p>Moderators may reject a track without giving reasons.</p>

      <H2>7. Prohibited conduct</H2>
      <p>
        You may not: attempt to hack the Service, use bots for bulk downloading, share credentials,
        pass off other people&apos;s tracks as your own, or spam other users. Violations result in
        account suspension without refund.
      </p>

      <H2>8. Liability</H2>
      <p>
        The Service is provided &quot;as is&quot;. We do not guarantee uninterrupted operation or
        the absence of errors. The Service&apos;s aggregate liability to a user is capped at the
        amount the user paid to the Service over the preceding 12 months.
      </p>

      <H2>9. Termination</H2>
      <p>
        You may delete your account at any time from your Dashboard. We may suspend accounts that
        breach these Terms, with email notice.
      </p>

      <H2>10. Contact</H2>
      <p>
        Questions: <a href="mailto:matrix198605@gmail.com" className="underline">matrix198605@gmail.com</a>
        {" "}(or the current support address listed on the <a href={`${lp}/`} className="underline">home page</a>).
        Governing law: the law of the Russian Federation, unless mandatory consumer-protection
        rules of your jurisdiction apply.
      </p>
    </>
  );
}
