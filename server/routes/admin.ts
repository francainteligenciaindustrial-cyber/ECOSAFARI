// Gestão: notificações, lixeira, governança de admins, auditoria, candidaturas.
import type { Express } from "express";
import { Candidatura, ReferralSource, PartnerType } from "../../src/types.js";
import { randomUUID } from "crypto";
import {
  addNotification,
  CANDIDATURA_PUBLIC_FIELDS,
  finalizeGrantAdmin,
  finalizeRevokeAdmin,
  isAdminUser,
  LIXEIRA_TABLE,
  log,
  logAdminAction,
  PARTNER_TABLE_BY_TYPE,
  pickFields,
  provisionPartnerLogin,
  publicFormLimiter,
  REFERRAL_SOURCE_FIELDS,
  requireAdmin,
  requireChief,
  REQUIRED_YES_VOTES,
  splitCommaList,
  supabase,
  supabaseAdminAuth,
  verifyRecaptcha,
} from "../core.js";

export function registerAdminRoutes(app: Express) {

// NOTIFICATIONS
app.get("/api/notifications", requireAdmin, async (req, res) => {
  // Sem order(), o Postgres devolve na ordem física de armazenamento — que
  // por acaso tende a parecer "mais antiga primeiro", o oposto do que faz
  // sentido num feed de notificação.
  const { data, error } = await supabase.from("notifications").select("*").order("timestamp", { ascending: false });
  if (error) return res.status(500).json({ error: "Erro ao buscar notificações" });
  res.json(data);
});

app.post("/api/notifications/:id/read", requireAdmin, async (req, res) => {
  const { id } = req.params;
  const { data, error } = await supabase.from("notifications").update({ read: true }).eq("id", id).select().single();
  if (error || !data) return res.status(404).json({ error: "Notificação não encontrada" });
  res.json(data);
});

// LIXEIRA — listar, restaurar ou apagar de vez (ver moverParaLixeira acima)
app.get("/api/lixeira", requireAdmin, async (req, res) => {
  const { data, error } = await supabase.from("lixeira").select("*").order("deletedAt", { ascending: false });
  if (error) return res.status(500).json({ error: "Erro ao buscar lixeira" });
  res.json(data);
});

app.post("/api/lixeira/:id/restaurar", requireAdmin, async (req, res) => {
  const { id } = req.params;
  const { data: entry, error } = await supabase.from("lixeira").select("*").eq("id", id).maybeSingle();
  if (error || !entry) return res.status(404).json({ error: "Registro não encontrado na lixeira" });

  const table = LIXEIRA_TABLE[entry.entityType as keyof typeof LIXEIRA_TABLE];
  if (!table) return res.status(400).json({ error: "Tipo de registro desconhecido" });

  const { error: insertError } = await supabase.from(table).insert(entry.data.row);
  if (insertError) {
    log.error("[POST /api/lixeira/:id/restaurar]", insertError.message);
    return res.status(500).json({ error: "Erro ao restaurar o registro. Tente novamente ou fale com o suporte.", requestId: res.getHeader("X-Request-Id") });
  }

  // Pousada: reinsere também os produtos/consumos que tinham sido levados
  // junto pra lixeira (ON DELETE CASCADE — ver moverParaLixeira).
  if (entry.entityType === "pousada") {
    if (entry.data.produtos?.length) await supabase.from("produtos").insert(entry.data.produtos);
    if (entry.data.consumos?.length) await supabase.from("consumos").insert(entry.data.consumos);
  }

  await supabase.from("lixeira").delete().eq("id", id);
  await logAdminAction(res.locals.adminUser, "restore", entry.entityType, entry.entityId, entry.entityLabel);
  res.json({ success: true, message: "Registro restaurado com sucesso." });
});

// Apagar de vez, antes dos 30 dias — sem volta a partir daqui.
app.delete("/api/lixeira/:id", requireAdmin, async (req, res) => {
  const { id } = req.params;
  const { data: entry } = await supabase.from("lixeira").select("entityType, entityLabel").eq("id", id).maybeSingle();
  const { error } = await supabase.from("lixeira").delete().eq("id", id);
  if (error) return res.status(500).json({ error: "Erro ao excluir definitivamente" });
  await logAdminAction(res.locals.adminUser, "purge", entry?.entityType || "lixeira", id, entry?.entityLabel || id);
  res.json({ success: true, message: "Registro apagado definitivamente." });
});

// CANDIDATURAS CRUD — cadastro público de parceiros (guias e pousadas)
// GET/PUT/DELETE são usados pelo painel de Gestão; POST é público (formulário /seja-parceiro).
app.get("/api/candidaturas", requireAdmin, async (req, res) => {
  const { data, error } = await supabase.from("candidaturas").select("*");
  if (error) return res.status(500).json({ error: "Erro ao buscar candidaturas" });
  res.json(data);
});

// Consulta pública de status por email + token — para o parceiro acompanhar
// a candidatura sem precisar ligar. Exige os dois (não só o email) porque um
// email sozinho é fácil de adivinhar/saber de outra pessoa; o token só o
// próprio candidato recebe, na hora em que envia o formulário. Só devolve os
// campos necessários pra mostrar o status — nunca telefone/mensagem/email,
// mesmo pra quem acertar o par certo.
app.get("/api/candidaturas/status", async (req, res) => {
  const email = String(req.query.email || "").trim().toLowerCase();
  const token = String(req.query.token || "").trim();
  if (!email || !token) {
    return res.status(400).json({ error: "Informe o email e o código de acompanhamento enviados na confirmação do cadastro." });
  }
  // ilike with no wildcards = exact match, case-insensitive
  const { data, error } = await supabase
    .from("candidaturas")
    .select("id,type,status,dateCreated,name,pousadaName")
    .ilike("email", email)
    .eq("statusToken", token);
  if (error) return res.status(500).json({ error: "Erro ao buscar candidatura" });
  res.json(data);
});

app.post("/api/candidaturas", publicFormLimiter, async (req, res) => {
  const { recaptchaToken, ...body } = req.body;
  if (!(await verifyRecaptcha(recaptchaToken))) {
    return res.status(400).json({ error: "Falha na verificação de segurança. Recarregue a página e tente novamente." });
  }

  // Server-controlled fields go last so a malicious body can't override them
  // (e.g. submitting status: "aprovado" directly, or a chosen statusToken).
  const newCandidatura: Candidatura = {
    ...pickFields<Candidatura>(body, CANDIDATURA_PUBLIC_FIELDS),
    id: `cand_${randomUUID()}`,
    status: "pendente",
    dateCreated: new Date().toISOString(),
    statusToken: randomUUID(),
  } as Candidatura;

  let { error } = await supabase.from("candidaturas").insert(newCandidatura);
  // Degrades gracefully if scripts/add-candidatura-status-token.sql hasn't
  // been run yet — the submission itself must not break just because the
  // status-token column doesn't exist in the DB yet (status lookup by
  // email+token just won't work for this one until the column is added and
  // it's resubmitted, which is a much smaller problem than losing candidates).
  if (error?.message?.includes("statusToken")) {
    const { statusToken, ...withoutToken } = newCandidatura as any;
    ({ error } = await supabase.from("candidaturas").insert(withoutToken));
  }
  if (error) {
    log.error("Erro ao salvar candidatura no Supabase:", error.message);
    return res.status(500).json({ error: "Erro ao salvar candidatura" });
  }

  const label = newCandidatura.type === "pousada"
    ? `Nova candidatura de pousada: ${newCandidatura.pousadaName || newCandidatura.name}`
    : newCandidatura.type === "atracao"
    ? `Nova candidatura de atração: ${newCandidatura.atracaoName || newCandidatura.name}`
    : `Nova candidatura de guia: ${newCandidatura.name}`;
  addNotification("admin", label, "status_update");

  res.status(201).json(newCandidatura);
});

// Only "status" is ever editable from the admin panel (triage: pendente →
// contatado/aprovado/rejeitado) — applicant-submitted fields (name, email,
// message, etc.) are read-only here on purpose, so an admin session can't be
// used to rewrite what a candidate actually submitted.
app.put("/api/candidaturas/:id", requireAdmin, async (req, res) => {
  const { id } = req.params;
  const updates = pickFields<Candidatura>(req.body, ["status"]);
  const { data, error } = await supabase.from("candidaturas").update(updates).eq("id", id).select().single();
  if (error || !data) return res.status(404).json({ error: "Candidatura não encontrada" });
  await logAdminAction(res.locals.adminUser, "update_status", "candidatura", id, `${data.name} — ${data.status}`);
  res.json(data);
});

app.delete("/api/candidaturas/:id", requireAdmin, async (req, res) => {
  const { id } = req.params;
  const { data: existing } = await supabase.from("candidaturas").select("name").eq("id", id).maybeSingle();
  const { error } = await supabase.from("candidaturas").delete().eq("id", id);
  if (error) return res.status(500).json({ error: "Erro ao excluir candidatura" });
  await logAdminAction(res.locals.adminUser, "delete", "candidatura", id, existing?.name || id);
  res.json({ success: true, message: "Candidatura excluída com sucesso" });
});

app.post("/api/referral-sources", publicFormLimiter, async (req, res) => {
  const newSource: ReferralSource = {
    ...pickFields<ReferralSource>(req.body, REFERRAL_SOURCE_FIELDS),
    id: `ref_${randomUUID()}`,
    timestamp: new Date().toISOString(),
  } as ReferralSource;
  // referral_sources may not exist (see scripts/add-referral-sources-table.sql)
  // — this endpoint's only caller in the frontend was already removed, so it
  // degrades gracefully instead of erroring if the table isn't there.
  try {
    const { error } = await supabase.from("referral_sources").insert(newSource);
    if (error) log.warn("Erro ao salvar origem do visitante no Supabase:", error.message);
  } catch (err: any) {
    log.warn("Erro ao salvar origem do visitante no Supabase:", err.message);
  }
  res.status(201).json(newSource);
});

app.get("/api/referral-sources", requireAdmin, async (req, res) => {
  const { data, error } = await supabase.from("referral_sources").select("*");
  if (error) return res.json([]);
  res.json(data);
});

// ----------------------------------------------------
// ADMIN USER MANAGEMENT (Supabase Auth)
// ----------------------------------------------------

app.get("/api/admin/users", requireAdmin, async (req, res) => {
  if (!supabaseAdminAuth) return res.status(503).json({ error: "SUPABASE_SERVICE_ROLE_KEY não configurada — gestão de administradores indisponível." });
  const { data, error } = await supabaseAdminAuth.auth.admin.listUsers({ perPage: 200 });
  if (error || !data?.users) return res.status(500).json({ error: "Erro ao listar administradores." });
  const admins = data.users
    .filter((u: any) => isAdminUser(u))
    .map((u: any) => ({
      id: u.id,
      email: u.email,
      createdAt: u.created_at,
      lastSignInAt: u.last_sign_in_at || null,
      isChief: u.app_metadata?.isChief === true,
    }));
  res.json(admins);
});

// Lista as propostas (mais recentes primeiro) junto com os votos já
// registrados em cada uma — qualquer admin vê o andamento, mas só um chefe
// consegue de fato votar (POST .../vote, abaixo, usa requireChief).
app.get("/api/admin/proposals", requireAdmin, async (req, res) => {
  const { data: proposals, error } = await supabase
    .from("admin_invite_proposals")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) return res.status(500).json({ error: "Erro ao buscar propostas de administrador." });

  const ids = (proposals || []).map((p: any) => p.id);
  const { data: votes } = ids.length
    ? await supabase.from("admin_invite_votes").select("*").in("proposal_id", ids)
    : { data: [] as any[] };

  const withVotes = (proposals || []).map((p: any) => ({
    ...p,
    votes: (votes || []).filter((v: any) => v.proposal_id === p.id),
  }));
  res.json(withVotes);
});

app.post("/api/admin/proposals", requireAdmin, async (req, res) => {
  if (!supabaseAdminAuth) return res.status(503).json({ error: "SUPABASE_SERVICE_ROLE_KEY não configurada — governança de administradores indisponível." });
  const actor = res.locals.adminUser as { id: string; email?: string };
  const action = req.body.action === "revoke" ? "revoke" : "grant";

  if (action === "grant") {
    const email = String(req.body.email || "").trim().toLowerCase();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: "Informe um email válido." });
    }
    const { data: existingUsers } = await supabaseAdminAuth.auth.admin.listUsers({ perPage: 1000 });
    const match = existingUsers?.users?.find((u: any) => u.email?.toLowerCase() === email);
    if (match && isAdminUser(match)) {
      return res.status(400).json({ error: "Este email já tem acesso de administrador." });
    }
    const { data: pending } = await supabase
      .from("admin_invite_proposals")
      .select("id")
      .eq("email", email)
      .eq("action", "grant")
      .eq("status", "pending");
    if (pending && pending.length > 0) {
      return res.status(400).json({ error: "Já existe uma proposta pendente de concessão para este email." });
    }

    const proposal = {
      id: `prop_${randomUUID()}`,
      email,
      action: "grant",
      target_user_id: null,
      proposed_by_id: actor.id,
      proposed_by_email: actor.email || "",
      status: "pending",
    };
    const { error } = await supabase.from("admin_invite_proposals").insert(proposal);
    if (error) return res.status(500).json({ error: "Erro ao criar proposta." });
    await logAdminAction(actor, "propose_grant_admin", "admin_proposal", proposal.id, email);
    return res.status(201).json(proposal);
  }

  // action === "revoke"
  const targetUserId = String(req.body.targetUserId || "");
  if (!targetUserId) return res.status(400).json({ error: "Informe o administrador a ser removido." });
  const { data: existingUsers } = await supabaseAdminAuth.auth.admin.listUsers({ perPage: 1000 });
  const match = existingUsers?.users?.find((u: any) => u.id === targetUserId);
  if (!match || !isAdminUser(match)) {
    return res.status(404).json({ error: "Administrador não encontrado." });
  }
  const { data: pending } = await supabase
    .from("admin_invite_proposals")
    .select("id")
    .eq("target_user_id", targetUserId)
    .eq("action", "revoke")
    .eq("status", "pending");
  if (pending && pending.length > 0) {
    return res.status(400).json({ error: "Já existe uma proposta pendente para remover este administrador." });
  }

  const proposal = {
    id: `prop_${randomUUID()}`,
    email: match.email,
    action: "revoke",
    target_user_id: targetUserId,
    proposed_by_id: actor.id,
    proposed_by_email: actor.email || "",
    status: "pending",
  };
  const { error } = await supabase.from("admin_invite_proposals").insert(proposal);
  if (error) return res.status(500).json({ error: "Erro ao criar proposta." });
  await logAdminAction(actor, "propose_revoke_admin", "admin_proposal", proposal.id, match.email);
  res.status(201).json(proposal);
});

app.post("/api/admin/proposals/:id/vote", requireChief, async (req, res) => {
  const chief = res.locals.chiefUser as { id: string; email?: string };
  const approve = req.body.approve === true;
  const { id } = req.params;

  const { data: proposal, error: fetchErr } = await supabase
    .from("admin_invite_proposals")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (fetchErr || !proposal) return res.status(404).json({ error: "Proposta não encontrada." });
  if (proposal.status !== "pending") return res.status(400).json({ error: "Esta proposta já foi resolvida." });

  const { error: voteErr } = await supabase
    .from("admin_invite_votes")
    .upsert(
      { proposal_id: id, chief_id: chief.id, chief_email: chief.email || "", approve },
      { onConflict: "proposal_id,chief_id" }
    );
  if (voteErr) return res.status(500).json({ error: "Erro ao registrar voto." });
  await logAdminAction(chief, approve ? "vote_approve" : "vote_reject", "admin_proposal", id, proposal.email);

  if (!approve) {
    await supabase.from("admin_invite_proposals").update({ status: "rejected", resolved_at: new Date().toISOString() }).eq("id", id);
    return res.json({ status: "rejected" });
  }

  const { data: votes } = await supabase.from("admin_invite_votes").select("*").eq("proposal_id", id);
  const yesVotes = (votes || []).filter((v: any) => v.approve).length;
  const required = REQUIRED_YES_VOTES[proposal.action as "grant" | "revoke"];

  if (yesVotes < required) {
    return res.json({ status: "pending", yesVotes, required });
  }

  const result = proposal.action === "grant"
    ? await finalizeGrantAdmin(proposal.email)
    : await finalizeRevokeAdmin(proposal.target_user_id);

  await supabase
    .from("admin_invite_proposals")
    .update({
      status: result.ok ? "approved" : "rejected",
      result_message: result.ok ? null : result.message || null,
      resolved_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (result.ok) {
    await logAdminAction(chief, proposal.action === "grant" ? "grant_admin" : "revoke_admin", "admin", proposal.target_user_id || null, proposal.email);
  }

  res.json({
    status: result.ok ? "approved" : "error",
    actionLink: result.ok ? (result as { actionLink?: string | null }).actionLink || null : null,
    error: result.ok ? null : result.message,
  });
});

// Cancela uma proposta ainda pendente — qualquer admin pode cancelar (não só
// quem propôs ou os chefes), já que a votação em si é o que precisa de
// governança forte; desistir de uma proposta não concede nada a ninguém.
app.delete("/api/admin/proposals/:id", requireAdmin, async (req, res) => {
  const actor = res.locals.adminUser as { id: string; email?: string };
  const { data: proposal } = await supabase.from("admin_invite_proposals").select("*").eq("id", req.params.id).maybeSingle();
  if (!proposal) return res.status(404).json({ error: "Proposta não encontrada." });
  if (proposal.status !== "pending") return res.status(400).json({ error: "Esta proposta já foi resolvida." });
  const { error } = await supabase
    .from("admin_invite_proposals")
    .update({ status: "cancelled", resolved_at: new Date().toISOString() })
    .eq("id", req.params.id);
  if (error) return res.status(500).json({ error: "Erro ao cancelar proposta." });
  await logAdminAction(actor, "cancel_admin_proposal", "admin_proposal", req.params.id, proposal.email);
  res.json({ success: true });
});

// Log de auditoria — toda ação administrativa registrada por logAdminAction
// (criar/editar/excluir conteúdo, aprovar candidatura, votar/conceder/
// revogar admin...), visível para qualquer admin autenticado.
app.get("/api/admin/audit-log", requireAdmin, async (req, res) => {
  const { data, error } = await supabase
    .from("admin_audit_log")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(300);
  if (error) return res.status(500).json({ error: "Erro ao buscar log de auditoria." });
  res.json(data);
});

// Turns a candidatura into an actual partner in one step: creates the
// pousada/guides/atracoes row from what the applicant submitted, then
// creates their partner login (same recovery-link pattern as
// POST /api/partners/invite above) — collapsing what used to be 3 manual
// admin actions (approve status → create record by hand → invite access by
// hand) into one. The new record is intentionally unverified/indisponível
// (not a public "trust badge" yet) since nothing here has been vetted
// beyond what the candidate typed into a public form — the partner (or an
// admin) fills in photos/pricing/etc. via the self-service portal before
// it's flagged as verified.
app.post("/api/candidaturas/:id/approve", requireAdmin, async (req, res) => {
  if (!supabaseAdminAuth) return res.status(503).json({ error: "SUPABASE_SERVICE_ROLE_KEY não configurada — aprovação com criação de acesso indisponível." });
  const { id } = req.params;

  const { data: candidatura, error: fetchErr } = await supabase.from("candidaturas").select("*").eq("id", id).maybeSingle();
  if (fetchErr || !candidatura) return res.status(404).json({ error: "Candidatura não encontrada." });
  if (candidatura.partnerId) return res.status(400).json({ error: "Esta candidatura já foi aprovada e virou um parceiro." });

  const email = String(candidatura.email || "").trim().toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: "Candidatura sem um email válido — não é possível criar o acesso do parceiro." });
  }

  const partnerType = candidatura.type as PartnerType;
  const table = PARTNER_TABLE_BY_TYPE[partnerType];
  if (!table) return res.status(400).json({ error: "Tipo de candidatura desconhecido." });

  let newRecord: Record<string, any>;
  if (partnerType === "guia") {
    newRecord = {
      id: `g_${randomUUID()}`,
      name: candidatura.name,
      email,
      phone: candidatura.phone || "",
      languages: splitCommaList(candidatura.languages).map(language => ({ language, level: "intermediario" as const })),
      specialty: splitCommaList(candidatura.specialty),
      status: "indisponivel",
      bio: candidatura.message || undefined,
      age: candidatura.age || undefined,
    };
  } else if (partnerType === "pousada") {
    newRecord = {
      id: `p_${randomUUID()}`,
      name: candidatura.pousadaName || candidatura.name,
      description: candidatura.message || "Nova pousada parceira EcoSafari — perfil em preparação.",
      location: candidatura.location || "",
      pricePerNight: 0,
      images: [],
      features: [],
      activities: [],
      experiences: [],
      capacity: candidatura.capacity || 1,
      verified: false,
      viewCount: 0,
    };
  } else {
    newRecord = {
      id: `at_${randomUUID()}`,
      type: candidatura.atracaoType === "restaurante" ? "restaurante" : "parada_legal",
      name: candidatura.atracaoName || candidatura.name,
      description: candidatura.message || "Nova atração parceira EcoSafari — perfil em preparação.",
      location: candidatura.location || "",
      images: [],
      rating: 0,
      verified: false,
      dateCreated: new Date().toISOString(),
    };
  }

  const { error: insertErr } = await supabase.from(table).insert(newRecord);
  if (insertErr) {
    log.error(`Erro ao criar parceiro (${table}) a partir da candidatura:`, insertErr.message);
    return res.status(500).json({ error: "Erro ao criar o registro do parceiro." });
  }

  // The partner record was already created successfully above — a login
  // failure here (e.g. Supabase Auth hiccup) shouldn't be reported as a hard
  // failure, since an admin can still invite access manually from the new
  // record's own "Acesso de parceiro" panel.
  const loginResult = await provisionPartnerLogin(email, { role: "partner", partnerType, partnerId: newRecord.id });
  if (loginResult.error) log.warn("Registro do parceiro criado, mas falha ao criar login:", loginResult.error);

  const { data: updatedCandidatura, error: updateErr } = await supabase
    .from("candidaturas")
    .update({ status: "aprovado", partnerId: newRecord.id })
    .eq("id", id)
    .select()
    .single();
  if (updateErr) log.warn("Parceiro criado, mas falha ao marcar candidatura como aprovada:", updateErr.message);

  await logAdminAction(res.locals.adminUser, "approve", "candidatura", id, `${candidatura.name} → ${partnerType} ${newRecord.id}`);

  res.status(201).json({
    candidatura: updatedCandidatura || { ...candidatura, status: "aprovado", partnerId: newRecord.id },
    partnerType,
    partnerId: newRecord.id,
    actionLink: loginResult.actionLink,
    loginCreated: !loginResult.error,
    emailSent: loginResult.emailSent,
    // Surfaced in the admin UI instead of only console.warn — otherwise the
    // only way to see *why* login provisioning failed is digging through
    // Vercel function logs, which isn't realistic for day-to-day triage.
    loginError: loginResult.error,
  });
});
}
