import { isLocale } from "@/i18n/config";
import { notFound } from "next/navigation";
import { AIMixStudio } from "@/components/AIMixStudio";

export default async function AIMixStudioPage({
  params,
}: PageProps<"/[lang]/ai-mix-studio">) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();

  return <AIMixStudio />;
}
