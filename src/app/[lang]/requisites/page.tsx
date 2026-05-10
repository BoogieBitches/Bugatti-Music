import { isLocale } from "@/i18n/config";
import { notFound } from "next/navigation";
import { getDictionary } from "@/i18n/dictionaries";
import Link from "next/link";

export const metadata = {
  title: "Реквизиты · Bugatti Sound",
  description:
    "Сведения о владельце сервиса Bugatti Sound в соответствии с требованиями законодательства РФ.",
};

const OWNER = {
  fullName: "Карачалов Юрий Алексеевич",
  inn: "352531433045",
  status: "Самозанятый (плательщик НПД, регистрация ФНС России)",
  email: "matrix198605@gmail.com",
  site: "bugatti-music.vercel.app",
};

export default async function RequisitesPage({
  params,
}: PageProps<"/[lang]/requisites">) {
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
          {dict.legal.requisites.title}
        </h1>
        <p className="mt-6 text-[var(--muted)]">{dict.legal.requisites.intro}</p>
      </header>

      <div className="bs-card p-6 md:p-8 space-y-5 text-[15px] leading-relaxed">
        <Row
          label={isRu ? "Наименование сервиса" : "Service name"}
          value="Bugatti Sound"
        />
        <Row
          label={isRu ? "Адрес сайта" : "Website"}
          value={
            <a
              href={`https://${OWNER.site}`}
              className="underline hover:text-white"
              target="_blank"
              rel="noopener noreferrer"
            >
              {OWNER.site}
            </a>
          }
        />
        <Row label={isRu ? "ФИО владельца" : "Owner"} value={OWNER.fullName} />
        <Row label="ИНН" value={OWNER.inn} />
        <Row
          label={isRu ? "Налоговый статус" : "Tax status"}
          value={
            isRu
              ? OWNER.status
              : "Self-employed (NPD taxpayer, registered with the Russian Federal Tax Service)"
          }
        />
        <Row
          label={isRu ? "Контактный email" : "Contact email"}
          value={
            <a
              href={`mailto:${OWNER.email}`}
              className="underline hover:text-white"
            >
              {OWNER.email}
            </a>
          }
        />
        <Row
          label={isRu ? "Платёжный провайдер" : "Payment provider"}
          value={
            isRu
              ? "ООО НКО «ЮМани» (ЮKassa), Россия"
              : "YooMoney NBCO LLC (ЮKassa), Russia"
          }
        />
      </div>

      <p className="mt-10 text-sm text-[var(--muted)]">
        {isRu
          ? "Данные приведены в соответствии с требованиями ФЗ-54 «О применении контрольно-кассовой техники» и условиями приёма платежей через ЮKassa для самозанятых."
          : "These details are provided in compliance with Russian Federal Law 54-FZ on cash registers and ЮKassa requirements for self-employed merchants."}
      </p>

      <div className="mt-14 pt-8 border-t border-[var(--border)] text-sm text-[var(--muted)]">
        <Link href={`${lp}/terms`} className="underline hover:text-white">
          {dict.footer.terms}
        </Link>
        {" · "}
        <Link href={`${lp}/privacy`} className="underline hover:text-white">
          {dict.footer.privacy}
        </Link>
        {" · "}
        <Link href={lp} className="underline hover:text-white">
          {isRu ? "На главную" : "Home"}
        </Link>
      </div>
    </article>
  );
}

function Row({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex flex-col md:flex-row md:items-baseline gap-1 md:gap-6">
      <div className="md:w-56 shrink-0 text-xs uppercase tracking-[0.18em] text-[var(--muted)]">
        {label}
      </div>
      <div className="text-white">{value}</div>
    </div>
  );
}
