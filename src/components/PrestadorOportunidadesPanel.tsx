import React, { useEffect, useState } from "react";
import { LoaderCircle, BellRing } from "lucide-react";
import { adminFetch } from "../lib/adminFetch";
import OportunidadeCard, { Oportunidade } from "./OportunidadeCard";

// Portal do guia / prestador: passeios oferecidos (com Aceitar/Recusar) e
// serviços já aceitos. Os mesmos que chegam por e-mail.
export default function PrestadorOportunidadesPanel({ semAreaDeAtuacao }: { semAreaDeAtuacao?: boolean }) {
  const [lista, setLista] = useState<Oportunidade[] | null>(null);
  const [erro, setErro] = useState("");
  const [respondendo, setRespondendo] = useState<{ id: string; r: "aceitar" | "recusar" } | null>(null);
  const [msg, setMsg] = useState<{ id: string; texto: string } | null>(null);

  const load = () =>
    adminFetch("/api/prestador/oportunidades")
      .then(async r => {
        const body = await r.json().catch(() => []);
        if (!r.ok) throw new Error(body.error || "Erro ao carregar.");
        setLista(body);
      })
      .catch(err => setErro(err.message));

  useEffect(() => { load(); }, []);

  const responder = async (op: Oportunidade, resposta: "aceitar" | "recusar") => {
    setRespondendo({ id: op.id, r: resposta });
    setMsg(null);
    try {
      const r = await adminFetch(`/api/oportunidades/${encodeURIComponent(op.id)}/responder`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ t: op.token, resposta }),
      });
      const body = await r.json().catch(() => ({}));
      if (!r.ok) setMsg({ id: op.id, texto: body.error || "Não foi possível responder." });
      await load();
    } finally {
      setRespondendo(null);
    }
  };

  const abertas = (lista || []).filter(o => o.status === "aberta" && o.resposta !== "recusou");
  const minhas = (lista || []).filter(o => o.status === "aceita_por_voce");

  return (
    <section className="bg-white border border-editorial-border rounded-2xl p-5">
      <h2 className="text-sm font-bold text-editorial-text flex items-center gap-2"><BellRing className="h-4 w-4 text-editorial-accent" /> Oportunidades de passeios</h2>
      <p className="text-editorial-muted text-xs mt-1 mb-4">Passeios pagos perto de você que precisam do seu serviço. Também chegam por e-mail — o primeiro que aceita fica com o serviço.</p>
      {semAreaDeAtuacao && (
        <p className="mb-4 bg-amber-50 border border-amber-200 text-amber-900 text-xs rounded-xl px-3 py-2">
          Preencha <strong>"Onde você atua"</strong> no seu perfil (cidade-base e distância) para receber os passeios da sua região.
        </p>
      )}
      {lista === null && !erro && <div className="flex justify-center py-6"><LoaderCircle className="h-5 w-5 animate-spin" /></div>}
      {erro && <p className="text-xs text-amber-800">{erro}</p>}
      {lista && abertas.length === 0 && minhas.length === 0 && <p className="text-sm text-editorial-muted">Nenhum passeio no momento. Avisamos por e-mail quando aparecer um perto de você.</p>}
      {abertas.length > 0 && (
        <div className="grid sm:grid-cols-2 gap-4 mb-6">
          {abertas.map(op => (
            <div key={op.id}>
              <OportunidadeCard op={op} onResponder={r => responder(op, r)} respondendo={respondendo?.id === op.id ? respondendo.r : null} />
              {msg?.id === op.id && <p role="alert" className="mt-2 text-xs text-amber-800">{msg.texto}</p>}
            </div>
          ))}
        </div>
      )}
      {minhas.length > 0 && (
        <>
          <h3 className="text-[10px] uppercase tracking-widest font-bold text-editorial-muted mb-2">Meus serviços confirmados</h3>
          <div className="grid sm:grid-cols-2 gap-4">
            {minhas.map(op => <OportunidadeCard key={op.id} op={op} />)}
          </div>
        </>
      )}
    </section>
  );
}
