import { notFound } from "next/navigation";
import { Inter, Space_Grotesk, Permanent_Marker, Bebas_Neue } from "next/font/google";
import { I18nProvider } from "@/i18n/I18nProvider";
import { getDictionary } from "@/i18n/dictionaries";
import { isLocale } from "@/i18n/config";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { AuroraBackground } from "@/components/AuroraBackground";
import { GrainOverlay } from "@/components/GrainOverlay";
import { CursorSpotlight } from "@/components/CursorSpotlight";
import { SideRailServer } from "@/components/SideRailServer";
import { PlayerProvider } from "@/components/player/PlayerStore";
import { PlayerBar } from "@/components/player/PlayerBar";
import "../globals.css";

export const dynamic = "force-dynamic";

const sans = Inter({
  subsets: ["latin", "cyrillic"],
  variable: "--font-sans",
  display: "swap",
});

const display = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap",
  weight: ["500", "600", "700"],
});

const graffiti = Permanent_Marker({
  subsets: ["latin"],
  variable: "--font-graffiti",
  display: "swap",
  weight: ["400"],
});

const billboard = Bebas_Neue({
  subsets: ["latin"],
  variable: "--font-billboard",
  display: "swap",
  weight: ["400"],
});

export const metadata = {
  title: "Bugatti Sound — premium music pool for DJs",
  description:
    "Curated tracks, premium downloads, instant streaming. Built for serious DJs.",
  icons: {
    icon: [
      { url: "/icon.png", sizes: "32x32", type: "image/png" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/apple-icon.png", sizes: "180x180", type: "image/png" }],
  },
  openGraph: {
    title: "Bugatti Sound",
    description: "Premium music pool for serious DJs.",
    images: [{ url: "/og-image.jpg", width: 1200, height: 630 }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Bugatti Sound",
    description: "Premium music pool for serious DJs.",
    images: ["/og-image.jpg"],
  },
};

export default async function LangLayout({
  children,
  params,
}: LayoutProps<"/[lang]">) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();
  const dict = await getDictionary(lang);

  return (
    <html
      lang={lang}
      className={`${sans.variable} ${display.variable} ${graffiti.variable} ${billboard.variable}`}
    >
      <body>
        <AuroraBackground />
        <GrainOverlay />
        <CursorSpotlight />
        <I18nProvider locale={lang} dict={dict}>
          <PlayerProvider>
            <SideRailServer locale={lang} />
            <div className="relative min-h-screen flex flex-col md:pl-[56px]">
              <Header locale={lang} />
              <main className="flex-1">{children}</main>
              <Footer locale={lang} />
            </div>
            <PlayerBar />
          </PlayerProvider>
        </I18nProvider>
      </body>
    </html>
  );
}
