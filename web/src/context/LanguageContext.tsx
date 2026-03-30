import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useAuth } from "./AuthContext";
import {
  LANGUAGE_STORAGE_KEY,
  languageToLocale,
  normalizeLanguage,
  type SupportedLanguage,
} from "../lib/language";
import { translate } from "../lib/i18n";

interface LanguageContextValue {
  language: SupportedLanguage;
  locale: string;
  setLanguage: (language: SupportedLanguage) => void;
  t: (key: string, fallback?: string) => string;
}

const LanguageContext = createContext<LanguageContextValue | null>(null);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [language, setLanguageState] = useState<SupportedLanguage>(() => {
    if (typeof window === "undefined") {
      return "pt";
    }
    return normalizeLanguage(localStorage.getItem(LANGUAGE_STORAGE_KEY));
  });

  useEffect(() => {
    if (!user?.preferred_lang) return;
    const nextLanguage = normalizeLanguage(user.preferred_lang);
    setLanguageState(nextLanguage);
    localStorage.setItem(LANGUAGE_STORAGE_KEY, nextLanguage);
  }, [user?.preferred_lang]);

  useEffect(() => {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
    document.documentElement.lang = languageToLocale(language);
  }, [language]);

  const value = useMemo(
    () => ({
      language,
      locale: languageToLocale(language),
      setLanguage: (nextLanguage: SupportedLanguage) => {
        setLanguageState(normalizeLanguage(nextLanguage));
      },
      t: (key: string, fallback?: string) => translate(language, key, fallback),
    }),
    [language],
  );

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error("useLanguage must be used within LanguageProvider");
  }
  return context;
}
