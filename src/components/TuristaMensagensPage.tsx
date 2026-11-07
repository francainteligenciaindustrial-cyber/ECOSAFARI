import React, { useEffect, useState } from "react";
import { LoaderCircle, MessageSquare, ArrowLeft, Phone } from "lucide-react";
import InfoPageLayout from "./InfoPageLayout";
import MessageThread, { Msg } from "./MessageThread";
import { useTouristSession } from "../lib/useTouristSession";
import { adminFetch } from "../lib/adminFetch";
import { navigate } from "../lib/router";
import { RETURN_TO_KEY } from "../lib/returnTo";

interface ConversaResumo {
  id: string;
  guideId: string;
  lastMessageAt: string;
  lastMessagePreview?: string;
  turistaUnread: number;
  guia: { id: string; name: string; photoUrl?: string } | null;
}

// /turista/mensagens — conversas do turista com os guias.
export default function TuristaMensagensPage() {
  const { isTourist, checking } = useTouristSession();
  const [lista, setLista] = useState<ConversaResumo[] | null>(null);
  const [error, setError] = useState("");
  const [ativa, setAtiva] = useState<string | null>(() => new URLSearchParams(window.location.search).get("c"));
  const [detalhe, setDetalhe] = useState<{ guia: any; mensagens: Msg[]; contatoLiberado: boolean; contato: { phone: string; whatsapp: string | null } | null } | null>(null);

  const loadLista = () =>
    adminFetch("/api/turista/conversas")
      .then(async r => {
        const body = await r.json().catch(() => []);
        if (!r.ok) throw new Error(body.error || "Não foi possível carregar as mensagens.");
        setLista(body);
      })
      .catch(err => setError(err.message));

  const loadDetalhe = (id: string) =>
    adminFetch(`/api/turista/conversas/${id}`)
      .then(r => (r.ok ? r.json() : null))
      .then(d => d && setDetalhe(d));

  useEffect(() => {
    if (checking) return;
    if (!isTourist) {
      try { localStorage.setItem(RETURN_TO_KEY, `/turista/mensagens${window.location.search}`); } catch { /* sem storage */ }
      return;
    }
    loadLista();
  }, [checking, isTourist]);

  useEffect(() => {
    if (!ativa || !isTourist) return;
    setDetalhe(null);
    loadDetalhe(ativa);
    // Atualiza a conversa aberta a cada 20 s (resposta do guia aparece sozinha).
    const t = setInterval(() => loadDetalhe(ativa), 20000);
    return () => clearInterval(t);
  }, [ativa, isTourist]);

  const enviar = async (texto: string) => {
    if (!ativa) return false;
    const r = await adminFetch(`/api/turista/conversas/${ativa}/mensagens`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ texto }) });
    if (!r.ok) return false;
    await loadDetalhe(ativa);
    loadLista();
    return true;
  };

  const abrir = (id: string) => {
    setAtiva(id);
    window.history.replaceState({}, "", `/turista/mensagens?c=${encodeURIComponent(id)}`);
  };

  return (
    <InfoPageLayout kicker="Minha conta" title="Mensagens">
      {checking ? (
        <div className="flex justify-center py-16"><LoaderCircle className="h-6 w-6 animate-spin text-editorial-primary" /></div>
      ) : !isTourist ? (
        <div className="max-w-md mx-auto text-center bg-white border border-editorial-border rounded-3xl p-10">
          <MessageSquare className="h-10 w-10 text-editorial-accent mx-auto mb-3" />
          <p className="text-sm text-editorial-muted mb-5">Entre na sua conta de turista para ver suas conversas com os guias.</p>
          <button type="button" onClick={() => navigate("/turista")} className="bg-editorial-primary text-white text-xs uppercase tracking-widest font-bold px-6 py-3 rounded-full cursor-pointer">Entrar ou criar conta</button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-[280px_minmax(0,1fr)] gap-4">
          <aside className={`bg-white border border-editorial-border rounded-3xl p-3 ${ativa ? "hidden md:block" : ""}`}>
            {error && <p className="text-xs text-amber-800 p-2">{error}</p>}
            {lista === null && !error && <div className="flex justify-center py-6"><LoaderCircle className="h-5 w-5 animate-spin" /></div>}
            {lista && lista.length === 0 && <p className="text-sm text-editorial-muted p-3">Nenhuma conversa ainda. Na página de um guia, toque em "Perguntar ao guia".</p>}
            <ul>
              {(lista || []).map(c => (
                <li key={c.id}>
                  <button type="button" onClick={() => abrir(c.id)} className={`w-full flex items-center gap-3 p-3 rounded-2xl text-left cursor-pointer ${ativa === c.id ? "bg-editorial-secondary" : "hover:bg-editorial-secondary/60"}`}>
                    <span className="w-10 h-10 rounded-full bg-editorial-secondary overflow-hidden flex-shrink-0">
                      {c.guia?.photoUrl && <img src={c.guia.photoUrl} alt="" className="w-full h-full object-cover" />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-sm truncate">{c.guia?.name || "Guia"}</span>
                        {c.turistaUnread > 0 && <span className="min-w-5 h-5 px-1.5 rounded-full bg-editorial-accent text-white text-[10px] font-bold flex items-center justify-center">{c.turistaUnread}</span>}
                      </span>
                      <span className="block text-xs text-editorial-muted truncate">{c.lastMessagePreview}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </aside>

          <section className={`bg-white border border-editorial-border rounded-3xl p-4 md:p-5 ${ativa ? "" : "hidden md:flex items-center justify-center"}`}>
            {!ativa ? (
              <p className="text-sm text-editorial-muted">Escolha uma conversa.</p>
            ) : !detalhe ? (
              <div className="flex justify-center py-10"><LoaderCircle className="h-5 w-5 animate-spin" /></div>
            ) : (
              <div className="flex flex-col h-full">
                <div className="flex items-center justify-between gap-3 pb-3 mb-3 border-b border-editorial-border">
                  <button type="button" onClick={() => setAtiva(null)} className="md:hidden w-9 h-9 rounded-full hover:bg-editorial-secondary flex items-center justify-center cursor-pointer" aria-label="Voltar às conversas"><ArrowLeft className="h-4 w-4" /></button>
                  <a href={`/guias/${detalhe.guia?.id}`} onClick={e => { e.preventDefault(); navigate(`/guias/${detalhe.guia?.id}`); }} className="font-serif text-lg font-semibold hover:underline flex-1 truncate">{detalhe.guia?.name}</a>
                  {detalhe.contatoLiberado && detalhe.contato?.whatsapp && (
                    <a href={detalhe.contato.whatsapp} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 bg-emerald-600 text-white text-xs font-semibold px-3 py-2 rounded-full">
                      <Phone className="h-3.5 w-3.5" /> WhatsApp do guia
                    </a>
                  )}
                </div>
                <MessageThread mensagens={detalhe.mensagens} me="turista" locked={!detalhe.contatoLiberado} onSend={enviar} placeholder="Pergunte sobre o passeio, idiomas, o que levar…" />
              </div>
            )}
          </section>
        </div>
      )}
    </InfoPageLayout>
  );
}
