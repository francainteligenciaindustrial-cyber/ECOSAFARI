// Ciclo de publicação da pousada (src/lib/publicacao.ts):
//   em_preparacao → em_revisao (pousada envia, com o checklist completo)
//   em_revisao → publicada (Gestão publica) | em_preparacao (Gestão devolve, com comentário)
//   publicada ⇄ pausada (pela pousada ou pela Gestão; quem pausou retoma)
// A pousada recebe e-mail em cada passo; a Gestão é avisada do envio.
import type { Express } from "express";
import { checklistPublicacao, ROTULO_PUBLICACAO, type StatusPublicacao } from "../../src/lib/publicacao.js";
import {
  addNotification,
  clip,
  EMAIL_REPLY_TO,
  escapeHtml,
  getPousadaGestorEmails,
  logAdminAction,
  mapPousadaRow,
  requireAdmin,
  requirePartnerAccess,
  sendEmail,
  SITE_URL,
  supabase,
  writeSkippingMissingColumns,
} from "../core.js";

const MIGRATION_MSG = "O ciclo de publicação precisa da migração scripts/add-publicacao-pousadas.sql rodada no Supabase.";

async function carregar(id: string) {
  const { data } = await supabase.from("pousadas").select("*").eq("id", id).maybeSingle();
  return data;
}

async function mudarStatus(id: string, status: StatusPublicacao, extra: Record<string, any> = {}) {
  return writeSkippingMissingColumns({ publicacao: status, publicacaoAtualizadaEm: new Date().toISOString(), ...extra }, r => supabase.from("pousadas").update(r).eq("id", id));
}

const MENSAGENS: Record<string, (nome: string, nota?: string) => { assunto: string; html: string }> = {
  enviada: nome => ({
    assunto: `Recebemos o perfil da ${nome} para publicação`,
    html: `<p style="margin:0 0 12px">Obrigado! O perfil da <strong>${escapeHtml(nome)}</strong> foi enviado para revisão. Nossa equipe confere fotos, textos e informações e, se estiver tudo certo, publica no site — normalmente em até 2 dias úteis.</p><p style="margin:0">Você será avisado por e-mail.</p>`,
  }),
  publicada: nome => ({
    assunto: `${nome} está no ar no Ipantanal 🎉`,
    html: `<p style="margin:0 0 12px">A <strong>${escapeHtml(nome)}</strong> foi publicada e já aparece para os viajantes no catálogo, no mapa e nas buscas do Ipantanal.</p><p style="margin:0">Mantenha o calendário e os preços atualizados no portal para receber reservas sem conflito.</p>`,
  }),
  devolvida: (nome, nota) => ({
    assunto: `Ajustes no perfil da ${nome} antes de publicar`,
    html: `<p style="margin:0 0 12px">Revisamos o perfil da <strong>${escapeHtml(nome)}</strong> e precisamos de alguns ajustes antes de publicar:</p><div style="margin:0 0 12px;padding:14px 16px;background:#FFF7E6;border:1px solid #F5D58A;border-radius:14px">${escapeHtml(nota || "")}</div><p style="margin:0">Depois de ajustar, clique em <strong>Enviar para publicação</strong> no portal.</p>`,
  }),
  pausada: (nome, nota) => ({
    assunto: `${nome} foi pausada no Ipantanal`,
    html: `<p style="margin:0 0 12px">A <strong>${escapeHtml(nome)}</strong> está pausada e não aparece no site nem recebe novas reservas. As reservas já feitas continuam valendo.</p>${nota ? `<p style="margin:0 0 12px">Motivo: ${escapeHtml(nota)}</p>` : ""}`,
  }),
  retomada: nome => ({
    assunto: `${nome} voltou ao ar no Ipantanal`,
    html: `<p style="margin:0">A <strong>${escapeHtml(nome)}</strong> voltou a aparecer no site e a receber reservas.</p>`,
  }),
};

async function avisarPousada(pousadaId: string, nome: string, tipo: keyof typeof MENSAGENS, nota?: string) {
  const m = MENSAGENS[tipo](nome, nota);
  for (const to of await getPousadaGestorEmails(pousadaId).catch(() => [] as string[])) {
    await sendEmail({ to, subject: m.assunto, html: `${m.html}<p style="margin:20px 0 0"><a href="${SITE_URL}/parceiro" style="display:inline-block;background:#0B1412;color:#fff;padding:10px 20px;text-decoration:none;border-radius:999px">Abrir o portal</a></p>` }).catch(() => {});
  }
}

export function registerPublicacaoRoutes(app: Express) {

  // Portal: status, comentário da Gestão e checklist.
  app.get("/api/pousadas/:id/publicacao", requirePartnerAccess("pousada"), async (req, res) => {
    const row = await carregar(req.params.id);
    if (!row) return res.status(404).json({ error: "Pousada não encontrada." });
    if (!("publicacao" in row)) return res.status(503).json({ error: MIGRATION_MSG });
    const p = mapPousadaRow(row);
    res.json({ status: row.publicacao || "em_preparacao", nota: row.publicacaoNota || "", pausadaPor: row.publicacaoPausadaPor || null, checklist: checklistPublicacao(p) });
  });

  app.post("/api/pousadas/:id/publicacao/enviar", requirePartnerAccess("pousada"), async (req, res) => {
    const row = await carregar(req.params.id);
    if (!row) return res.status(404).json({ error: "Pousada não encontrada." });
    if (!("publicacao" in row)) return res.status(503).json({ error: MIGRATION_MSG });
    if (row.publicacao !== "em_preparacao") return res.status(409).json({ error: `A pousada está "${ROTULO_PUBLICACAO[row.publicacao as StatusPublicacao] || row.publicacao}".` });
    const faltando = checklistPublicacao(mapPousadaRow(row)).filter(i => !i.ok);
    if (faltando.length) return res.status(400).json({ error: `Complete antes de enviar: ${faltando.map(i => i.label).join("; ")}.` });
    await mudarStatus(row.id, "em_revisao", { publicacaoEnviadaEm: new Date().toISOString() });
    addNotification("admin", `${row.name} enviou o perfil para publicação. Revise em Gestão → Pousadas.`, "status_update");
    if (EMAIL_REPLY_TO) await sendEmail({ to: EMAIL_REPLY_TO, subject: `Revisar para publicação: ${row.name}`, html: `<p style="margin:0">A pousada <strong>${escapeHtml(row.name)}</strong> completou o perfil e pediu publicação. Revise em <a href="${SITE_URL}/admin" style="color:#087A55">Gestão → Pousadas</a> e publique ou devolva com um comentário.</p>` }).catch(() => {});
    await avisarPousada(row.id, row.name, "enviada");
    res.json({ ok: true, status: "em_revisao" });
  });

  // A pousada pausa / retoma (só retoma o que ela mesma pausou).
  app.post("/api/pousadas/:id/publicacao/pausar", requirePartnerAccess("pousada"), async (req, res) => {
    const row = await carregar(req.params.id);
    if (!row || !("publicacao" in row)) return res.status(404).json({ error: "Pousada não encontrada." });
    if (row.publicacao !== "publicada") return res.status(409).json({ error: "Só uma pousada publicada pode ser pausada." });
    await mudarStatus(row.id, "pausada", { publicacaoPausadaPor: "pousada" });
    addNotification("admin", `${row.name} pausou a própria página.`, "status_update");
    await avisarPousada(row.id, row.name, "pausada", "pausada pela própria pousada");
    res.json({ ok: true, status: "pausada" });
  });

  app.post("/api/pousadas/:id/publicacao/retomar", requirePartnerAccess("pousada"), async (req, res) => {
    const row = await carregar(req.params.id);
    if (!row || !("publicacao" in row)) return res.status(404).json({ error: "Pousada não encontrada." });
    if (row.publicacao !== "pausada" || row.publicacaoPausadaPor !== "pousada") return res.status(409).json({ error: "Esta pausa foi feita pela equipe Ipantanal — fale com a gente para voltar ao ar." });
    await mudarStatus(row.id, "publicada", { publicacaoPausadaPor: null });
    await avisarPousada(row.id, row.name, "retomada");
    res.json({ ok: true, status: "publicada" });
  });

  // Gestão: publicar, devolver (com comentário), pausar, retomar.
  app.post("/api/admin/pousadas/:id/publicacao", requireAdmin, async (req, res) => {
    const row = await carregar(req.params.id);
    if (!row) return res.status(404).json({ error: "Pousada não encontrada." });
    if (!("publicacao" in row)) return res.status(503).json({ error: MIGRATION_MSG });
    const acao = String(req.body.acao || "");
    const nota = clip(req.body.nota, 1000);
    if (acao === "publicar") {
      await mudarStatus(row.id, "publicada", { publicacaoNota: null, publicacaoPausadaPor: null, publicadaEm: row.publicadaEm || new Date().toISOString() });
      await avisarPousada(row.id, row.name, row.publicacao === "pausada" ? "retomada" : "publicada");
    } else if (acao === "devolver") {
      if (!nota) return res.status(400).json({ error: "Escreva o que a pousada precisa ajustar." });
      await mudarStatus(row.id, "em_preparacao", { publicacaoNota: nota });
      await avisarPousada(row.id, row.name, "devolvida", nota);
    } else if (acao === "pausar") {
      await mudarStatus(row.id, "pausada", { publicacaoPausadaPor: "gestao", publicacaoNota: nota || null });
      await avisarPousada(row.id, row.name, "pausada", nota);
    } else return res.status(400).json({ error: "Ação inválida." });
    await logAdminAction(res.locals.adminUser, "update", "pousada", row.id, `publicação: ${acao}${nota ? ` — ${nota}` : ""}`);
    res.json({ ok: true });
  });
}
