import { isLocale } from "@/i18n/config";
import { notFound } from "next/navigation";
import { getDictionary } from "@/i18n/dictionaries";
import { LoginForm } from "@/components/LoginForm";

export default async function LoginPage({
  params,
  searchParams,
}: PageProps<"/[lang]/login">) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();
  const sp = await searchParams;
  const next = typeof sp.next === "string" ? sp.next : `/${lang}`;
  const dict = await getDictionary(lang);

  return (
    <div className="max-w-md mx-auto px-4 py-16">
      <h1 className="text-3xl font-bold tracking-tight">{dict.auth.loginTitle}</h1>
      <div className="mt-6">
        <LoginForm locale={lang} next={next} dict={dict} mode="login" />
      </div>
    </div>
  );
}
