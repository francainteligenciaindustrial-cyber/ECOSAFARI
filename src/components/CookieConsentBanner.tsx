import React, { useState, useEffect } from "react";
import { Cookie } from "lucide-react";
import { navigate } from "../lib/router";

const STORAGE_KEY = "ecosafari_cookie_consent";

// LGPD requires informing visitors before non-essential cookies/trackers
// (e.g. Google Analytics, once installed) run. This only gates that consent
// signal — it doesn't load anything itself. Check localStorage.getItem(
// STORAGE_KEY) === "accepted" before initializing GA or similar.
export default function CookieConsentBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!localStorage.getItem(STORAGE_KEY)) setVisible(true);
  }, []);

  const decide = (value: "accepted" | "rejected") => {
    localStorage.setItem(STORAGE_KEY, value);
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div className="fixed bottom-0 inset-x-0 z-50 bg-editorial-primary text-[#FDFCF8] border-t border-white/10 px-6 py-5 md:py-4 animate-fadeIn">
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center gap-4 md:gap-8">
        <Cookie className="h-6 w-6 flex-shrink-0 hidden sm:block" />
        <p className="text-xs md:text-[13px] leading-relaxed flex-1 text-center md:text-left">
          Usamos cookies essenciais para o funcionamento do site e, mediante seu consentimento, cookies de análise para entender como os visitantes usam a EcoSafari Brasil. Saiba mais na nossa{" "}
          <a
            href="/privacidade"
            onClick={(e) => { e.preventDefault(); navigate("/privacidade"); }}
            className="underline font-semibold hover:opacity-80"
          >
            Política de Privacidade
          </a>.
        </p>
        <div className="flex items-center gap-3 flex-shrink-0">
          <button
            onClick={() => decide("rejected")}
            className="text-xs font-bold uppercase tracking-widest border border-white/30 px-4 py-2.5 rounded-md hover:bg-white/10 transition cursor-pointer"
          >
            Recusar
          </button>
          <button
            onClick={() => decide("accepted")}
            className="text-xs font-bold uppercase tracking-widest bg-white text-editorial-primary px-4 py-2.5 rounded-md hover:opacity-90 transition cursor-pointer"
          >
            Aceitar
          </button>
        </div>
      </div>
    </div>
  );
}
