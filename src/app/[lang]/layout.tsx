import { notFound } from "next/navigation";
import { I18nProvider } from "@/i18n/I18nProvider";
import { getDictionary } from "@/i18n/dictionaries";
import { isLocale } from "@/i18n/config";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import "../globals.css";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Bugatti Sound",
  description: "The music pool for serious DJs",
};

export default async function LangLayout({
  children,
  params,
}: LayoutProps<"/[lang]">) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();
  const dict = await getDictionary(lang);

  return (
    <html lang={lang}>
      <body>
        <I18nProvider locale={lang} dict={dict}>
          <div className="min-h-screen flex flex-col">
            <Header locale={lang} />
            <main className="flex-1">{children}</main>
            <Footer locale={lang} />
          </div>
        </I18nProvider>
      </body>
    </html>
  );
}
