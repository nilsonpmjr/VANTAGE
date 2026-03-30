export type SupportedLanguage = "pt" | "en" | "es";

export const LANGUAGE_STORAGE_KEY = "vantage.ui.language";

export function normalizeLanguage(value?: string | null): SupportedLanguage {
  if (value === "en" || value === "es" || value === "pt") {
    return value;
  }
  return "pt";
}

export function languageToLocale(language: SupportedLanguage) {
  switch (language) {
    case "en":
      return "en-US";
    case "es":
      return "es-ES";
    default:
      return "pt-BR";
  }
}
