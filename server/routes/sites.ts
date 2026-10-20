// Venda de logo e site oficial: o gestor pede pelo portal; o designer anexa
// versões da logo na Gestão; o cliente aprova uma no portal (as outras são
// rejeitadas) e só então o site entra em produção.
import type { Express } from "express";
import { randomUUID } from "crypto";
import type { LogoVersao, PedidoSite, ServicoSite } from "../../src/types.js";
import { SERVICOS, SERVICO_LABEL, aprovarVersao, incluiLogo, pedirAjustes, podeMudarStatus } from "../../src/lib/pedidoSite.js";
import {
  AGENCY_WHATSAPP,
  SITE_URL,
  addNotification,
  escapeHtml,
  log,
  logAdminAction,
  requireAdmin,
  requirePartnerAccess,
  sendEmail,
  supabase,
} from "../core.js";

const STATUS: PedidoSite["status"][] = ["novo", "em_contato", "em_producao", "entregue", "cancelado"];
const OPEN: PedidoSite["status"][] = ["novo", "em_contato", "em_producao"];
const LOGO_STATUS = ["novo", "em_criacao", "aguardando_aprovacao", "ajustes", "aprovada"] as const;
// E-mail(s) do designer/equipe avisados de pedidos de logo e das respostas
// do cliente. Vazio = só a notificação no painel de Gestão.
const DESIGN_TEAM_EMAILS = (process.env.DESIGN_TEAM_EMAIL || "").split(",").map(s => s.trim()).filter(Boolean);

const whatsappUrl = (pousadaName: string, servico: ServicoSite, contato?: string) => {
  const number = AGENCY_WHATSAPP.replace(/\D/g, "");
  const oque = servico === "logo" ? "uma logo" : servico === "logo_site" ? "uma logo e um site" : "um site profissional";
  const text = `Olá! ${contato ? `Sou ${contato}, gestor(a) da` : "Sou gestor(a) da"} ${pousadaName} e quero ${oque} para a minha pousada.`;
  return `https://wa.me/${number}?text=${encodeURIComponent(text)}`;
};

async function versoesDe(pedidoIds: string[]): Promise<LogoVersao[]> {
  if (pedidoIds.length === 0) return [];
  const { data, error } = await supabase.from("logo_versoes").select("*").in("pedidoId", pedidoIds).order("createdAt", { ascending: true });
  return error ? [] : (data as LogoVersao[]);
}

async function salvarVersoes(versoes: LogoVersao[]) {
  for (const v of versoes) {
    await supabase.from("logo_versoes").update({ status: v.status, clienteComentario: v.clienteComentario ?? null, decidedAt: v.decidedAt ?? null }).eq("id", v.id);
  }
}

async function avisarEquipe(subject: string, html: string) {
  for (const to of DESIGN_TEAM_EMAILS) await sendEmail({ to, subject, html });
}

const emailBox = (title: string, body: string, cta?: { href: string; label: string }) => `
  <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
    <h2 style="color: #101B4C;">${title}</h2>
    ${body}
    ${cta ? `<p><a href="${cta.href}" style="display:inline-block; background:#101B4C; color:#fff; padding:10px 20px; text-decoration:none; border-radius:4px;">${cta.label}</a></p>` : ""}
  </div>`;

// Pedido aberto (ou mais recente) da pousada, com as versões da logo.
async function pedidoAtual(pousadaId: string): Promise<PedidoSite | null> {
  const { data, error } = await supabase.from("pedidos_site").select("*").eq("pousadaId", pousadaId).order("createdAt", { ascending: false }).limit(1);
  if (error) throw error;
  const pedido = data?.[0] as PedidoSite | undefined;
  if (!pedido) return null;
  return { ...pedido, servico: pedido.servico || "site", versoes: await versoesDe([pedido.id]) };
}

export function registerSitesRoutes(app: Express) {

app.get("/api/pousadas/:id/pedido-site", requirePartnerAccess("pousada"), async (req, res) => {
  const { data: pousada } = await supabase.from("pousadas").select("name").eq("id", req.params.id).maybeSingle();
  if (!pousada) return res.status(404).json({ error: "Pousada não encontrada" });
  try {
    const pedido = await pedidoAtual(req.params.id);
    const nome = res.locals.actorUser?.user_metadata?.name;
    res.json({ pedido, whatsappUrl: whatsappUrl(pousada.name, pedido?.servico || "logo_site", nome) });
  } catch {
    res.status(503).json({ error: "Pedidos ainda não disponíveis — rode scripts/add-pedidos-site.sql e add-servico-logo.sql." });
  }
});

// Idempotente: com um pedido em aberto, devolve o mesmo em vez de duplicar.
app.post("/api/pousadas/:id/pedido-site", requirePartnerAccess("pousada"), async (req, res) => {
  const { data: pousada } = await supabase.from("pousadas").select("name").eq("id", req.params.id).maybeSingle();
  if (!pousada) return res.status(404).json({ error: "Pousada não encontrada" });
  const servico = (SERVICOS as string[]).includes(req.body.servico) ? (req.body.servico as ServicoSite) : "site";
  const user = res.locals.actorUser;
  const link = whatsappUrl(pousada.name, servico, user?.user_metadata?.name);

  const { data: open } = await supabase.from("pedidos_site").select("*").eq("pousadaId", req.params.id).in("status", OPEN).limit(1);
  if (open && open[0]) return res.json({ pedido: { ...open[0], versoes: await versoesDe([open[0].id]) }, whatsappUrl: link });

  const now = new Date().toISOString();
  const pedido: PedidoSite = {
    id: `ps_${randomUUID()}`,
    pousadaId: req.params.id,
    servico,
    logoStatus: incluiLogo(servico) ? "novo" : null,
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
  const resumo = `${SERVICO_LABEL[servico]} — ${pousada.name}${pedido.contatoNome ? ` (${pedido.contatoNome})` : ""}`;
  addNotification("admin", `Novo pedido: ${resumo}.`, "status_update");
  if (incluiLogo(servico)) {
    await avisarEquipe(`Novo pedido de logo — ${pousada.name}`, emailBox("Novo pedido de logo 🎨",
      `<p>${escapeHtml(resumo)}</p><p>Contato: ${escapeHtml(pedido.contatoEmail || "")} ${escapeHtml(pedido.contatoTelefone || "")}</p>`,
      { href: `${SITE_URL}/`, label: "Abrir a Gestão" }));
  }
  res.status(201).json({ pedido: { ...pedido, versoes: [] }, whatsappUrl: link });
});

// Cliente aprova uma versão da logo (com comentário opcional). As outras
// pendentes são rejeitadas, a logo entra no cadastro da pousada e, se o
// pedido era só de logo, ele termina aqui.
app.post("/api/pousadas/:id/logo/:versaoId/aprovar", requirePartnerAccess("pousada"), async (req, res) => {
  const pedido = await pedidoAtual(req.params.id).catch(() => null);
  if (!pedido || !incluiLogo(pedido.servico)) return res.status(404).json({ error: "Pedido de logo não encontrado." });
  const comentario = String(req.body.comentario || "").trim().slice(0, 1000);
  const agora = new Date().toISOString();
  let versoes: LogoVersao[];
  try {
    versoes = aprovarVersao(pedido.versoes || [], req.params.versaoId, comentario, agora);
  } catch (err: any) {
    return res.status(409).json({ error: err.message });
  }
  await salvarVersoes(versoes);
  const aprovada = versoes.find(v => v.id === req.params.versaoId)!;
  await supabase.from("pedidos_site").update({
    logoStatus: "aprovada",
    ...(pedido.servico === "logo" ? { status: "entregue" } : {}),
    updatedAt: agora,
  }).eq("id", pedido.id);
  await supabase.from("pousadas").update({ logoUrl: aprovada.imageUrl }).eq("id", req.params.id);

  const { data: pousada } = await supabase.from("pousadas").select("name").eq("id", req.params.id).maybeSingle();
  addNotification("admin", `Logo aprovada por ${pousada?.name || "pousada"}${comentario ? `: "${comentario.slice(0, 120)}"` : ""}.`, "status_update");
  await avisarEquipe(`Logo aprovada — ${pousada?.name || ""}`, emailBox("Logo aprovada ✅",
    `<p>${escapeHtml(pousada?.name || "")} aprovou uma versão da logo.</p>${comentario ? `<p><strong>Comentário:</strong> ${escapeHtml(comentario)}</p>` : ""}<p><img src="${aprovada.imageUrl}" alt="Logo aprovada" style="max-width:220px"/></p>`,
    pedido.servico === "logo_site" ? { href: `${SITE_URL}/`, label: "Seguir para o site" } : undefined));
  res.json({ pedido: await pedidoAtual(req.params.id) });
});

// Nenhuma versão agradou: rejeita as pendentes com o comentário do cliente.
app.post("/api/pousadas/:id/logo/ajustes", requirePartnerAccess("pousada"), async (req, res) => {
  const pedido = await pedidoAtual(req.params.id).catch(() => null);
  if (!pedido || !incluiLogo(pedido.servico)) return res.status(404).json({ error: "Pedido de logo não encontrado." });
  const comentario = String(req.body.comentario || "").trim().slice(0, 1000);
  if (!comentario) return res.status(400).json({ error: "Conte o que você gostaria de mudar." });
  const agora = new Date().toISOString();
  let versoes: LogoVersao[];
  try {
    versoes = pedirAjustes(pedido.versoes || [], comentario, agora);
  } catch (err: any) {
    return res.status(409).json({ error: err.message });
  }
  await salvarVersoes(versoes);
  await supabase.from("pedidos_site").update({ logoStatus: "ajustes", updatedAt: agora }).eq("id", pedido.id);
  const { data: pousada } = await supabase.from("pousadas").select("name").eq("id", req.params.id).maybeSingle();
  addNotification("admin", `${pousada?.name || "Pousada"} pediu ajustes na logo: "${comentario.slice(0, 120)}".`, "status_update");
  await avisarEquipe(`Ajustes pedidos na logo — ${pousada?.name || ""}`, emailBox("Pedido de ajustes na logo ✏️",
    `<p>${escapeHtml(pousada?.name || "")} não aprovou as versões enviadas.</p><p><strong>Comentário:</strong> ${escapeHtml(comentario)}</p>`));
  res.json({ pedido: await pedidoAtual(req.params.id) });
});

app.get("/api/admin/pedidos-site", requireAdmin, async (req, res) => {
  const { data, error } = await supabase.from("pedidos_site").select("*").order("createdAt", { ascending: false });
  if (error) return res.status(503).json({ error: "Tabela de pedidos não encontrada — rode scripts/add-pedidos-site.sql." });
  const ids = [...new Set((data || []).map(p => p.pousadaId))];
  const { data: pousadas } = ids.length ? await supabase.from("pousadas").select("id, name, sitePublicado, customDomain").in("id", ids) : { data: [] as any[] };
  const versoes = await versoesDe((data || []).map(p => p.id));
  res.json((data || []).map(p => {
    const pousada = (pousadas || []).find(x => x.id === p.pousadaId);
    return {
      ...p,
      servico: p.servico || "site",
      versoes: versoes.filter(v => v.pedidoId === p.id),
      pousadaName: pousada?.name || "—",
      sitePublicado: !!pousada?.sitePublicado,
      customDomain: pousada?.customDomain || null,
    };
  }));
});

// Status do site/pedido, etapa da logo e anotações. "entregue" publica o
// site — bloqueado enquanto a logo do pedido não for aprovada.
app.put("/api/admin/pedidos-site/:id", requireAdmin, async (req, res) => {
  const { data: atual } = await supabase.from("pedidos_site").select("*").eq("id", req.params.id).maybeSingle();
  if (!atual) return res.status(404).json({ error: "Pedido não encontrado." });
  const status = req.body.status as PedidoSite["status"] | undefined;
  const logoStatus = req.body.logoStatus as PedidoSite["logoStatus"] | undefined;
  if (status && !STATUS.includes(status)) return res.status(400).json({ error: "Status inválido." });
  if (logoStatus && !(LOGO_STATUS as readonly string[]).includes(logoStatus)) return res.status(400).json({ error: "Etapa da logo inválida." });
  if (logoStatus === "aprovada") return res.status(400).json({ error: "Quem aprova a logo é o cliente, pelo portal." });
  if (status && status !== atual.status) {
    const bloqueio = podeMudarStatus({ servico: atual.servico || "site", logoStatus: atual.logoStatus }, status);
    if (bloqueio) return res.status(409).json({ error: bloqueio });
  }
  const updates: Partial<PedidoSite> = { updatedAt: new Date().toISOString() };
  if (status) updates.status = status;
  if (logoStatus) updates.logoStatus = logoStatus;
  if (typeof req.body.notes === "string") updates.notes = req.body.notes.slice(0, 2000);
  const { data, error } = await supabase.from("pedidos_site").update(updates).eq("id", req.params.id).select().maybeSingle();
  if (error || !data) return res.status(500).json({ error: "Erro ao atualizar o pedido." });
  if (status === "entregue" && (data.servico || "site") !== "logo") {
    await supabase.from("pousadas").update({ sitePublicado: true }).eq("id", data.pousadaId);
  }
  await logAdminAction(res.locals.adminUser, "update_status", "pedido_site", req.params.id, `${data.pousadaId} → ${data.status}/${data.logoStatus || "-"}`);
  res.json(data);
});

// Designer anexa uma versão da logo (a imagem já foi enviada por
// /api/upload-image). O cliente recebe e-mail para avaliar no portal.
app.post("/api/admin/pedidos-site/:id/logo-versoes", requireAdmin, async (req, res) => {
  const { data: pedido } = await supabase.from("pedidos_site").select("*").eq("id", req.params.id).maybeSingle();
  if (!pedido || !incluiLogo(pedido.servico)) return res.status(404).json({ error: "Pedido de logo não encontrado." });
  if (pedido.logoStatus === "aprovada") return res.status(409).json({ error: "A logo deste pedido já foi aprovada." });
  const imageUrl = String(req.body.imageUrl || "").trim();
  if (!/^https:\/\/\S+$/.test(imageUrl)) return res.status(400).json({ error: "Envie a imagem da versão." });
  const versao: LogoVersao = {
    id: `lv_${randomUUID()}`,
    pedidoId: pedido.id,
    imageUrl,
    descricao: String(req.body.descricao || "").trim().slice(0, 500) || undefined,
    status: "pendente",
    createdBy: res.locals.adminUser?.email || undefined,
    createdAt: new Date().toISOString(),
  };
  const { error } = await supabase.from("logo_versoes").insert(versao);
  if (error) {
    log.error("[POST logo-versoes]", error.message);
    return res.status(500).json({ error: "Erro ao salvar a versão (rodou scripts/add-servico-logo.sql?)." });
  }
  await supabase.from("pedidos_site").update({ logoStatus: "aguardando_aprovacao", updatedAt: versao.createdAt }).eq("id", pedido.id);
  // Um e-mail por lote: só avisa quando esta é a primeira versão pendente.
  const { count } = await supabase.from("logo_versoes").select("id", { count: "exact", head: true }).eq("pedidoId", pedido.id).eq("status", "pendente");
  if (pedido.contatoEmail && (count || 0) <= 1) {
    const { data: pousada } = await supabase.from("pousadas").select("name").eq("id", pedido.pousadaId).maybeSingle();
    await sendEmail({
      to: pedido.contatoEmail,
      subject: `Sua logo está pronta para avaliação — ${pousada?.name || "EcoSafari"}`,
      html: emailBox("Sua logo está pronta para avaliação 🎨",
        `<p>Nosso designer preparou versões da logo da <strong>${escapeHtml(pousada?.name || "sua pousada")}</strong>.</p><p>Entre no portal, abra a pousada e vá em <strong>Editar Site</strong> para escolher uma versão — você pode deixar um comentário junto.</p>`,
        { href: `${SITE_URL}/parceiro`, label: "Avaliar a logo" }),
    });
  }
  await logAdminAction(res.locals.adminUser, "create", "logo_versao", versao.id, pedido.pousadaId);
  res.status(201).json(versao);
});

app.delete("/api/admin/logo-versoes/:id", requireAdmin, async (req, res) => {
  const { data: versao } = await supabase.from("logo_versoes").select("*").eq("id", req.params.id).maybeSingle();
  if (!versao) return res.status(404).json({ error: "Versão não encontrada." });
  if (versao.status !== "pendente") return res.status(409).json({ error: "Só dá para remover versões que o cliente ainda não avaliou." });
  await supabase.from("logo_versoes").delete().eq("id", req.params.id);
  res.json({ success: true });
});
}
