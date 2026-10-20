import React, { useEffect, useState } from "react";
import { Globe, MessageSquare, Check, LoaderCircle, Palette, Smartphone, Search, PenTool, CheckCircle2, XCircle, Clock } from "lucide-react";
import { adminFetch } from "../lib/adminFetch";
import type { PedidoSite, ServicoSite } from "../types";
import { SERVICOS, SERVICO_LABEL, incluiLogo, incluiSite } from "../lib/pedidoSite";

const SERVICO_DESC: Record<ServicoSite, string> = {
  logo_site: "Nosso designer cria a sua logo; com ela aprovada, criamos o site.",
  logo: "Só a identidade visual: a logo da sua pousada.",
  site: "Já tenho logo — quero só o site.",
};

// Etapas mostradas ao cliente, na ordem do processo.
function etapas(p: PedidoSite): { label: string; done: boolean; current: boolean }[] {
  const steps: { label: string; done: boolean }[] = [{ label: "Pedido recebido", done: true }];
  if (incluiLogo(p.servico)) {
    steps.push({ label: "Logo em criação", done: ["aguardando_aprovacao", "ajustes", "aprovada"].includes(p.logoStatus || "") });
    steps.push({ label: "Sua aprovação da logo", done: p.logoStatus === "aprovada" });
  }
  if (incluiSite(p.servico)) {
    steps.push({ label: "Site em produção", done: p.status === "entregue" });
    steps.push({ label: "Site no ar", done: p.status === "entregue" });
  }
  const firstOpen = steps.findIndex(s => !s.done);
  return steps.map((s, i) => ({ ...s, current: i === firstOpen }));
}

// Oferta e acompanhamento dos serviços de logo e site (portal → Editar Site).
// Pedir registra em Gestão → Pedidos de site e abre o WhatsApp da equipe;
// as versões da logo anexadas pelo designer são aprovadas aqui.
export default function PedidoSiteCard({ pousadaId }: { pousadaId: string }) {
  const [pedido, setPedido] = useState<PedidoSite | null>(null);
  const [whatsappUrl, setWhatsappUrl] = useState("");
  const [servico, setServico] = useState<ServicoSite>("logo_site");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [escolhida, setEscolhida] = useState<string | null>(null);
  const [comentario, setComentario] = useState("");

  const load = () =>
    adminFetch(`/api/pousadas/${encodeURIComponent(pousadaId)}/pedido-site`)
      .then(res => res.json().catch(() => ({})))
      .then(body => {
        setPedido(body.pedido || null);
        setWhatsappUrl(body.whatsappUrl || "");
      })
      .catch(() => {})
      .finally(() => setLoading(false));

  useEffect(() => { load(); }, [pousadaId]);

  const pedir = async () => {
    setError("");
    setSending(true);
    try {
      const res = await adminFetch(`/api/pousadas/${encodeURIComponent(pousadaId)}/pedido-site`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ servico }),
      });
      const body = await res.json().catch(() => ({}));
      if (body.pedido) setPedido(body.pedido);
      if (body.whatsappUrl) {
        setWhatsappUrl(body.whatsappUrl);
        // Mesma aba: abrir janela nova depois de um await é bloqueado.
        window.location.assign(body.whatsappUrl);
      }
      if (!res.ok) setError(body.error || "Não foi possível registrar o pedido. Fale com a gente pelo WhatsApp.");
    } catch {
      setError("Sem conexão. Tente de novo ou fale com a gente pelo WhatsApp.");
    } finally {
      setSending(false);
    }
  };

  const decidir = async (acao: "aprovar" | "ajustes") => {
    setError("");
    if (acao === "ajustes" && !comentario.trim()) return setError("Conte no comentário o que você gostaria de mudar.");
    if (acao === "aprovar" && !escolhida) return setError("Escolha uma das versões.");
    setSending(true);
    try {
      const url = acao === "aprovar"
        ? `/api/pousadas/${encodeURIComponent(pousadaId)}/logo/${encodeURIComponent(escolhida!)}/aprovar`
        : `/api/pousadas/${encodeURIComponent(pousadaId)}/logo/ajustes`;
      const res = await adminFetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ comentario }) });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) return setError(body.error || "Não foi possível enviar sua resposta.");
      setPedido(body.pedido || null);
      setEscolhida(null);
      setComentario("");
    } catch {
      setError("Sem conexão. Tente de novo.");
    } finally {
      setSending(false);
    }
  };

  if (loading) return <div className="flex justify-center py-8"><LoaderCircle className="h-5 w-5 text-editorial-primary animate-spin" /></div>;

  const aberto = !!pedido && pedido.status !== "cancelado" && !(pedido.status === "entregue" && pedido.servico !== "logo");
  const versoes = pedido?.versoes || [];
  const pendentes = versoes.filter(v => v.status === "pendente");
  const aprovada = versoes.find(v => v.status === "aprovada");
  const anteriores = versoes.filter(v => v.status === "rejeitada");

  return (
    <div className="border border-editorial-border rounded-lg overflow-hidden">
      <div className="bg-editorial-primary text-white p-5">
        <p className="text-[10px] uppercase tracking-[0.2em] font-bold text-arara-yellow mb-1">Serviços EcoSafari</p>
        <h3 className="font-serif text-xl font-bold flex items-center gap-2"><Globe className="h-5 w-5" /> Logo e site profissionais para a sua pousada</h3>
        <p className="text-white/80 text-xs mt-2 leading-relaxed">Nosso designer cria a sua logo e, com ela aprovada por você, criamos o site oficial com a sua identidade visual, fotos e reserva online integrada. Depois de pronto, você mesmo ajusta textos e fotos por aqui.</p>
      </div>
      <div className="p-5 space-y-4 bg-white">
        {!aberto && !(pedido?.servico === "logo" && pedido.status === "entregue") ? (
          <>
            <ul className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs text-editorial-text">
              <li className="flex items-start gap-2"><Palette className="h-4 w-4 text-editorial-primary flex-shrink-0" /> Logo exclusiva, criada por designer</li>
              <li className="flex items-start gap-2"><Smartphone className="h-4 w-4 text-editorial-primary flex-shrink-0" /> Site para celular, com botão de reserva</li>
              <li className="flex items-start gap-2"><Search className="h-4 w-4 text-editorial-primary flex-shrink-0" /> Pode usar o seu próprio domínio (.com.br)</li>
            </ul>
            <fieldset>
              <legend className="text-[10px] uppercase tracking-widest font-bold text-editorial-muted mb-2">O que você quer contratar?</legend>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2" role="radiogroup">
                {SERVICOS.map(s => (
                  <button key={s} type="button" role="radio" aria-checked={servico === s} onClick={() => setServico(s)}
                    className={`text-left border rounded-md p-3 text-xs transition cursor-pointer ${servico === s ? "border-editorial-primary bg-editorial-secondary ring-1 ring-editorial-primary" : "border-editorial-border hover:bg-editorial-secondary/50"}`}>
                    <span className="font-bold text-sm block">{SERVICO_LABEL[s]}{s === "logo_site" && <span className="ml-1.5 text-[9px] uppercase tracking-widest text-emerald-700">recomendado</span>}</span>
                    <span className="text-editorial-muted">{SERVICO_DESC[s]}</span>
                  </button>
                ))}
              </div>
            </fieldset>
            {pedido?.status === "cancelado" && <p className="text-xs text-editorial-muted">Seu pedido anterior foi cancelado. Se quiser, peça de novo.</p>}
            <button type="button" onClick={pedir} disabled={sending} className="flex items-center gap-2 bg-editorial-primary hover:opacity-90 text-white text-[11px] uppercase tracking-widest font-bold px-5 py-3 rounded-md disabled:opacity-60 cursor-pointer">
              {sending ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Globe className="h-4 w-4" />} Quero contratar: {SERVICO_LABEL[servico]}
            </button>
          </>
        ) : (
          <>
            <p className="text-xs text-editorial-text"><strong>{SERVICO_LABEL[pedido!.servico || "site"]}</strong> · pedido feito em {new Date(pedido!.createdAt).toLocaleDateString("pt-BR")}</p>
            <ol className="flex flex-wrap gap-2 text-[10px] uppercase tracking-widest font-bold" aria-label="Etapas do pedido">
              {etapas(pedido!).map(s => (
                <li key={s.label} aria-current={s.current ? "step" : undefined} className={`px-3 py-1.5 rounded-full border ${s.current ? "bg-editorial-primary text-white border-editorial-primary" : s.done ? "border-emerald-600 text-emerald-700" : "border-editorial-border text-editorial-muted"}`}>
                  {s.done ? "✓ " : ""}{s.label}
                </li>
              ))}
            </ol>

            {pendentes.length > 0 && (
              <section className="border border-editorial-border rounded-md p-4 space-y-3">
                <h4 className="font-serif font-bold text-editorial-primary flex items-center gap-2"><PenTool className="h-4 w-4" /> Escolha a sua logo</h4>
                <p className="text-xs text-editorial-muted">Toque na versão de que mais gostou. Ao aprovar, as outras são descartadas. Se nenhuma agradar, peça ajustes contando o que mudar.</p>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3" role="radiogroup" aria-label="Versões da logo">
                  {pendentes.map((v, i) => (
                    <button key={v.id} type="button" role="radio" aria-checked={escolhida === v.id} onClick={() => setEscolhida(v.id)}
                      className={`border rounded-md p-2 text-left transition cursor-pointer ${escolhida === v.id ? "border-editorial-primary ring-2 ring-editorial-primary" : "border-editorial-border hover:border-editorial-muted"}`}>
                      <img src={v.imageUrl} alt={`Versão ${i + 1}`} className="w-full aspect-square object-contain bg-zinc-50 rounded" />
                      <span className="block text-[11px] font-bold mt-1.5">Versão {i + 1}</span>
                      {v.descricao && <span className="block text-[11px] text-editorial-muted">{v.descricao}</span>}
                    </button>
                  ))}
                </div>
                <label htmlFor="logo-comentario" className="block text-[10px] uppercase tracking-widest font-bold text-editorial-muted">Comentário (opcional ao aprovar)</label>
                <textarea id="logo-comentario" rows={2} maxLength={1000} value={comentario} onChange={e => setComentario(e.target.value)} placeholder="Ex.: adorei, só deixar o verde um pouco mais escuro" className="w-full border border-editorial-border rounded-md p-2 text-sm resize-none" />
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={() => decidir("aprovar")} disabled={sending || !escolhida} className="flex items-center gap-1.5 bg-editorial-primary text-white text-[11px] uppercase tracking-widest font-bold px-4 py-2.5 rounded-md disabled:opacity-50 cursor-pointer">
                    <CheckCircle2 className="h-4 w-4" /> Aprovar esta versão
                  </button>
                  <button type="button" onClick={() => decidir("ajustes")} disabled={sending} className="flex items-center gap-1.5 border border-editorial-border text-editorial-text text-[11px] uppercase tracking-widest font-bold px-4 py-2.5 rounded-md disabled:opacity-50 cursor-pointer">
                    <XCircle className="h-4 w-4" /> Pedir ajustes
                  </button>
                </div>
              </section>
            )}

            {incluiLogo(pedido!.servico) && pendentes.length === 0 && !aprovada && (
              <p className="text-xs text-editorial-muted flex items-center gap-1.5"><Clock className="h-3.5 w-3.5" />
                {pedido!.logoStatus === "ajustes" ? "Recebemos seus comentários — o designer está preparando novas versões." : "Nosso designer está criando a sua logo. Você recebe um e-mail quando as versões estiverem prontas."}
              </p>
            )}

            {aprovada && (
              <div className="flex items-center gap-3 bg-emerald-50 border border-emerald-200 rounded-md p-3 text-xs text-emerald-800">
                <img src={aprovada.imageUrl} alt="Logo aprovada" className="w-14 h-14 object-contain bg-white rounded border border-emerald-200" />
                <span><strong>Logo aprovada</strong>{aprovada.clienteComentario ? ` — "${aprovada.clienteComentario}"` : ""}. {incluiSite(pedido!.servico) ? "Agora criamos o seu site com ela." : "Ela já está no cadastro da sua pousada."}</span>
              </div>
            )}

            {anteriores.length > 0 && (
              <details className="text-xs">
                <summary className="cursor-pointer text-editorial-muted">Versões anteriores ({anteriores.length})</summary>
                <div className="grid grid-cols-4 md:grid-cols-6 gap-2 mt-2">
                  {anteriores.map(v => <img key={v.id} src={v.imageUrl} alt="Versão descartada" title={v.clienteComentario || ""} className="w-full aspect-square object-contain border border-editorial-border rounded opacity-60" />)}
                </div>
              </details>
            )}
          </>
        )}

        {whatsappUrl && (
          <a href={whatsappUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 border border-emerald-600 text-emerald-700 hover:bg-emerald-50 text-[11px] uppercase tracking-widest font-bold px-5 py-3 rounded-md">
            <MessageSquare className="h-4 w-4" /> {aberto ? "Falar com a equipe" : "Tirar dúvidas no WhatsApp"}
          </a>
        )}
        {error && <p role="alert" className="text-red-600 text-xs">{error}</p>}
      </div>
    </div>
  );
}
