import React, { useState, useEffect, useRef } from "react";
import { Globe, Check } from "lucide-react";

const LANG_KEY = "ecosafari_lang";

const LANGS = [
  { code: "pt", label: "Português" },
  { code: "en", label: "English" },
  { code: "es", label: "Español" },
  { code: "de", label: "Deutsch" },
  { code: "fr", label: "Français" },
];

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
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState<string>(() => {
    try {
      return localStorage.getItem(LANG_KEY) || "pt";
    } catch {
      return "pt";
    }
  });
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (current === "pt") return;
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

  const applyLanguage = (lang: string) => {
    setOpen(false);
    try {
      localStorage.setItem(LANG_KEY, lang);
    } catch {
      // ignore
    }
    setCurrent(lang);

    if (lang === "pt") {
      clearGoogTransCookie();
      window.location.reload();
      return;
    }

    setGoogTransCookie(lang);
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
        className="flex items-center gap-1 text-editorial-muted hover:text-editorial-text transition cursor-pointer"
        title="Traduzir site / Translate site"
      >
        <Globe className="h-3.5 w-3.5" />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-2 bg-white border border-editorial-border rounded-lg shadow-lg py-1 w-36 z-50">
          {LANGS.map(l => (
            <button
              key={l.code}
              type="button"
              onClick={() => applyLanguage(l.code)}
              className="w-full flex items-center justify-between gap-2 px-3 py-2 text-xs text-left text-zinc-700 hover:bg-zinc-50 transition cursor-pointer"
            >
              {l.label}
              {current === l.code && <Check className="h-3 w-3 text-emerald-600" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
