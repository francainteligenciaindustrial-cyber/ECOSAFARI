import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { messages, MessageKey } from "./messages";

// i18n próprio para as telas que o turista estrangeiro usa (home, pousada,
// reserva). Antes tudo passava pelo Google Tradutor, que traduz mal, não é
// indexado pelo Google (SEO) e não funciona offline. Textos cadastrados pelos
// parceiros (descrição da pousada etc.) continuam no idioma original.
export type Lang = "pt" | "en" | "es";
export const SUPPORTED_LANGS: Lang[] = ["pt", "en", "es"];
export const LANG_KEY = "ecosafari_lang";

const LOCALES: Record<Lang, string> = { pt: "pt-BR", en: "en-US", es: "es-ES" };

function detectInitialLang(): Lang {
  try {
    const saved = localStorage.getItem(LANG_KEY);
    if (saved && (SUPPORTED_LANGS as string[]).includes(saved)) return saved as Lang;
    if (saved) return "pt"; // de/fr: ficam com o Google Tradutor por cima do pt
  } catch { /* sem localStorage */ }
  const nav = (typeof navigator !== "undefined" && navigator.language) || "pt";
  if (nav.startsWith("es")) return "es";
  if (nav.startsWith("en")) return "en";
  return "pt";
}

export function translate(lang: Lang, key: MessageKey, vars?: Record<string, string | number>): string {
  const entry = messages[key];
  let text: string = entry?.[lang] ?? entry?.pt ?? key;
  if (vars) for (const [k, v] of Object.entries(vars)) text = text.split(`{${k}}`).join(String(v));
  return text;
}

interface I18nValue {
  lang: Lang;
  locale: string;
  setLang: (lang: Lang) => void;
  t: (key: MessageKey, vars?: Record<string, string | number>) => string;
  formatDate: (iso: string, opts?: Intl.DateTimeFormatOptions) => string;
  formatMoney: (value: number) => string;
}

const I18nContext = createContext<I18nValue | null>(null);

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>(detectInitialLang);

  useEffect(() => {
    document.documentElement.lang = LOCALES[lang];
  }, [lang]);

  const setLang = useCallback((next: Lang) => {
    try { localStorage.setItem(LANG_KEY, next); } catch { /* sem localStorage */ }
    setLangState(next);
  }, []);

  const value = useMemo<I18nValue>(() => ({
    lang,
    locale: LOCALES[lang],
    setLang,
    t: (key, vars) => translate(lang, key, vars),
    formatDate: (iso, opts) => new Date(iso.length === 10 ? `${iso}T12:00:00` : iso).toLocaleDateString(LOCALES[lang], opts),
    // Valores sempre em reais — só a formatação muda com o idioma.
    formatMoney: value => value.toLocaleString(LOCALES[lang], { style: "currency", currency: "BRL", maximumFractionDigits: 0 }),
  }), [lang, setLang]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  const ctx = useContext(I18nContext);
  if (ctx) return ctx;
  // Fora do provider (testes, páginas isoladas): português, sem quebrar.
  return {
    lang: "pt",
    locale: "pt-BR",
    setLang: () => {},
    t: (key, vars) => translate("pt", key, vars),
    formatDate: (iso, opts) => new Date(iso.length === 10 ? `${iso}T12:00:00` : iso).toLocaleDateString("pt-BR", opts),
    formatMoney: value => value.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }),
  };
}
