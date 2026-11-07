import React, { useState } from "react";
import { MessageSquare, LoaderCircle, X, ShieldCheck } from "lucide-react";
import { useTouristSession } from "../lib/useTouristSession";
import { adminFetch } from "../lib/adminFetch";
import { navigate } from "../lib/router";
import { RETURN_TO_KEY } from "../lib/returnTo";

// "Perguntar ao guia": a primeira mensagem já abre a conversa dentro do
// Ipantanal. O telefone do guia só é liberado depois de uma reserva paga.
export default function AskGuideButton({ guideId, guideName, variant = "solid", className = "" }: { guideId: string; guideName: string; variant?: "solid" | "light"; className?: string }) {
  const { isTourist, checking } = useTouristSession();
  const [open, setOpen] = useState(false);
  const [texto, setTexto] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const first = guideName.split(" ")[0];

  const click = () => {
    if (!isTourist) {
      try { localStorage.setItem(RETURN_TO_KEY, window.location.pathname); } catch { /* sem storage */ }
      navigate("/turista");
      return;
    }
    setOpen(true);
  };

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!texto.trim()) return;
    setSending(true);
    setError("");
    try {
      const r = await adminFetch("/api/turista/conversas", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ guideId, texto }) });
      const body = await r.json().catch(() => ({}));
      if (!r.ok) return setError(body.error || "Não foi possível enviar.");
      navigate(`/turista/mensagens?c=${encodeURIComponent(body.conversaId)}`);
    } finally {
      setSending(false);
    }
  };

  const cls = variant === "light"
    ? "bg-white text-editorial-primary hover:bg-white/90"
    : "bg-editorial-primary text-white hover:opacity-90";

  return (
    <>
      <button type="button" onClick={click} disabled={checking} className={`inline-flex items-center justify-center gap-2 font-bold px-6 py-3 rounded-full text-xs uppercase tracking-widest transition cursor-pointer disabled:opacity-60 ${cls} ${className}`}>
        <MessageSquare className="h-4 w-4" /> Perguntar ao guia
      </button>
      {open && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center p-0 sm:p-6" onClick={() => setOpen(false)}>
          <form role="dialog" aria-modal="true" aria-labelledby="perguntar-titulo" onClick={e => e.stopPropagation()} onSubmit={send} className="bg-white w-full sm:max-w-lg rounded-t-3xl sm:rounded-3xl p-6 space-y-4 text-left text-editorial-text">
            <div className="flex items-center justify-between">
              <h2 id="perguntar-titulo" className="font-serif text-xl font-semibold">Perguntar a {first}</h2>
              <button type="button" onClick={() => setOpen(false)} aria-label="Fechar" className="w-9 h-9 rounded-full hover:bg-editorial-secondary flex items-center justify-center cursor-pointer"><X className="h-4 w-4" /></button>
            </div>
            <label htmlFor="pergunta-guia" className="sr-only">Sua pergunta</label>
            <textarea id="pergunta-guia" rows={5} maxLength={2000} value={texto} onChange={e => setTexto(e.target.value)} autoFocus placeholder={`Ex.: Olá, ${first}! Somos 2 adultos, queremos ver onça em julho. Você tem disponibilidade? Fala inglês?`} className="w-full border border-editorial-border rounded-2xl px-3 py-2 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-editorial-primary" />
            <p className="flex items-start gap-2 text-[11px] text-editorial-muted">
              <ShieldCheck className="h-4 w-4 flex-shrink-0 text-editorial-accent" />
              A conversa fica no Ipantanal. Telefones e links ficam ocultos até a reserva ser paga — depois o contato direto do guia é liberado.
            </p>
            {error && <p role="alert" className="text-xs text-red-700">{error}</p>}
            <button type="submit" disabled={sending || !texto.trim()} className="w-full inline-flex items-center justify-center gap-2 bg-editorial-primary text-white text-xs uppercase tracking-widest font-bold py-3 rounded-full disabled:opacity-50 cursor-pointer">
              {sending ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <MessageSquare className="h-4 w-4" />} Enviar pergunta
            </button>
          </form>
        </div>
      )}
    </>
  );
}
