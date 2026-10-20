import React, { useState, useEffect, useRef } from "react";
import { Globe, Check } from "lucide-react";
import { useI18n, LANG_KEY, Lang, SUPPORTED_LANGS } from "../i18n/I18nProvider";

// pt/en/es: tradução própria (src/i18n). de/fr: ainda pelo Google Tradutor
// por cima do português, marcados como "tradução automática".
const LANGS = [
  { code: "pt", label: "Português", native: true },
  { code: "en", label: "English", native: true },
  { code: "es", label: "Español", native: true },
  { code: "de", label: "Deutsch", native: false },
  { code: "fr", label: "Français", native: false },
];

const isNative = (code: string): code is Lang => (SUPPORTED_LANGS as string[]).includes(code);

declare global {
  interface Window {
    google?: any;
    googleTranslateElementInit?: () => void;
  }
}

let scriptLoading = false;

function loadGoogleTranslate(onReady: () => void) {
  if (window.google?.translate) {
    onReady();
    return;
  }
  if (scriptLoading) {
    const check = setInterval(() => {
      if (window.google?.translate) {
        clearInterval(check);
        onReady();
      }
    }, 200);
    return;
  }
  scriptLoading = true;
  window.googleTranslateElementInit = () => {
    new window.google.translate.TranslateElement(
      { pageLanguage: "pt", includedLanguages: "en,es,de,fr", autoDisplay: false },
      "google_translate_element"
    );
    onReady();
  };
  const script = document.createElement("script");
  script.src = "https://translate.google.com/translate_a/element.js?cb=googleTranslateElementInit";
  document.body.appendChild(script);
}

function setGoogTransCookie(lang: string) {
  const value = `/pt/${lang}`;
  document.cookie = `googtrans=${value};path=/`;
  document.cookie = `googtrans=${value};path=/;domain=${window.location.hostname}`;
}

function clearGoogTransCookie() {
  document.cookie = "googtrans=;path=/;expires=Thu, 01 Jan 1970 00:00:00 GMT";
  document.cookie = `googtrans=;path=/;domain=${window.location.hostname};expires=Thu, 01 Jan 1970 00:00:00 GMT`;
}

// A construtora new google.translate.TranslateElement(...) retorna na hora,
// mas o próprio <select class="goog-te-combo"> só é injetado no DOM um
// tempinho depois (o widget ainda busca recursos e monta um iframe por trás
// dos panos) — checar uma única vez logo após "pronto" (como o código fazia
// antes) quase sempre encontra null e cai no reload, que também nem sempre
// resolve. Isso fazia o app trocar o cookie/checkbox de idioma sem a
// tradução de fato acontecer. Repetir a checagem por alguns segundos dá
// tempo do select aparecer de verdade.
function waitForTranslateSelect(onFound: (select: HTMLSelectElement) => void, onGiveUp: () => void) {
  let attempts = 0;
  const tick = () => {
    const select = document.querySelector<HTMLSelectElement>("#google_translate_element select.goog-te-combo");
    if (select) {
      onFound(select);
      return;
    }
    attempts++;
    if (attempts >= 20) {
      onGiveUp();
      return;
    }
    setTimeout(tick, 250);
  };
  tick();
}

// Subtle "translate the whole site" switcher — machine translation via
// Google's Website Translator, driven by our own minimal dropdown instead
// of Google's default banner. Preference persists across pages via
// localStorage (for our UI) and the googtrans cookie (drives the actual
// translation on every subsequent page load, including new tabs).
export default function LanguageSwitcher() {
  const { t, lang, setLang } = useI18n();
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState<string>(() => {
    try {
      const saved = localStorage.getItem(LANG_KEY);
      return saved && !isNative(saved) ? saved : lang;
    } catch {
      return lang;
    }
  });
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isNative(current)) return;
    // O cookie googtrans já devia bastar pro widget se auto-aplicar ao
    // carregar, mas na prática isso nem sempre acontece (daí o bug relatado:
    // o dropdown mostrava o idioma marcado, mas a página continuava em
    // português) — então reforça aqui, setando o <select> explicitamente
    // assim que ele existir, igual ao clique manual faz.
    loadGoogleTranslate(() => {
      waitForTranslateSelect(
        select => {
          if (select.value !== current) {
            select.value = current;
            select.dispatchEvent(new Event("change"));
          }
        },
        () => {}
      );
    });
  }, []);

  useEffect(() => {
    const onClickOutside = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  const applyLanguage = (code: string) => {
    setOpen(false);
    const wasMachine = !isNative(current);
    setCurrent(code);

    if (isNative(code)) {
      setLang(code);
      // Saindo de de/fr: o Google Tradutor já reescreveu o DOM, só um
      // reload limpo devolve o texto original.
      if (wasMachine) {
        clearGoogTransCookie();
        window.location.reload();
      }
      return;
    }

    // de/fr traduzem a partir do português.
    setLang("pt");
    try {
      localStorage.setItem(LANG_KEY, code);
    } catch {
      // ignore
    }
    setGoogTransCookie(code);
    loadGoogleTranslate(() => {
      waitForTranslateSelect(
        select => {
          select.value = lang;
          select.dispatchEvent(new Event("change"));
        },
        // Só o cookie foi setado até aqui — um reload deixa a aplicação da
        // tradução por conta do próprio widget (que lê o googtrans ao
        // montar, reforçado pelo useEffect acima).
        () => window.location.reload()
      );
    });
  };

  return (
    <div ref={boxRef} className="relative notranslate">
      <div id="google_translate_element" />
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1 text-editorial-muted hover:text-editorial-text transition cursor-pointer text-[10px] uppercase tracking-widest font-bold"
        title={t("lang.button")}
        aria-label={t("lang.button")}
        aria-expanded={open}
        aria-haspopup="menu"
      >
        <Globe className="h-3.5 w-3.5" /> <span aria-hidden="true">{current.toUpperCase()}</span>
      </button>
      {open && (
        <div role="menu" className="absolute right-0 top-full mt-2 bg-white border border-editorial-border rounded-lg shadow-lg py-1 w-48 z-50">
          {LANGS.map(l => (
            <button
              key={l.code}
              type="button"
              role="menuitemradio"
              aria-checked={current === l.code}
              lang={l.code}
              onClick={() => applyLanguage(l.code)}
              className="w-full flex items-center justify-between gap-2 px-3 py-2 text-xs text-left text-zinc-700 hover:bg-zinc-50 transition cursor-pointer"
            >
              <span>
                {l.label}
                {!l.native && <span className="block text-[9px] text-editorial-muted">{t("lang.auto")}</span>}
              </span>
              {current === l.code && <Check className="h-3 w-3 text-emerald-600" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
