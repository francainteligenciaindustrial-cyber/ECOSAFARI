import React, { useEffect, useMemo, useState } from "react";
import { LoaderCircle } from "lucide-react";
import InfoPageLayout from "./InfoPageLayout";
import OportunidadeCard, { Oportunidade } from "./OportunidadeCard";

// /oportunidade/:id?t=TOKEN&acao=aceitar|recusar — aberta pelo botão do
// e-mail. Não aceita nada sozinha ao abrir (leitores de e-mail costumam
// "visitar" os links): o prestador confirma clicando aqui.
export default function OportunidadePage({ id }: { id: string }) {
  const params = useMemo(() => new URLSearchParams(window.location.search), []);
  const token = params.get("t") || "";
  const acao = params.get("acao") === "recusar" ? "recusar" : params.get("acao") === "aceitar" ? "aceitar" : null;
  const [op, setOp] = useState<Oportunidade | null>(null);
  const [erro, setErro] = useState("");
  const [respondendo, setRespondendo] = useState<"aceitar" | "recusar" | null>(null);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    fetch(`/api/oportunidades/${encodeURIComponent(id)}?t=${encodeURIComponent(token)}`)
      .then(async r => {
        const body = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(body.error || "Não foi possível abrir este passeio.");
        setOp(body);
      })
      .catch(err => setErro(err.message));
  }, [id, token]);

  const responder = async (resposta: "aceitar" | "recusar") => {
    setRespondendo(resposta);
    setMsg("");
    try {
      const r = await fetch(`/api/oportunidades/${encodeURIComponent(id)}/responder`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ t: token, resposta }),
      });
      const body = await r.json().catch(() => ({}));
      if (!r.ok) {
        setMsg(body.error || "Não foi possível responder.");
        if (body.status) setOp(o => (o ? { ...o, status: body.status } : o));
        return;
      }
      if (body.oportunidade) setOp(body.oportunidade);
      setMsg(resposta === "aceitar" ? "Pronto! O serviço é seu. Enviamos os detalhes e o evento de calendário para o seu e-mail." : "Tudo bem, avisaremos você dos próximos passeios.");
    } catch {
      setMsg("Sem conexão. Tente de novo.");
    } finally {
      setRespondendo(null);
    }
  };

  return (
    <InfoPageLayout kicker="Oportunidade" title={op?.prestador?.nome ? `Olá, ${op.prestador.nome}!` : "Passeio perto de você"}>
      <div className="max-w-md">
        {!op && !erro && <div className="flex justify-center py-10"><LoaderCircle className="h-6 w-6 animate-spin" /></div>}
        {erro && <p className="bg-amber-50 border border-amber-200 text-amber-900 text-sm rounded-xl px-4 py-3">{erro}</p>}
        {op && (
          <>
            {op.status === "aberta" && !op.resposta && <p className="text-sm text-editorial-muted mb-4">Acabou de aparecer um passeio turístico perto de você. Confira e responda:</p>}
            <OportunidadeCard op={op} onResponder={responder} respondendo={respondendo} destaque={acao} />
            {msg && <p role="status" className="mt-4 text-sm bg-editorial-secondary border border-editorial-border rounded-xl px-4 py-3">{msg}</p>}
            <p className="mt-6 text-xs text-editorial-muted">Todas as suas oportunidades também ficam no <a href="/parceiro" className="underline font-semibold">portal do parceiro</a>.</p>
          </>
        )}
      </div>
    </InfoPageLayout>
  );
}
