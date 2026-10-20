import React, { useEffect, useState } from "react";
import { Globe, MessageSquare, Check, LoaderCircle, Palette, Smartphone, Search } from "lucide-react";
import { adminFetch } from "../lib/adminFetch";
import type { PedidoSite } from "../types";

const STATUS_LABEL: Record<PedidoSite["status"], string> = {
  novo: "Pedido recebido — nossa equipe vai entrar em contato.",
  em_contato: "Nossa equipe já está em contato com você.",
  em_producao: "Seu site está sendo criado.",
  entregue: "Site entregue.",
  cancelado: "Pedido cancelado. Se quiser, peça de novo.",
};

// Oferta do serviço de criação de site (portal do parceiro → Editar Site).
// O clique registra o pedido em Gestão → Pedidos de site e abre o WhatsApp
// da equipe com a mensagem pronta.
export default function PedidoSiteCard({ pousadaId }: { pousadaId: string }) {
  const [pedido, setPedido] = useState<PedidoSite | null>(null);
  const [whatsappUrl, setWhatsappUrl] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    adminFetch(`/api/pousadas/${encodeURIComponent(pousadaId)}/pedido-site`)
      .then(res => res.json().catch(() => ({})))
      .then(body => {
        setPedido(body.pedido || null);
        setWhatsappUrl(body.whatsappUrl || "");
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [pousadaId]);

  const pedir = async () => {
    setError("");
    // WhatsApp abre já no clique (o navegador bloqueia janela aberta depois
    // de um await); o registro do pedido segue em paralelo.
    if (whatsappUrl) window.open(whatsappUrl, "_blank", "noopener");
    setSending(true);
    try {
      const res = await adminFetch(`/api/pousadas/${encodeURIComponent(pousadaId)}/pedido-site`, { method: "POST" });
      const body = await res.json().catch(() => ({}));
      if (body.pedido) setPedido(body.pedido);
      if (!res.ok) setError(body.error || "Não foi possível registrar o pedido. Fale com a gente pelo WhatsApp.");
      if (!whatsappUrl && body.whatsappUrl) window.location.assign(body.whatsappUrl);
    } catch {
      setError("Sem conexão. Tente de novo ou fale com a gente pelo WhatsApp.");
    } finally {
      setSending(false);
    }
  };

  if (loading) return <div className="flex justify-center py-8"><LoaderCircle className="h-5 w-5 text-editorial-primary animate-spin" /></div>;

  const aberto = pedido && pedido.status !== "cancelado" && pedido.status !== "entregue";

  return (
    <div className="border border-editorial-border rounded-lg overflow-hidden">
      <div className="bg-editorial-primary text-white p-5">
        <p className="text-[10px] uppercase tracking-[0.2em] font-bold text-arara-yellow mb-1">Serviço EcoSafari</p>
        <h3 className="font-serif text-xl font-bold flex items-center gap-2"><Globe className="h-5 w-5" /> Um site profissional para a sua pousada</h3>
        <p className="text-white/80 text-xs mt-2 leading-relaxed">Nossa equipe cria o site oficial da sua pousada, com a sua identidade visual, fotos e reserva online integrada. Depois de pronto, você mesmo ajusta textos e fotos por aqui.</p>
      </div>
      <div className="p-5 space-y-4 bg-white">
        <ul className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs text-editorial-text">
          <li className="flex items-start gap-2"><Palette className="h-4 w-4 text-editorial-primary flex-shrink-0" /> Logo, cores e fotos da sua pousada</li>
          <li className="flex items-start gap-2"><Smartphone className="h-4 w-4 text-editorial-primary flex-shrink-0" /> Feito para celular, com botão de reserva</li>
          <li className="flex items-start gap-2"><Search className="h-4 w-4 text-editorial-primary flex-shrink-0" /> Pode usar o seu próprio domínio (.com.br)</li>
        </ul>

        {aberto ? (
          <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs rounded-md px-3 py-2.5 flex items-start gap-2">
            <Check className="h-4 w-4 flex-shrink-0" />
            <span>{STATUS_LABEL[pedido!.status]} <span className="text-emerald-700/80">Pedido feito em {new Date(pedido!.createdAt).toLocaleDateString("pt-BR")}.</span></span>
          </div>
        ) : (
          pedido?.status === "cancelado" && <p className="text-xs text-editorial-muted">{STATUS_LABEL.cancelado}</p>
        )}

        <div className="flex flex-wrap gap-3">
          {!aberto && (
            <button type="button" onClick={pedir} disabled={sending} className="flex items-center gap-2 bg-editorial-primary hover:opacity-90 text-white text-[11px] uppercase tracking-widest font-bold px-5 py-3 rounded-md disabled:opacity-60 cursor-pointer">
              {sending ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Globe className="h-4 w-4" />} Quero um site para minha pousada
            </button>
          )}
          {whatsappUrl && (
            <a href={whatsappUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 border border-emerald-600 text-emerald-700 hover:bg-emerald-50 text-[11px] uppercase tracking-widest font-bold px-5 py-3 rounded-md">
              <MessageSquare className="h-4 w-4" /> {aberto ? "Falar com a equipe" : "Tirar dúvidas no WhatsApp"}
            </a>
          )}
        </div>
        {error && <p role="alert" className="text-red-600 text-xs">{error}</p>}
      </div>
    </div>
  );
}
