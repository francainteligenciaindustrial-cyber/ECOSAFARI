import React, { useEffect, useState } from "react";
import { LoaderCircle, MessageSquare, BadgeCheck } from "lucide-react";
import MessageThread, { Msg } from "./MessageThread";
import { adminFetch } from "../lib/adminFetch";

interface ConversaResumo {
  id: string;
  lastMessageAt: string;
  lastMessagePreview?: string;
  guiaUnread: number;
  turista: { id: string; name: string; photoUrl?: string; country?: string } | null;
}

// Portal do guia → Mensagens dos turistas.
export default function GuideMessagesPanel({ guideId }: { guideId: string }) {
  const [lista, setLista] = useState<ConversaResumo[] | null>(null);
  const [error, setError] = useState("");
  const [ativa, setAtiva] = useState<string | null>(() => new URLSearchParams(window.location.search).get("mensagens"));
  const [detalhe, setDetalhe] = useState<{ turista: any; mensagens: Msg[]; reservaPaga: boolean } | null>(null);

  const loadLista = () =>
    adminFetch(`/api/guides/${guideId}/conversas`)
      .then(async r => {
        const body = await r.json().catch(() => []);
        if (!r.ok) throw new Error(body.error || "Não foi possível carregar as mensagens.");
        setLista(body);
      })
      .catch(err => setError(err.message));
  const loadDetalhe = (id: string) =>
    adminFetch(`/api/guides/${guideId}/conversas/${id}`).then(r => (r.ok ? r.json() : null)).then(d => d && setDetalhe(d));

  useEffect(() => { loadLista(); }, [guideId]);
  useEffect(() => {
    if (!ativa) return;
    setDetalhe(null);
    loadDetalhe(ativa);
    const t = setInterval(() => loadDetalhe(ativa), 20000);
    return () => clearInterval(t);
  }, [ativa]);

  const enviar = async (texto: string) => {
    if (!ativa) return false;
    const r = await adminFetch(`/api/guides/${guideId}/conversas/${ativa}/mensagens`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ texto }) });
    if (!r.ok) return false;
    await loadDetalhe(ativa);
    loadLista();
    return true;
  };

  const naoLidas = (lista || []).reduce((a, c) => a + (c.guiaUnread || 0), 0);

  return (
    <div className="bg-white border border-editorial-border rounded-3xl p-5 space-y-4">
      <h3 className="text-sm font-bold text-editorial-text flex items-center gap-2">
        <MessageSquare className="h-4 w-4 text-editorial-accent" /> Mensagens dos turistas
        {naoLidas > 0 && <span className="min-w-5 h-5 px-1.5 rounded-full bg-editorial-accent text-white text-[10px] font-bold flex items-center justify-center">{naoLidas}</span>}
      </h3>
      <p className="text-xs text-editorial-muted">Responda rápido: o tempo de resposta pesa na decisão de reserva. Seu telefone só é mostrado ao turista depois de uma reserva paga.</p>
      {error && <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">{error}</p>}
      {lista === null && !error && <div className="flex justify-center py-4"><LoaderCircle className="h-4 w-4 animate-spin" /></div>}
      {lista && lista.length === 0 && <p className="text-sm text-editorial-muted">Nenhuma mensagem ainda.</p>}
      {lista && lista.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-[240px_minmax(0,1fr)] gap-4">
          <ul className="space-y-1">
            {lista.map(c => (
              <li key={c.id}>
                <button type="button" onClick={() => setAtiva(c.id)} className={`w-full text-left p-3 rounded-2xl cursor-pointer ${ativa === c.id ? "bg-editorial-secondary" : "hover:bg-editorial-secondary/60"}`}>
                  <span className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-sm truncate">{c.turista?.name || "Turista"}</span>
                    {c.guiaUnread > 0 && <span className="min-w-5 h-5 px-1.5 rounded-full bg-editorial-accent text-white text-[10px] font-bold flex items-center justify-center">{c.guiaUnread}</span>}
                  </span>
                  <span className="block text-xs text-editorial-muted truncate">{c.lastMessagePreview}</span>
                </button>
              </li>
            ))}
          </ul>
          <div className="min-h-[420px]">
            {!ativa ? (
              <p className="text-sm text-editorial-muted">Escolha uma conversa.</p>
            ) : !detalhe ? (
              <div className="flex justify-center py-10"><LoaderCircle className="h-5 w-5 animate-spin" /></div>
            ) : (
              <>
                <p className="text-sm font-semibold mb-2 flex items-center gap-2">
                  {detalhe.turista?.name}{detalhe.turista?.country ? ` · ${detalhe.turista.country}` : ""}
                  {detalhe.reservaPaga && <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-full px-2 py-0.5"><BadgeCheck className="h-3 w-3" /> Reserva paga</span>}
                </p>
                <MessageThread mensagens={detalhe.mensagens} me="guia" locked={!detalhe.reservaPaga} onSend={enviar} placeholder="Responda ao turista…" />
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
