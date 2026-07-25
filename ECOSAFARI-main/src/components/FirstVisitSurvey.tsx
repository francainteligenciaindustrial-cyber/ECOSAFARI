import React, { useState, useEffect } from "react";
import { Youtube, Instagram, Facebook, Users, Sparkles, Compass } from "lucide-react";
import { ReferralSource } from "../types";

const STORAGE_KEY = "ecosafari_referral_answered";

const OPTIONS: { id: ReferralSource["source"]; label: string; icon: React.ReactNode }[] = [
  { id: "youtube", label: "YouTube", icon: <Youtube className="h-5 w-5" /> },
  { id: "instagram", label: "Instagram", icon: <Instagram className="h-5 w-5" /> },
  { id: "facebook", label: "Facebook", icon: <Facebook className="h-5 w-5" /> },
  { id: "friend", label: "Indicação de um amigo", icon: <Users className="h-5 w-5" /> },
  { id: "other", label: "Outras redes", icon: <Sparkles className="h-5 w-5" /> },
];

export default function FirstVisitSurvey() {
  const [visible, setVisible] = useState(false);
  const [showOtherInput, setShowOtherInput] = useState(false);
  const [otherText, setOtherText] = useState("");
  const [answered, setAnswered] = useState(false);

  useEffect(() => {
    if (localStorage.getItem(STORAGE_KEY)) return;
    const timer = setTimeout(() => setVisible(true), 1200);
    return () => clearTimeout(timer);
  }, []);

  const submit = (source: ReferralSource["source"], text?: string) => {
    localStorage.setItem(STORAGE_KEY, "1");
    fetch("/api/referral-sources", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ source, otherText: text }),
    }).catch(() => {});
    setAnswered(true);
    setTimeout(() => setVisible(false), 1300);
  };

  if (!visible) return null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fadeIn">
      <div className="bg-editorial-bg border border-editorial-border w-full max-w-sm shadow-xl rounded-lg">
        <div className="p-8">
          {answered ? (
            <div className="text-center py-4">
              <p className="text-2xl mb-2">🌿</p>
              <p className="text-sm text-editorial-primary font-semibold">
                Obrigado por responder! Isso nos ajuda a levar a EcoSafari pra mais gente.
              </p>
            </div>
          ) : !showOtherInput ? (
            <>
              <div className="flex items-center gap-2 mb-1">
                <Compass className="h-4 w-4 text-editorial-primary" />
                <h2 className="text-xs uppercase tracking-[0.2em] font-bold text-editorial-primary">
                  Antes de continuar
                </h2>
              </div>
              <p className="text-editorial-text text-base font-serif font-bold mb-1">Como você chegou até nós?</p>
              <p className="text-editorial-muted text-xs mb-6">Ajuda a gente a saber onde encontrar mais gente como você.</p>

              <div className="grid grid-cols-1 gap-2">
                {OPTIONS.map(opt => (
                  <button
                    key={opt.id}
                    onClick={() => opt.id === "other" ? setShowOtherInput(true) : submit(opt.id)}
                    className="flex items-center gap-2.5 text-left text-sm text-editorial-text border border-editorial-border hover:border-editorial-primary hover:bg-white transition px-3 py-2.5 rounded-md cursor-pointer"
                  >
                    {opt.icon} {opt.label}
                  </button>
                ))}
              </div>
            </>
          ) : (
            <>
              <div className="flex items-center gap-2 mb-1">
                <Compass className="h-4 w-4 text-editorial-primary" />
                <h2 className="text-xs uppercase tracking-[0.2em] font-bold text-editorial-primary">
                  Antes de continuar
                </h2>
              </div>
              <p className="text-editorial-text text-base font-serif font-bold mb-4">Nos conta rapidinho:</p>
              <form onSubmit={(e) => { e.preventDefault(); submit("other", otherText); }} className="flex flex-col gap-3">
                <input
                  type="text"
                  autoFocus
                  required
                  value={otherText}
                  onChange={(e) => setOtherText(e.target.value)}
                  placeholder="Ex: Google, TikTok, evento..."
                  className="w-full border border-editorial-border bg-white/60 px-3 py-2 text-sm rounded-md focus:outline-none focus:ring-1 focus:ring-editorial-primary"
                />
                <button
                  type="submit"
                  className="bg-editorial-primary text-white text-xs uppercase tracking-widest font-semibold py-2.5 rounded-md hover:opacity-90 transition cursor-pointer"
                >
                  Enviar
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
