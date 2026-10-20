import React, { useEffect, useState } from "react";
import { Download, X } from "lucide-react";
import { useI18n } from "../i18n/I18nProvider";

const DISMISS_KEY = "ecosafari_install_dismissed";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

// Convite discreto para instalar o site como app (Android/Chrome/Edge). No
// iPhone o navegador não dispara o evento — lá a instalação é pelo menu
// "Compartilhar > Adicionar à Tela de Início", e o manifest já cobre isso.
export default function InstallPrompt() {
  const { t } = useI18n();
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    let dismissed = false;
    try { dismissed = localStorage.getItem(DISMISS_KEY) === "1"; } catch { /* sem localStorage */ }
    if (dismissed) return;
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  if (!deferred) return null;

  const dismiss = () => {
    try { localStorage.setItem(DISMISS_KEY, "1"); } catch { /* sem localStorage */ }
    setDeferred(null);
  };

  const install = async () => {
    await deferred.prompt();
    await deferred.userChoice.catch(() => null);
    setDeferred(null);
  };

  return (
    <div role="dialog" aria-label={t("pwa.install")} className="fixed bottom-4 left-4 right-4 sm:left-auto sm:right-6 sm:max-w-sm z-40 bg-white border border-editorial-border shadow-xl p-4 animate-fadeIn">
      <button type="button" onClick={dismiss} aria-label={t("pwa.dismiss")} className="absolute top-2 right-2 text-editorial-muted hover:text-editorial-text cursor-pointer"><X className="h-4 w-4" /></button>
      <p className="text-xs text-editorial-text leading-relaxed pr-5">{t("pwa.installHint")}</p>
      <div className="flex gap-2 mt-3">
        <button type="button" onClick={install} className="flex items-center gap-1.5 bg-editorial-primary text-white text-[10px] uppercase tracking-widest font-bold px-4 py-2 cursor-pointer">
          <Download className="h-3.5 w-3.5" /> {t("pwa.install")}
        </button>
        <button type="button" onClick={dismiss} className="text-[10px] uppercase tracking-widest font-bold text-editorial-muted px-3 cursor-pointer">{t("pwa.dismiss")}</button>
      </div>
    </div>
  );
}
