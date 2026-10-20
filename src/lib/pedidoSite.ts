// Regras do pedido de logo/site — usadas pelo servidor (server/routes/sites.ts)
// e pelas telas. Puras, para poder testar.
import type { LogoVersao, PedidoSite, ServicoSite } from "../types";

export const SERVICOS: ServicoSite[] = ["logo_site", "logo", "site"];
export const SERVICO_LABEL: Record<ServicoSite, string> = {
  logo_site: "Logo + Site",
  logo: "Só a logo",
  site: "Só o site",
};

export const incluiLogo = (s?: ServicoSite) => s === "logo" || s === "logo_site";
export const incluiSite = (s?: ServicoSite) => s !== "logo";

// Com logo no pedido, o site não começa (nem é entregue) antes da aprovação;
// pedido só de logo termina ("entregue") quando a logo é aprovada.
export function podeMudarStatus(pedido: Pick<PedidoSite, "servico" | "logoStatus">, novo: PedidoSite["status"]): string | null {
  const travado = incluiLogo(pedido.servico) && pedido.logoStatus !== "aprovada";
  if (travado && (novo === "em_producao" || novo === "entregue")) {
    return "A logo ainda não foi aprovada pelo cliente — o site só entra em produção depois disso.";
  }
  if (pedido.servico === "logo" && novo === "em_producao") {
    return "Este pedido é só de logo — não há site para produzir.";
  }
  return null;
}

// Cliente aprova uma versão: ela vira "aprovada" (com o comentário) e todas
// as outras ainda pendentes viram "rejeitada".
export function aprovarVersao(versoes: LogoVersao[], versaoId: string, comentario: string, agora: string): LogoVersao[] {
  if (!versoes.some(v => v.id === versaoId && v.status === "pendente")) throw new Error("Versão não está disponível para aprovação.");
  return versoes.map(v => {
    if (v.id === versaoId) return { ...v, status: "aprovada", clienteComentario: comentario || undefined, decidedAt: agora };
    if (v.status === "pendente") return { ...v, status: "rejeitada", decidedAt: agora };
    return v;
  });
}

// Cliente pede ajustes sem aprovar nenhuma: as pendentes viram "rejeitada"
// levando o comentário, e o designer anexa novas versões.
export function pedirAjustes(versoes: LogoVersao[], comentario: string, agora: string): LogoVersao[] {
  if (!versoes.some(v => v.status === "pendente")) throw new Error("Não há versões aguardando sua avaliação.");
  return versoes.map(v => (v.status === "pendente" ? { ...v, status: "rejeitada", clienteComentario: comentario || undefined, decidedAt: agora } : v));
}
