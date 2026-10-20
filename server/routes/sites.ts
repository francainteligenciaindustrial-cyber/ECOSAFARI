// Venda de site oficial: o gestor pede pelo portal, a equipe acompanha em
// Gestão → Pedidos de site e marca "entregue" quando o site está no ar.
import type { Express } from "express";
import { randomUUID } from "crypto";
import type { PedidoSite } from "../../src/types.js";
import {
  AGENCY_WHATSAPP,
  addNotification,
  log,
  logAdminAction,
  requireAdmin,
  requirePartnerAccess,
  supabase,
} from "../core.js";

const STATUS: PedidoSite["status"][] = ["novo", "em_contato", "em_producao", "entregue", "cancelado"];
const OPEN: PedidoSite["status"][] = ["novo", "em_contato", "em_producao"];

const whatsappUrl = (pousadaName: string, contato?: string) => {
  const number = AGENCY_WHATSAPP.replace(/\D/g, "");
  const text = `Olá! ${contato ? `Sou ${contato}, gestor(a) da` : "Sou gestor(a) da"} ${pousadaName} e quero um site profissional para a minha pousada.`;
  return `https://wa.me/${number}?text=${encodeURIComponent(text)}`;
};

export function registerSitesRoutes(app: Express) {

// Pedido mais recente desta pousada (ou null) e o link do WhatsApp.
app.get("/api/pousadas/:id/pedido-site", requirePartnerAccess("pousada"), async (req, res) => {
  const { data: pousada } = await supabase.from("pousadas").select("name").eq("id", req.params.id).maybeSingle();
  if (!pousada) return res.status(404).json({ error: "Pousada não encontrada" });
  const { data, error } = await supabase.from("pedidos_site").select("*").eq("pousadaId", req.params.id).order("createdAt", { ascending: false }).limit(1);
  if (error) return res.status(503).json({ error: "Pedidos de site ainda não disponíveis — rode scripts/add-pedidos-site.sql." });
  const user = res.locals.actorUser;
  res.json({ pedido: data?.[0] || null, whatsappUrl: whatsappUrl(pousada.name, user?.user_metadata?.name) });
});

// Idempotente: com um pedido em aberto, devolve o mesmo em vez de duplicar.
app.post("/api/pousadas/:id/pedido-site", requirePartnerAccess("pousada"), async (req, res) => {
  const { data: pousada } = await supabase.from("pousadas").select("name").eq("id", req.params.id).maybeSingle();
  if (!pousada) return res.status(404).json({ error: "Pousada não encontrada" });
  const user = res.locals.actorUser;
  const link = whatsappUrl(pousada.name, user?.user_metadata?.name);

  const { data: open } = await supabase.from("pedidos_site").select("*").eq("pousadaId", req.params.id).in("status", OPEN).limit(1);
  if (open && open[0]) return res.json({ pedido: open[0], whatsappUrl: link });

  const now = new Date().toISOString();
  const pedido: PedidoSite = {
    id: `ps_${randomUUID()}`,
    pousadaId: req.params.id,
    userId: user?.id,
    contatoNome: String(user?.user_metadata?.name || "").slice(0, 120) || undefined,
    contatoEmail: user?.email || undefined,
    contatoTelefone: String(user?.user_metadata?.phone || "").slice(0, 40) || undefined,
    status: "novo",
    createdAt: now,
    updatedAt: now,
  };
  const { error } = await supabase.from("pedidos_site").insert(pedido);
  if (error) {
    log.error("[POST /api/pousadas/:id/pedido-site]", error.message);
    return res.status(500).json({ error: "Não foi possível registrar o pedido agora. Fale com a gente pelo WhatsApp.", whatsappUrl: link });
  }
  addNotification("admin", `Novo pedido de site: ${pousada.name}${pedido.contatoNome ? ` (${pedido.contatoNome})` : ""}.`, "status_update");
  res.status(201).json({ pedido, whatsappUrl: link });
});

app.get("/api/admin/pedidos-site", requireAdmin, async (req, res) => {
  const { data, error } = await supabase.from("pedidos_site").select("*").order("createdAt", { ascending: false });
  if (error) return res.status(503).json({ error: "Tabela de pedidos não encontrada — rode scripts/add-pedidos-site.sql." });
  const ids = [...new Set((data || []).map(p => p.pousadaId))];
  const { data: pousadas } = ids.length ? await supabase.from("pousadas").select("id, name, sitePublicado, customDomain").in("id", ids) : { data: [] as any[] };
  res.json((data || []).map(p => {
    const pousada = (pousadas || []).find(x => x.id === p.pousadaId);
    return { ...p, pousadaName: pousada?.name || "—", sitePublicado: !!pousada?.sitePublicado, customDomain: pousada?.customDomain || null };
  }));
});

// "entregue" publica o site da pousada (libera o editor no portal dela).
app.put("/api/admin/pedidos-site/:id", requireAdmin, async (req, res) => {
  const status = req.body.status as PedidoSite["status"];
  if (status && !STATUS.includes(status)) return res.status(400).json({ error: "Status inválido." });
  const updates: Partial<PedidoSite> = { updatedAt: new Date().toISOString() };
  if (status) updates.status = status;
  if (typeof req.body.notes === "string") updates.notes = req.body.notes.slice(0, 2000);
  const { data, error } = await supabase.from("pedidos_site").update(updates).eq("id", req.params.id).select().maybeSingle();
  if (error) return res.status(500).json({ error: "Erro ao atualizar o pedido." });
  if (!data) return res.status(404).json({ error: "Pedido não encontrado." });
  if (status === "entregue") {
    await supabase.from("pousadas").update({ sitePublicado: true }).eq("id", data.pousadaId);
  }
  await logAdminAction(res.locals.adminUser, "update_status", "pedido_site", req.params.id, `${data.pousadaId} → ${data.status}`);
  res.json(data);
});
}
