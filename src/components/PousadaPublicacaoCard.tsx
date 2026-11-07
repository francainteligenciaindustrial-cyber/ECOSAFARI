import React, { useEffect, useState } from "react";
import { CheckCircle2, Circle, LoaderCircle, Send, PauseCircle, PlayCircle, Eye, EyeOff, Hourglass } from "lucide-react";
import { adminFetch } from "../lib/adminFetch";
import { ROTULO_PUBLICACAO, type ItemChecklist, type StatusPublicacao } from "../lib/publicacao";

interface Info { status: StatusPublicacao; nota: string; pausadaPor: string | null; checklist: ItemChecklist[] }

// Topo da agenda no portal: se a pousada aparece no site, o que falta para
// publicar (com atalho para cada aba) e o botão "Enviar para publicação".
export default function PousadaPublicacaoCard({ pousadaId, onIrPara, reloadKey }: { pousadaId: string; onIrPara: (aba: string) => void; reloadKey?: unknown }) {
  const [info, setInfo] = useState<Info | null>(null);
  const [erro, setErro] = useState("");
  const [acao, setAcao] = useState(false);

  const load = () =>
    adminFetch(`/api/pousadas/${encodeURIComponent(pousadaId)}/publicacao`)
      .then(async r => { const b = await r.json().catch(() => ({})); if (!r.ok) throw new Error(b.error || ""); setInfo(b); })
      .catch(e => setErro(e.message));
  useEffect(() => { load(); }, [pousadaId, reloadKey]);

  const fazer = async (rota: "enviar" | "pausar" | "retomar") => {
    if (rota === "pausar" && !window.confirm("Pausar tira a pousada do site e para as novas reservas (as já feitas continuam). Pausar agora?")) return;
    setAcao(true);
    setErro("");
    const r = await adminFetch(`/api/pousadas/${encodeURIComponent(pousadaId)}/publicacao/${rota}`, { method: "POST" });
    const b = await r.json().catch(() => ({}));
    setAcao(false);
    if (!r.ok) return setErro(b.error || "Não foi possível concluir.");
    load();
  };

  if (!info) return erro ? <p className="mb-4 text-xs text-editorial-muted">{erro}</p> : null;
  const pendentes = info.checklist.filter(i => !i.ok);
  const visivel = info.status === "publicada" && !info.checklist.find(i => i.id === "contrato" && !i.ok);
  const cor = info.status === "publicada" ? "border-emerald-200 bg-emerald-50/50" : info.status === "em_revisao" ? "border-sky-200 bg-sky-50/50" : "border-amber-200 bg-amber-50/50";

  return (
    <section className={`mb-6 border rounded-2xl p-5 ${cor}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[10px] uppercase tracking-widest font-bold text-editorial-muted">Sua página no Ipantanal</p>
          <p className="text-lg font-bold text-editorial-text flex items-center gap-2 mt-0.5">
            {visivel ? <Eye className="h-5 w-5 text-emerald-600" /> : info.status === "em_revisao" ? <Hourglass className="h-5 w-5 text-sky-600" /> : <EyeOff className="h-5 w-5 text-amber-600" />}
            {ROTULO_PUBLICACAO[info.status]}{visivel ? " — aparecendo no site" : info.status === "publicada" ? " — falta o contrato para aparecer" : ""}
          </p>
          {info.status === "em_revisao" && <p className="text-xs text-editorial-muted mt-1">Nossa equipe está revisando. Você recebe um e-mail quando for publicada (normalmente em até 2 dias úteis).</p>}
          {info.status === "pausada" && <p className="text-xs text-editorial-muted mt-1">Não aparece no site nem recebe novas reservas.{info.pausadaPor === "gestao" ? " Pausada pela equipe Ipantanal — fale com a gente para voltar." : ""}</p>}
        </div>
        <div className="flex gap-2">
          {info.status === "em_preparacao" && (
            <button type="button" onClick={() => fazer("enviar")} disabled={acao || pendentes.length > 0} title={pendentes.length ? "Complete os itens abaixo" : undefined} className="inline-flex items-center gap-1.5 bg-editorial-primary text-white text-[11px] uppercase tracking-widest font-bold px-4 py-2.5 rounded-full disabled:opacity-40 cursor-pointer">
              {acao ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Enviar para publicação
            </button>
          )}
          {info.status === "publicada" && (
            <button type="button" onClick={() => fazer("pausar")} disabled={acao} className="inline-flex items-center gap-1.5 border border-editorial-border bg-white text-[11px] uppercase tracking-widest font-bold px-4 py-2.5 rounded-full cursor-pointer"><PauseCircle className="h-4 w-4" /> Pausar</button>
          )}
          {info.status === "pausada" && info.pausadaPor === "pousada" && (
            <button type="button" onClick={() => fazer("retomar")} disabled={acao} className="inline-flex items-center gap-1.5 bg-emerald-600 text-white text-[11px] uppercase tracking-widest font-bold px-4 py-2.5 rounded-full cursor-pointer"><PlayCircle className="h-4 w-4" /> Voltar ao ar</button>
          )}
        </div>
      </div>

      {info.nota && info.status === "em_preparacao" && (
        <div className="mt-3 bg-white border border-amber-300 rounded-xl px-4 py-3 text-sm"><strong>Ajustes pedidos pela equipe:</strong> {info.nota}</div>
      )}

      {(info.status === "em_preparacao" || pendentes.length > 0) && (
        <ul className="mt-4 grid sm:grid-cols-2 gap-x-6 gap-y-1.5 text-sm">
          {info.checklist.map(i => (
            <li key={i.id}>
              <button type="button" onClick={() => !i.ok && onIrPara(i.aba)} className={`flex items-start gap-2 text-left ${i.ok ? "text-editorial-muted cursor-default" : "text-editorial-text hover:underline cursor-pointer"}`}>
                {i.ok ? <CheckCircle2 className="h-4 w-4 text-emerald-600 flex-shrink-0 mt-0.5" /> : <Circle className="h-4 w-4 text-amber-600 flex-shrink-0 mt-0.5" />} {i.label}
              </button>
            </li>
          ))}
        </ul>
      )}
      {erro && <p role="alert" className="mt-3 text-xs text-red-700">{erro}</p>}
    </section>
  );
}
