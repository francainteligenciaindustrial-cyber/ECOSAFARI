import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { messages, MessageKey } from "./messages";

// i18n próprio para as telas que o turista estrangeiro usa (home, pousada,
// reserva). Antes tudo passava pelo Google Tradutor, que traduz mal, não é
// indexado pelo Google (SEO) e não funciona offline. Textos cadastrados pelos
// parceiros (descrição da pousada etc.) continuam no idioma original.
export type Lang = "pt" | "en" | "es";
export const SUPPORTED_LANGS: Lang[] = ["pt", "en", "es"];
export const LANG_KEY = "ecosafari_lang";
export const CURRENCY_KEY = "ecosafari_currency";
export type Currency = "BRL" | "USD" | "EUR";
export const CURRENCIES: Currency[] = ["BRL", "USD", "EUR"];

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
  // Sempre em reais; com outra moeda escolhida, acrescenta o aproximado
  // ("R$ 1.500 (≈ US$ 280)"). A cobrança é sempre em reais.
  formatMoney: (value: number) => string;
  currency: Currency;
  setCurrency: (c: Currency) => void;
  rates: { USD: number; EUR: number } | null;
}

const brl = (locale: string, value: number) => value.toLocaleString(locale, { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

function formatWithCurrency(locale: string, value: number, currency: Currency, rates: { USD: number; EUR: number } | null): string {
  const base = brl(locale, value);
  if (currency === "BRL" || !rates) return base;
  const converted = value * rates[currency];
  return `${base} (≈ ${converted.toLocaleString(locale, { style: "currency", currency, maximumFractionDigits: 0 })})`;
}

function detectInitialCurrency(lang: Lang): Currency {
  try {
    const saved = localStorage.getItem(CURRENCY_KEY);
    if (saved && (CURRENCIES as string[]).includes(saved)) return saved as Currency;
  } catch { /* sem localStorage */ }
  return lang === "pt" ? "BRL" : "USD";
}

const I18nContext = createContext<I18nValue | null>(null);

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>(detectInitialLang);
  const [currency, setCurrencyState] = useState<Currency>(() => detectInitialCurrency(detectInitialLang()));
  const [rates, setRates] = useState<{ USD: number; EUR: number } | null>(null);

  // Cotação só é buscada quando alguém escolhe outra moeda.
  useEffect(() => {
    if (currency === "BRL" || rates) return;
    fetch("/api/cambio").then(r => (r.ok ? r.json() : null)).then(d => { if (d?.rates) setRates(d.rates); }).catch(() => {});
  }, [currency, rates]);

  const setCurrency = useCallback((c: Currency) => {
    try { localStorage.setItem(CURRENCY_KEY, c); } catch { /* sem localStorage */ }
    setCurrencyState(c);
  }, []);

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
    formatMoney: value => formatWithCurrency(LOCALES[lang], value, currency, rates),
    currency,
    setCurrency,
    rates,
  }), [lang, setLang, currency, setCurrency, rates]);

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
    formatMoney: value => brl("pt-BR", value),
    currency: "BRL",
    setCurrency: () => {},
    rates: null,
  };
}
