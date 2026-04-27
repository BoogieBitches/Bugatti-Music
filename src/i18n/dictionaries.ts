import "server-only";
import en from "./en.json";
import ru from "./ru.json";
import { type Locale } from "./config";

const dictionaries = { en, ru } as const;
export type Dictionary = typeof en;

export async function getDictionary(locale: Locale): Promise<Dictionary> {
  return dictionaries[locale] ?? dictionaries.en;
}
