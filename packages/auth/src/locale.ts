export const LOCALES = ["en", "fr"] as const;
export type Locale = (typeof LOCALES)[number];

const DEFAULT_LOCALE: Locale = "en";

const isLocale = (value: string): value is Locale =>
  LOCALES.some((locale) => locale === value);

export function resolveLocale(
  acceptLanguage: string | null | undefined
): Locale {
  for (const entry of acceptLanguage?.split(",") ?? []) {
    const language =
      entry.split(";")[0]?.trim().slice(0, 2).toLowerCase() ?? "";
    if (isLocale(language)) {
      return language;
    }
  }
  return DEFAULT_LOCALE;
}
