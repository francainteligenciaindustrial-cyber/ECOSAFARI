// Portal do parceiro: acesso, gestores, colaboradores, produtos, consumos, caixa, recompensas.
import type { Express } from "express";
import { Recompensa, Produto, PartnerType } from "../../src/types.js";
import { randomUUID } from "crypto";
import QRCode from "qrcode";
import {
  ACTIVE_BOOKING_STATUSES,
  authLimiter,
  clip,
  COLAB_SERVICES_MAX,
  describeAuthError,
  EMAIL_FROM,
  escapeHtml,
  getPartnerUserFromRequest,
  getPousadaGestorEmails,
  ISO_DATE,
  isWeakPassword,
  log,
  logAdminAction,
  mapAtracaoRow,
  mapColaborador,
  mapGuideRow,
  mapPousadaRow,
  parseJSONSafe,
  PARTNER_TABLE_BY_TYPE,
  PAYMENT_METHODS,
  pickFields,
  PRODUTO_FIELDS,
  provisionPartnerLogin,
  publicFormLimiter,
  RECOMPENSA_FIELDS,
  remetenteDaPousada,
  requireAdmin,
  requirePartnerAccess,
  resolveTranslation,
  sendEmail,
  shiftDays,
  SITE_URL,
  statusDominioRemetente,
  stripe,
  supabase,
  supabaseAdminAuth,
  toCleanList,
  verifyRecaptcha,
} from "../core.js";
import { parseFromHeader } from "../../src/lib/emailSender.js";

export function registerParceirosRoutes(app: Express) {

// Remetente de e-mail da pousada e situação do domínio no Resend — o admin
// configura, o parceiro só acompanha no portal.
app.get("/api/pousadas/:id/email-remetente", requirePartnerAccess("pousada"), async (req, res) => {
  const { data } = await supabase.from("pousadas").select("*").eq("id", req.params.id).maybeSingle();
  if (!data) return res.status(404).json({ error: "Pousada não encontrada" });
  const { from, replyTo } = await remetenteDaPousada(req.params.id);
  const own = String(data.emailRemetente || "").trim();
  // Domínio próprio: consulta o Resend. Padrão (via EcoSafari): o domínio da
  // plataforma é o que precisa estar verificado.
  const { status } = await statusDominioRemetente(own || parseFromHeader(EMAIL_FROM).address);
  res.json({ from, replyTo: replyTo || null, ownDomain: !!own, status });
});

// Público — só as recompensas ativas, para o turista escolher o que resgatar.
app.get("/api/pousadas/:id/recompensas", async (req, res) => {
  const { data, error } = await supabase
    .from("pousada_recompensas")
    .select("*")
    .eq("pousadaId", req.params.id)
    .eq("active", true)
    .order("coinCost", { ascending: true });
  if (error) return res.status(500).json({ error: "Erro ao buscar recompensas." });
  res.json(data);
});

// Visão de gestão do próprio parceiro (ou admin) — inclui as inativas também,
// pra dar pra reativar depois.
app.get("/api/pousadas/:id/recompensas/manage", requirePartnerAccess("pousada"), async (req, res) => {
  const { data, error } = await supabase
    .from("pousada_recompensas")
    .select("*")
    .eq("pousadaId", req.params.id)
    .order("createdAt", { ascending: false });
  if (error) return res.status(500).json({ error: "Erro ao buscar recompensas." });
  res.json(data);
});

app.post("/api/pousadas/:id/recompensas", requirePartnerAccess("pousada"), async (req, res) => {
  const { id: pousadaId } = req.params;
  const coinCost = Number(req.body.coinCost);
  if (!req.body.title || !Number.isFinite(coinCost) || coinCost <= 0) {
    return res.status(400).json({ error: "Informe um título e um custo em Coins válido (maior que zero)." });
  }
  const newRecompensa: Recompensa = {
    ...pickFields<Recompensa>(req.body, RECOMPENSA_FIELDS),
    id: `rc_${randomUUID()}`,
    pousadaId,
    coinCost,
    active: true,
    createdAt: new Date().toISOString(),
  } as Recompensa;
  const { error } = await supabase.from("pousada_recompensas").insert(newRecompensa);
  if (error) return res.status(500).json({ error: "Erro ao criar recompensa." });
  await logAdminAction(res.locals.actorUser, "create", "recompensa", newRecompensa.id, `${newRecompensa.title} — ${coinCost} coins`);
  res.status(201).json(newRecompensa);
});

app.put("/api/pousadas/:id/recompensas/:recompensaId", requirePartnerAccess("pousada"), async (req, res) => {
  const updates = pickFields<Recompensa>(req.body, RECOMPENSA_FIELDS);
  const { data, error } = await supabase
    .from("pousada_recompensas")
    .update(updates)
    .eq("id", req.params.recompensaId)
    .eq("pousadaId", req.params.id)
    .select()
    .single();
  if (error || !data) return res.status(404).json({ error: "Recompensa não encontrada." });
  await logAdminAction(res.locals.actorUser, "update", "recompensa", data.id, data.title);
  res.json(data);
});

app.delete("/api/pousadas/:id/recompensas/:recompensaId", requirePartnerAccess("pousada"), async (req, res) => {
  const { error } = await supabase.from("pousada_recompensas").delete().eq("id", req.params.recompensaId).eq("pousadaId", req.params.id);
  if (error) return res.status(500).json({ error: "Erro ao excluir recompensa." });
  await logAdminAction(res.locals.actorUser, "delete", "recompensa", req.params.recompensaId, req.params.recompensaId);
  res.json({ success: true });
});

// A pousada confirma presencialmente digitando o código que o turista
// mostrou — assim que usado, o código não vale mais.
app.post("/api/pousadas/:id/resgates/:code/usar", requirePartnerAccess("pousada"), async (req, res) => {
  const { data: resgate } = await supabase
    .from("turista_resgates")
    .select("*")
    .eq("code", req.params.code.toUpperCase())
    .eq("pousadaId", req.params.id)
    .maybeSingle();
  if (!resgate) return res.status(404).json({ error: "Código não encontrado para esta pousada." });
  if (resgate.status !== "pendente") return res.status(400).json({ error: "Este código já foi usado ou cancelado." });

  const { data: updated, error } = await supabase
    .from("turista_resgates")
    .update({ status: "usado", usedAt: new Date().toISOString() })
    .eq("id", resgate.id)
    .select()
    .single();
  if (error) return res.status(500).json({ error: "Erro ao confirmar resgate." });
  await logAdminAction(res.locals.actorUser, "redeem", "resgate", resgate.id, `código ${resgate.code}`);
  res.json(updated);
});

app.get("/api/pousadas/:id/produtos", requirePartnerAccess("pousada"), async (req, res) => {
  const { data, error } = await supabase.from("produtos").select("*").eq("pousadaId", req.params.id).order("createdAt", { ascending: false });
  if (error) return res.status(500).json({ error: "Erro ao buscar produtos." });
  res.json(data);
});

app.post("/api/pousadas/:id/produtos", requirePartnerAccess("pousada"), async (req, res) => {
  const price = Number(req.body.price);
  if (!req.body.name || !Number.isFinite(price) || price <= 0) {
    return res.status(400).json({ error: "Informe um nome e um preço válido (maior que zero)." });
  }
  const newProduto = {
    ...pickFields<Produto>(req.body, PRODUTO_FIELDS),
    id: `pr_${randomUUID()}`,
    pousadaId: req.params.id,
    price,
    active: true,
    createdAt: new Date().toISOString(),
  };
  const { error } = await supabase.from("produtos").insert(newProduto);
  if (error) return res.status(500).json({ error: "Erro ao criar produto." });
  await logAdminAction(res.locals.actorUser, "create", "produto", newProduto.id, `${newProduto.name} — R$${price}`);
  res.status(201).json(newProduto);
});

app.put("/api/pousadas/:id/produtos/:produtoId", requirePartnerAccess("pousada"), async (req, res) => {
  const updates = pickFields<Produto>(req.body, PRODUTO_FIELDS);
  const { data, error } = await supabase.from("produtos").update(updates).eq("id", req.params.produtoId).eq("pousadaId", req.params.id).select().single();
  if (error || !data) return res.status(404).json({ error: "Produto não encontrado." });
  res.json(data);
});

app.delete("/api/pousadas/:id/produtos/:produtoId", requirePartnerAccess("pousada"), async (req, res) => {
  const { error } = await supabase.from("produtos").delete().eq("id", req.params.produtoId).eq("pousadaId", req.params.id);
  if (error) return res.status(500).json({ error: "Erro ao excluir produto." });
  res.json({ success: true });
});

// QR code de um produto — encodifica só o id (curto, sem informação
// sensível) direto num PNG em data URL. Não precisa de coluna nem tabela
// própria: o mesmo id do produto sempre gera o mesmo QR.
app.get("/api/produtos/:id/qrcode", requirePartnerAccess("pousada"), async (req, res) => {
  try {
    const dataUrl = await QRCode.toDataURL(req.params.id, { width: 240, margin: 1 });
    res.json({ qrcode: dataUrl });
  } catch (err) {
    log.error("Erro ao gerar QR code do produto:", err);
    res.status(500).json({ error: "Erro ao gerar QR code." });
  }
});

// Reservas ainda não encerradas desta pousada — pra escolher de quem é o
// consumo ao escanear um produto (cobre quem já está hospedado e quem
// ainda vai chegar, não só o dia exato do check-in).
app.get("/api/pousadas/:id/hospedes-ativos", requirePartnerAccess("pousada"), async (req, res) => {
  const today = new Date().toISOString().slice(0, 10);
  const { data, error } = await supabase
    .from("bookings")
    .select("id,customerName,customerEmail,checkIn,checkOut,status")
    .eq("pousadaId", req.params.id)
    .in("status", ["confirmado_total", "confirmado_pousada", "confirmado_guia", "pago"])
    .gte("checkOut", today)
    .order("checkIn", { ascending: true });
  if (error) return res.status(500).json({ error: "Erro ao buscar hóspedes ativos." });
  res.json(data);
});

app.get("/api/pousadas/:id/bookings/:bookingId/consumos", requirePartnerAccess("pousada"), async (req, res) => {
  const { data: booking } = await supabase.from("bookings").select("id,pousadaId").eq("id", req.params.bookingId).maybeSingle();
  if (!booking || booking.pousadaId !== req.params.id) return res.status(404).json({ error: "Reserva não encontrada nesta pousada." });
  const { data, error } = await supabase.from("consumos").select("*").eq("bookingId", req.params.bookingId).order("createdAt", { ascending: false });
  if (error) return res.status(500).json({ error: "Erro ao buscar consumo." });
  res.json(data);
});

app.post("/api/pousadas/:id/bookings/:bookingId/consumos", requirePartnerAccess("pousada"), async (req, res) => {
  const { data: booking } = await supabase.from("bookings").select("id,pousadaId").eq("id", req.params.bookingId).maybeSingle();
  if (!booking || booking.pousadaId !== req.params.id) return res.status(404).json({ error: "Reserva não encontrada nesta pousada." });

  const quantity = Math.max(1, Number(req.body.quantity) || 1);
  const { data: produto } = await supabase.from("produtos").select("*").eq("id", req.body.produtoId).eq("pousadaId", req.params.id).maybeSingle();
  if (!produto || !produto.active) return res.status(404).json({ error: "Produto não encontrado ou inativo." });

  const totalPrice = produto.price * quantity;
  const newConsumo = {
    id: `cs_${randomUUID()}`,
    bookingId: req.params.bookingId,
    pousadaId: req.params.id,
    produtoId: produto.id,
    produtoName: produto.name,
    quantity,
    unitPrice: produto.price,
    totalPrice,
    status: "pendente",
    createdAt: new Date().toISOString(),
  };
  const { error } = await supabase.from("consumos").insert(newConsumo);
  if (error) return res.status(500).json({ error: "Erro ao registrar consumo." });
  await logAdminAction(res.locals.actorUser, "create", "consumo", newConsumo.id, `${quantity}x ${produto.name} — reserva #${req.params.bookingId}`);
  res.status(201).json(newConsumo);
});

app.delete("/api/pousadas/:id/bookings/:bookingId/consumos/:consumoId", requirePartnerAccess("pousada"), async (req, res) => {
  const { error } = await supabase.from("consumos").delete().eq("id", req.params.consumoId).eq("pousadaId", req.params.id).eq("status", "pendente");
  if (error) return res.status(500).json({ error: "Erro ao remover consumo." });
  res.json({ success: true });
});

// Marca todo o consumo pendente da reserva como pago sem passar pelo
// Stripe — mesmo espírito do "Marcar como Paga" já usado em reservas, pra
// fechamentos na recepção em dinheiro/Pix.
app.post("/api/pousadas/:id/bookings/:bookingId/consumos/marcar-pago", requirePartnerAccess("pousada"), async (req, res) => {
  const { data: booking } = await supabase.from("bookings").select("id,pousadaId").eq("id", req.params.bookingId).maybeSingle();
  if (!booking || booking.pousadaId !== req.params.id) return res.status(404).json({ error: "Reserva não encontrada nesta pousada." });
  const { data, error } = await supabase
    .from("consumos")
    .update({ status: "pago" })
    .eq("bookingId", req.params.bookingId)
    .eq("status", "pendente")
    .select();
  if (error) return res.status(500).json({ error: "Erro ao marcar consumo como pago." });
  await logAdminAction(res.locals.actorUser, "update", "consumo", req.params.bookingId, `${(data || []).length} lançamento(s) marcados como pagos`);
  res.json({ success: true, updated: (data || []).length });
});

// Gera um link de pagamento Stripe pro consumo pendente da reserva —
// mesmo padrão de checkout já usado pra reserva, só que como uma cobrança
// separada (não altera o valor nem o status da reserva em si).
app.post("/api/pousadas/:id/bookings/:bookingId/consumos/cobrar", requirePartnerAccess("pousada"), async (req, res) => {
  if (!stripe) return res.status(503).json({ error: "Stripe não configurado. Use 'Marcar como Pago' pra fechamentos fora do Stripe." });
  const { data: booking } = await supabase.from("bookings").select("*").eq("id", req.params.bookingId).maybeSingle();
  if (!booking || booking.pousadaId !== req.params.id) return res.status(404).json({ error: "Reserva não encontrada nesta pousada." });

  const { data: pendentes } = await supabase.from("consumos").select("*").eq("bookingId", req.params.bookingId).eq("status", "pendente");
  if (!pendentes || pendentes.length === 0) return res.status(400).json({ error: "Não há consumo pendente pra cobrar." });

  const total = pendentes.reduce((sum: number, c: any) => sum + c.totalPrice, 0);
  const protocol = (req.headers["x-forwarded-proto"] as string) || req.protocol;
  const origin = `${protocol}://${req.get("host")}`;

  try {
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      line_items: [{
        price_data: {
          currency: "brl",
          product_data: { name: `Consumo — ${booking.pousadaName} (${pendentes.length} ${pendentes.length === 1 ? "item" : "itens"})` },
          unit_amount: Math.round(total * 100),
        },
        quantity: 1,
      }],
      customer_email: booking.customerEmail || undefined,
      metadata: { consumoBookingId: booking.id, consumoIds: pendentes.map((c: any) => c.id).join(",") },
      success_url: `${origin}/pagamento-confirmado?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/?payment=cancelled`,
    });
    res.json({ url: session.url });
  } catch (err: any) {
    log.error("Erro ao criar sessão de checkout de consumo:", err.message);
    res.status(500).json({ error: "Erro ao criar sessão de pagamento." });
  }
});

app.get("/api/partners/:type/:id/access", requireAdmin, async (req, res) => {
  if (!supabaseAdminAuth) return res.status(503).json({ error: "SUPABASE_SERVICE_ROLE_KEY não configurada — gestão de acesso de parceiros indisponível." });
  const partnerType = req.params.type as PartnerType;
  if (!PARTNER_TABLE_BY_TYPE[partnerType]) return res.status(400).json({ error: "Tipo de parceiro inválido." });
  const { id } = req.params;

  const { data, error } = await supabaseAdminAuth.auth.admin.listUsers({ perPage: 200 });
  if (error || !data?.users) return res.status(500).json({ error: "Erro ao listar acessos." });
  const linked = data.users
    .filter((u: any) => u.app_metadata?.role === "partner" && u.app_metadata?.partnerType === partnerType && u.app_metadata?.partnerId === id)
    .map((u: any) => ({ id: u.id, email: u.email, createdAt: u.created_at, lastSignInAt: u.last_sign_in_at || null }));
  res.json(linked);
});

app.post("/api/partners/invite", requireAdmin, async (req, res) => {
  if (!supabaseAdminAuth) return res.status(503).json({ error: "SUPABASE_SERVICE_ROLE_KEY não configurada — convite de parceiro indisponível." });
  const email = String(req.body.email || "").trim().toLowerCase();
  const partnerType = req.body.partnerType as PartnerType;
  const partnerId = String(req.body.partnerId || "");

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: "Informe um email válido." });
  }
  const table = PARTNER_TABLE_BY_TYPE[partnerType];
  if (!table || !partnerId) {
    return res.status(400).json({ error: "Informe o tipo e o id do parceiro." });
  }

  // Confirm the target record actually exists before linking an account to
  // it — otherwise a typo'd id would silently create dead-end access.
  const { data: target } = await supabase.from(table).select("id").eq("id", partnerId).maybeSingle();
  if (!target) return res.status(404).json({ error: "Parceiro não encontrado." });

  const result = await provisionPartnerLogin(email, { role: "partner", partnerType, partnerId });
  if (result.error) return res.status(400).json({ error: result.error });

  await logAdminAction(res.locals.adminUser, "invite_partner", "partner_access", partnerId, `${email} — ${partnerType}`);

  res.status(201).json({
    user: { id: result.userId, email },
    actionLink: result.actionLink,
    emailSent: result.emailSent,
    // Sem link de ação porque a conta já existia e só ganhou uma propriedade
    // extra (ver provisionPartnerLogin) — não precisa definir senha de novo,
    // já consegue entrar e ver isso em "Minhas Pousadas".
    linkedExisting: !result.actionLink && !result.error,
  });
});

app.delete("/api/partners/access/:userId", requireAdmin, async (req, res) => {
  if (!supabaseAdminAuth) return res.status(503).json({ error: "SUPABASE_SERVICE_ROLE_KEY não configurada — gestão de acesso de parceiros indisponível." });
  // Remove só o papel de parceiro (role/partnerType/partnerId) — preserva
  // qualquer isAdmin/isChief que essa mesma conta também tenha, em vez de
  // substituir o app_metadata inteiro (o que apagaria acesso de admin junto).
  const { data: existing, error: fetchErr } = await supabaseAdminAuth.auth.admin.getUserById(req.params.userId);
  if (fetchErr || !existing?.user) return res.status(404).json({ error: "Usuário não encontrado." });
  const remainingMetadata: Record<string, unknown> = { ...(existing.user.app_metadata || {}) };
  delete remainingMetadata.role;
  delete remainingMetadata.partnerType;
  delete remainingMetadata.partnerId;
  const { error } = await supabaseAdminAuth.auth.admin.updateUserById(req.params.userId, { app_metadata: remainingMetadata });
  if (error) return res.status(500).json({ error: "Erro ao revogar acesso." });
  await logAdminAction(res.locals.adminUser, "revoke_partner_access", "partner_access", req.params.userId, existing.user.email || req.params.userId);
  res.json({ success: true });
});

// Lets a logged-in partner fetch their own record without needing to know
// their own id up front — the dashboard just calls this and renders
// whichever of pousada/atracao/guia comes back.
// Aceita ?partnerType=&partnerId= opcionais pra dono de mais de uma
// propriedade escolher qual está editando ("Minhas Pousadas" no portal) —
// sem os dois, cai na propriedade "principal" salva em app_metadata (mesmo
// comportamento de sempre, pra quem só tem uma).
app.get("/api/my-partner-profile", authLimiter, async (req, res) => {
  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token) return res.status(401).json({ error: "Autenticação necessária." });

  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) return res.status(401).json({ error: "Token inválido." });
  if (data.user.app_metadata?.role !== "partner") {
    return res.status(403).json({ error: "Esta conta não tem um perfil de parceiro vinculado." });
  }

  const requestedType = req.query.partnerType as PartnerType | undefined;
  const requestedId = req.query.partnerId ? String(req.query.partnerId) : undefined;

  let partnerType: PartnerType | undefined;
  let partnerId: string | undefined;
  if (requestedType && requestedId) {
    const isPrimary = data.user.app_metadata?.partnerType === requestedType && data.user.app_metadata?.partnerId === requestedId;
    const { data: link } = isPrimary
      ? { data: null }
      : await supabase.from("partner_links").select("id").eq("userId", data.user.id).eq("partnerType", requestedType).eq("partnerId", requestedId).maybeSingle();
    if (!isPrimary && !link) return res.status(403).json({ error: "Esta conta não tem acesso a essa propriedade." });
    partnerType = requestedType;
    partnerId = requestedId;
  } else {
    partnerType = data.user.app_metadata?.partnerType as PartnerType | undefined;
    partnerId = data.user.app_metadata?.partnerId as string | undefined;
  }
  if (!partnerType || !partnerId) {
    return res.status(403).json({ error: "Esta conta não tem um perfil de parceiro vinculado." });
  }

  const table = PARTNER_TABLE_BY_TYPE[partnerType];
  const { data: row, error: rowErr } = await supabase.from(table).select("*").eq("id", partnerId).maybeSingle();
  if (rowErr || !row) return res.status(404).json({ error: "Perfil de parceiro não encontrado." });

  const mapped =
    partnerType === "pousada" ? mapPousadaRow(row) :
    partnerType === "atracao" ? mapAtracaoRow(row) :
    mapGuideRow(row);

  res.json({
    partnerType,
    partnerId,
    [partnerType === "pousada" ? "pousada" : partnerType === "atracao" ? "atracao" : "guia"]: mapped,
  });
});

// Lista TODAS as propriedades que esse login de parceiro pode gerenciar —
// a "principal" (app_metadata) mais qualquer extra em partner_links (dono de
// mais de uma pousada). Alimenta a aba "Minhas Pousadas" no portal.
app.get("/api/my-partner-properties", authLimiter, async (req, res) => {
  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token) return res.status(401).json({ error: "Autenticação necessária." });

  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) return res.status(401).json({ error: "Token inválido." });
  if (data.user.app_metadata?.role !== "partner") return res.status(403).json({ error: "Esta conta não tem acesso de parceiro." });

  const links = new Map<string, { partnerType: PartnerType; partnerId: string }>();
  const primaryType = data.user.app_metadata?.partnerType as PartnerType | undefined;
  const primaryId = data.user.app_metadata?.partnerId as string | undefined;
  if (primaryType && primaryId) links.set(`${primaryType}:${primaryId}`, { partnerType: primaryType, partnerId: primaryId });

  const { data: extraLinks } = await supabase.from("partner_links").select('"partnerType", "partnerId"').eq("userId", data.user.id);
  for (const l of (extraLinks || []) as any[]) {
    links.set(`${l.partnerType}:${l.partnerId}`, { partnerType: l.partnerType, partnerId: l.partnerId });
  }

  const idsByType: Record<PartnerType, string[]> = { pousada: [], atracao: [], guia: [] };
  for (const l of links.values()) idsByType[l.partnerType].push(l.partnerId);

  const [pousadaRows, atracaoRows, guideRows] = await Promise.all([
    idsByType.pousada.length ? supabase.from("pousadas").select("id,name").in("id", idsByType.pousada) : Promise.resolve({ data: [] as any[] }),
    idsByType.atracao.length ? supabase.from("atracoes").select("id,name").in("id", idsByType.atracao) : Promise.resolve({ data: [] as any[] }),
    idsByType.guia.length ? supabase.from("guides").select("id,name").in("id", idsByType.guia) : Promise.resolve({ data: [] as any[] }),
  ]);
  const nameById = new Map<string, string>();
  for (const r of (pousadaRows.data || []) as any[]) nameById.set(`pousada:${r.id}`, resolveTranslation(r.name));
  for (const r of (atracaoRows.data || []) as any[]) nameById.set(`atracao:${r.id}`, resolveTranslation(r.name));
  for (const r of (guideRows.data || []) as any[]) nameById.set(`guia:${r.id}`, r.name);

  // Sem o filtro, uma pousada removida (ainda apontada pelo app_metadata
  // "principal") continuaria aparecendo como "(sem nome)" na lista.
  const properties = Array.from(links.values())
    .filter(l => nameById.has(`${l.partnerType}:${l.partnerId}`))
    .map(l => ({
      partnerType: l.partnerType,
      partnerId: l.partnerId,
      name: nameById.get(`${l.partnerType}:${l.partnerId}`)!,
    }));

  res.json({ properties });
});

// Gestor de pousada cadastra uma pousada nova direto do próprio perfil — já
// fica vinculada ao login dele (partner_links). Nasce sem o selo
// "verificada", que continua sendo só do admin.
app.post("/api/my-pousadas", authLimiter, async (req, res) => {
  const user = await getPartnerUserFromRequest(req);
  if (!user) return res.status(401).json({ error: "Autenticação necessária." });
  if (user.app_metadata?.role !== "partner" || user.app_metadata?.partnerType !== "pousada") {
    return res.status(403).json({ error: "Só gestores de pousada podem cadastrar pousadas." });
  }
  const name = String(req.body.name || "").trim();
  const location = String(req.body.location || "").trim();
  if (!name || !location) return res.status(400).json({ error: "Informe o nome e a localização da pousada." });

  const newPousada = {
    id: `p_${randomUUID()}`,
    name,
    location,
    description: String(req.body.description || "").trim(),
    pricePerNight: 0,
    capacity: 1,
    images: [],
    features: [],
    activities: [],
    experiences: [],
    verified: false,
    viewCount: 0,
  };
  const { error } = await supabase.from("pousadas").insert(newPousada);
  if (error) {
    log.error("Erro ao criar pousada pelo gestor:", error.message);
    return res.status(500).json({ error: "Erro ao criar a pousada. Tente novamente ou fale com o suporte.", requestId: res.getHeader("X-Request-Id") });
  }
  const { error: linkErr } = await supabase.from("partner_links").upsert(
    { id: `pl_${user.id}_pousada_${newPousada.id}`, userId: user.id, partnerType: "pousada", partnerId: newPousada.id },
    { onConflict: "userId,partnerType,partnerId" }
  );
  if (linkErr) {
    await supabase.from("pousadas").delete().eq("id", newPousada.id);
    return res.status(500).json({ error: `Pousada não criada: falha ao vincular ao seu login (${linkErr.message}). A tabela partner_links existe? (scripts/add-partner-links.sql)` });
  }
  await logAdminAction(user, "create", "pousada", newPousada.id, name);
  res.status(201).json({ partnerType: "pousada", partnerId: newPousada.id, name });
});

// Gestores de uma pousada = quem tem ela como propriedade "principal"
// (app_metadata) + quem tem vínculo extra em partner_links.
app.get("/api/pousadas/:id/gestores", requirePartnerAccess("pousada"), async (req, res) => {
  if (!supabaseAdminAuth) return res.status(503).json({ error: "SUPABASE_SERVICE_ROLE_KEY não configurada." });
  const { id } = req.params;
  const { data: links } = await supabase.from("partner_links").select('"userId"').eq("partnerType", "pousada").eq("partnerId", id);
  const linkedIds = new Set(((links || []) as any[]).map(l => l.userId));
  const { data: usersData, error } = await supabaseAdminAuth.auth.admin.listUsers({ perPage: 1000 });
  if (error) return res.status(500).json({ error: describeAuthError(error, "Erro ao listar gestores.") });
  const gestores = (usersData?.users || [])
    .filter((u: any) => {
      const meta = u.app_metadata || {};
      const isPrimary = meta.role === "partner" && meta.partnerType === "pousada" && meta.partnerId === id;
      return isPrimary || (meta.role === "partner" && linkedIds.has(u.id));
    })
    .map((u: any) => ({
      userId: u.id,
      email: u.email,
      name: u.user_metadata?.name || "",
      isPrimary: u.app_metadata?.partnerId === id,
      isMe: u.id === res.locals.actorUser?.id,
    }));
  res.json({ gestores });
});

app.post("/api/pousadas/:id/gestores", requirePartnerAccess("pousada"), async (req, res) => {
  if (!supabaseAdminAuth) return res.status(503).json({ error: "SUPABASE_SERVICE_ROLE_KEY não configurada — não dá pra criar acesso agora." });
  const email = String(req.body.email || "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: "Email inválido." });
  const { id } = req.params;
  const result = await provisionPartnerLogin(email, { role: "partner", partnerType: "pousada", partnerId: id });
  if (result.error || !result.userId) return res.status(400).json({ error: result.error || "Não foi possível adicionar o gestor." });
  await logAdminAction(res.locals.actorUser, "update", "pousada", id, `gestor adicionado: ${email}`);
  // O link de definição de senha nunca volta pra quem convidou — se o email
  // já fosse de outra pessoa, isso permitiria tomar a conta dela.
  res.json({ success: true, emailSent: result.emailSent });
});

app.delete("/api/pousadas/:id/gestores/:userId", requirePartnerAccess("pousada"), async (req, res) => {
  if (!supabaseAdminAuth) return res.status(503).json({ error: "SUPABASE_SERVICE_ROLE_KEY não configurada." });
  const { id, userId } = req.params;

  const [{ data: usersData }, { data: links }] = await Promise.all([
    supabaseAdminAuth.auth.admin.listUsers({ perPage: 1000 }),
    supabase.from("partner_links").select('"userId"').eq("partnerType", "pousada").eq("partnerId", id),
  ]);
  const linkedIds = new Set(((links || []) as any[]).map(l => l.userId));
  const users = (usersData?.users || []) as any[];
  const gestorIds = users
    .filter(u => u.app_metadata?.role === "partner" && ((u.app_metadata?.partnerType === "pousada" && u.app_metadata?.partnerId === id) || linkedIds.has(u.id)))
    .map(u => u.id);
  if (!gestorIds.includes(userId)) return res.status(404).json({ error: "Esse usuário não é gestor desta pousada." });
  if (gestorIds.length <= 1) return res.status(400).json({ error: "Esse é o único gestor da pousada — adicione outro antes de remover." });

  await supabase.from("partner_links").delete().eq("userId", userId).eq("partnerType", "pousada").eq("partnerId", id);

  // Se esta era a propriedade "principal" (app_metadata), promove outra
  // propriedade vinculada a principal; sem nenhuma, a conta perde o acesso
  // de parceiro (não sobra nada pra gerenciar).
  const target = users.find(u => u.id === userId);
  const meta = target?.app_metadata || {};
  if (meta.partnerType === "pousada" && meta.partnerId === id) {
    const { data: rest } = await supabase.from("partner_links").select('id, "partnerType", "partnerId"').eq("userId", userId).limit(1);
    const next = (rest || [])[0] as any;
    const newMeta = next ? { ...meta, partnerType: next.partnerType, partnerId: next.partnerId } : { ...meta, role: null, partnerType: null, partnerId: null };
    const { error: metaErr } = await supabaseAdminAuth.auth.admin.updateUserById(userId, { app_metadata: newMeta });
    if (metaErr) return res.status(500).json({ error: describeAuthError(metaErr, "Erro ao atualizar o acesso do gestor.") });
    if (next) await supabase.from("partner_links").delete().eq("id", next.id);
  }

  await logAdminAction(res.locals.actorUser, "update", "pousada", id, `gestor removido: ${target?.email || userId}`);
  res.json({ success: true });
});

app.get("/api/pousadas/:id/vendas", requirePartnerAccess("pousada"), async (req, res) => {
  const date = ISO_DATE.test(String(req.query.date || "")) ? String(req.query.date) : new Date(Date.now() - 3 * 3600000).toISOString().slice(0, 10);
  const start = `${date}T00:00:00-03:00`;
  const end = `${shiftDays(date, 1)}T00:00:00-03:00`;
  const { data, error } = await supabase
    .from("vendas")
    .select("*")
    .eq("pousadaId", req.params.id)
    .gte("createdAt", start)
    .lt("createdAt", end)
    .order("createdAt", { ascending: false });
  if (error) {
    if (error.code === "PGRST205" || error.code === "42P01") return res.status(503).json({ error: "O Caixa precisa da migração SQL scripts/migracao-2026-10-melhorias.sql rodada no Supabase." });
    return res.status(500).json({ error: "Erro ao buscar vendas." });
  }
  const vendas = (data || []).map((v: any) => ({ ...v, items: parseJSONSafe(v.items) || [] }));
  const totals: Record<string, number> = {};
  for (const v of vendas) totals[v.paymentMethod] = (totals[v.paymentMethod] || 0) + Number(v.total);
  res.json({ date, vendas, totals, total: vendas.reduce((sum: number, v: any) => sum + Number(v.total), 0) });
});

// Venda do balcão: os preços vêm sempre do catálogo de produtos da pousada.
// destino "conta_hospede" lança como consumo da reserva (paga no
// check-out); "pagamento" registra uma venda já paga no meio escolhido.
app.post("/api/pousadas/:id/vendas", requirePartnerAccess("pousada"), async (req, res) => {
  const pousadaId = req.params.id;
  const rawItems = Array.isArray(req.body.items) ? req.body.items.slice(0, 50) : [];
  const wanted = rawItems
    .map((i: any) => ({ produtoId: clip(i?.produtoId, 100), quantity: Math.trunc(Number(i?.quantity)) }))
    .filter((i: any) => i.produtoId && i.quantity >= 1 && i.quantity <= 999);
  if (wanted.length === 0) return res.status(400).json({ error: "Adicione pelo menos um produto." });

  const { data: produtos } = await supabase.from("produtos").select("*").eq("pousadaId", pousadaId).eq("active", true).in("id", wanted.map((i: any) => i.produtoId));
  const byId = new Map(((produtos || []) as any[]).map(p => [p.id, p]));
  if (wanted.some((i: any) => !byId.has(i.produtoId))) return res.status(400).json({ error: "Algum produto não existe mais ou está inativo — atualize a tela." });
  const items = wanted.map((i: any) => {
    const p = byId.get(i.produtoId);
    return { produtoId: p.id, name: p.name, quantity: i.quantity, unitPrice: Number(p.price), totalPrice: Number(p.price) * i.quantity };
  });
  const total = items.reduce((sum: number, i: any) => sum + i.totalPrice, 0);

  if (req.body.destino === "conta_hospede") {
    const bookingId = clip(req.body.bookingId, 100);
    const { data: booking } = await supabase.from("bookings").select("id, pousadaId, status, customerName").eq("id", bookingId).maybeSingle();
    if (!booking || booking.pousadaId !== pousadaId || !ACTIVE_BOOKING_STATUSES.includes(booking.status)) {
      return res.status(400).json({ error: "Escolha um hóspede com reserva ativa nesta pousada." });
    }
    const now = new Date().toISOString();
    const rows = items.map((i: any) => ({
      id: `cs_${randomUUID()}`, bookingId, pousadaId, produtoId: i.produtoId, produtoName: i.name,
      quantity: i.quantity, unitPrice: i.unitPrice, totalPrice: i.totalPrice, status: "pendente", createdAt: now,
    }));
    const { error } = await supabase.from("consumos").insert(rows);
    if (error) return res.status(500).json({ error: "Erro ao lançar na conta do hóspede." });
    await logAdminAction(res.locals.actorUser, "create", "consumo", bookingId, `Caixa: R$ ${total.toFixed(2)} na conta de ${booking.customerName}`);
    return res.status(201).json({ destino: "conta_hospede", total, customerName: booking.customerName });
  }

  const paymentMethod = String(req.body.paymentMethod || "");
  if (!(PAYMENT_METHODS as readonly string[]).includes(paymentMethod)) return res.status(400).json({ error: "Escolha a forma de pagamento." });
  const venda = {
    id: `vd_${randomUUID()}`,
    pousadaId,
    items: JSON.stringify(items),
    total,
    paymentMethod,
    customerName: clip(req.body.customerName, 120) || null,
    notes: clip(req.body.notes, 300) || null,
    createdBy: res.locals.actorUser?.email || null,
    createdAt: new Date().toISOString(),
  };
  const { error } = await supabase.from("vendas").insert(venda);
  if (error) {
    if (error.code === "PGRST205" || error.code === "42P01") return res.status(503).json({ error: "O Caixa precisa da migração SQL scripts/migracao-2026-10-melhorias.sql rodada no Supabase." });
    log.error("Erro ao registrar venda:", error.message);
    return res.status(500).json({ error: "Erro ao registrar a venda." });
  }
  await logAdminAction(res.locals.actorUser, "create", "venda", venda.id, `Caixa: R$ ${total.toFixed(2)} (${paymentMethod})`);
  res.status(201).json({ ...venda, items });
});

// Cadastro público de colaborador (camareira, cozinheira, piloteiro,
// cantor, fotógrafo...). A conta nasce sem acesso a nada: só vira
// "aprovado" quando um gestor da pousada escolhida aprovar.
app.post("/api/colaboradores/signup", publicFormLimiter, async (req, res) => {
  if (!supabaseAdminAuth) return res.status(503).json({ error: "Cadastro indisponível no momento." });
  if (!(await verifyRecaptcha(req.body.recaptchaToken))) return res.status(400).json({ error: "Não foi possível validar o envio. Recarregue a página e tente de novo." });

  const name = clip(req.body.name, 120);
  const email = clip(req.body.email, 200).toLowerCase();
  const phone = clip(req.body.phone, 40);
  const password = String(req.body.password || "");
  const age = Math.trunc(Number(req.body.age));
  const bio = clip(req.body.bio, 1500);
  const pousadaId = clip(req.body.pousadaId, 100);
  const services = toCleanList(req.body.services, COLAB_SERVICES_MAX, 60);
  const languages = toCleanList(req.body.languages, 15, 40);
  const specialties = toCleanList(req.body.specialties, 15, 60);

  if (!name || !phone || !pousadaId || services.length === 0) return res.status(400).json({ error: "Preencha nome, telefone, pousada e pelo menos um serviço." });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: "Informe um email válido." });
  if (!Number.isInteger(age) || age < 16 || age > 100) return res.status(400).json({ error: "Informe uma idade válida." });
  if (password.length < 8 || isWeakPassword(password)) return res.status(400).json({ error: "Use uma senha com pelo menos 8 caracteres, misturando letras e números." });
  if (password !== String(req.body.confirmPassword || "")) return res.status(400).json({ error: "As senhas não coincidem." });

  const { data: pousada } = await supabase.from("pousadas").select("id, name").eq("id", pousadaId).maybeSingle();
  if (!pousada) return res.status(400).json({ error: "Pousada não encontrada." });

  const { data: created, error: createErr } = await supabaseAdminAuth.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    app_metadata: { role: "colaborador", colaboradorStatus: "pendente", pousadaId },
    user_metadata: { name },
  });
  if (createErr || !created.user) {
    return res.status(400).json({ error: "Não foi possível concluir o cadastro com esse email. Se você já tem conta, use outro email ou fale com a equipe." });
  }

  const row = {
    id: `col_${randomUUID()}`, userId: created.user.id, pousadaId, name, email, phone, age,
    services: JSON.stringify(services), languages: JSON.stringify(languages), specialties: JSON.stringify(specialties),
    bio, status: "pendente", createdAt: new Date().toISOString(),
  };
  const { error: insertErr } = await supabase.from("colaboradores").insert(row);
  if (insertErr) {
    await supabaseAdminAuth.auth.admin.deleteUser(created.user.id).catch(() => {});
    log.error("Erro ao salvar colaborador:", insertErr.message);
    const pending = insertErr.code === "PGRST205" || insertErr.code === "42P01";
    return res.status(pending ? 503 : 500).json({ error: pending ? "Cadastro de colaboradores ainda não está ativo. Tente novamente mais tarde." : "Erro ao salvar seu cadastro." });
  }

  for (const gestorEmail of await getPousadaGestorEmails(pousadaId)) {
    await sendEmail({
      to: gestorEmail,
      subject: `Novo colaborador aguardando aprovação — ${pousada.name}`,
      html: `
        <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
          <h2 style="color: #101B4C;">Novo cadastro de colaborador</h2>
          <p><strong>${escapeHtml(name)}</strong> (${escapeHtml(services.join(", "))}) quer trabalhar com a <strong>${escapeHtml(pousada.name)}</strong>.</p>
          <p><a href="${SITE_URL}/parceiro" style="display:inline-block; background:#101B4C; color:#fff; padding:10px 20px; text-decoration:none; border-radius:4px;">Analisar no portal</a></p>
        </div>
      `,
    });
  }
  res.status(201).json({ success: true });
});

app.get("/api/pousadas/:id/colaboradores", requirePartnerAccess("pousada"), async (req, res) => {
  const { data, error } = await supabase.from("colaboradores").select("*").eq("pousadaId", req.params.id).order("createdAt", { ascending: false });
  if (error) {
    if (error.code === "PGRST205" || error.code === "42P01") return res.status(503).json({ error: "Colaboradores precisa da migração SQL scripts/migracao-2026-10-melhorias.sql rodada no Supabase." });
    return res.status(500).json({ error: "Erro ao buscar colaboradores." });
  }
  res.json((data || []).map(mapColaborador));
});

app.post("/api/pousadas/:id/colaboradores/:colabId/decisao", requirePartnerAccess("pousada"), async (req, res) => {
  const decision = req.body.decision;
  if (decision !== "aprovado" && decision !== "reprovado") return res.status(400).json({ error: "Decisão inválida." });
  const note = clip(req.body.note, 500);
  const { data: colab } = await supabase.from("colaboradores").select("*").eq("id", req.params.colabId).eq("pousadaId", req.params.id).maybeSingle();
  if (!colab) return res.status(404).json({ error: "Colaborador não encontrado nesta pousada." });

  const { error } = await supabase.from("colaboradores").update({
    status: decision, decisionNote: note || null, decidedBy: res.locals.actorUser?.email || null, decidedAt: new Date().toISOString(),
  }).eq("id", colab.id);
  if (error) return res.status(500).json({ error: "Erro ao registrar a decisão." });

  if (supabaseAdminAuth) {
    const { data: authUser } = await supabaseAdminAuth.auth.admin.getUserById(colab.userId);
    await supabaseAdminAuth.auth.admin.updateUserById(colab.userId, {
      app_metadata: { ...(authUser?.user?.app_metadata || {}), role: "colaborador", colaboradorStatus: decision, pousadaId: colab.pousadaId },
    });
  }

  const { data: pousada } = await supabase.from("pousadas").select("name").eq("id", colab.pousadaId).maybeSingle();
  const pousadaName = pousada?.name || "a pousada";
  const approved = decision === "aprovado";
  const message = approved
    ? `Olá, ${colab.name}! Seu cadastro como colaborador(a) da ${pousadaName} foi APROVADO. Acesse com seu email e senha: ${SITE_URL}/parceiro`
    : `Olá, ${colab.name}. Seu cadastro como colaborador(a) da ${pousadaName} não foi aprovado desta vez.${note ? ` Motivo: ${note}` : ""}`;
  const mail = await sendEmail({
    to: colab.email,
    subject: approved ? `Cadastro aprovado — ${pousadaName}` : `Sobre seu cadastro — ${pousadaName}`,
    html: `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
        <h2 style="color: #101B4C;">${approved ? "Cadastro aprovado! 🌿" : "Sobre seu cadastro"}</h2>
        <p>${escapeHtml(message.replace(` Acesse com seu email e senha: ${SITE_URL}/parceiro`, ""))}</p>
        ${approved ? `<p><a href="${SITE_URL}/parceiro" style="display:inline-block; background:#101B4C; color:#fff; padding:10px 20px; text-decoration:none; border-radius:4px;">Entrar no sistema</a></p>` : ""}
      </div>
    `,
  });
  await logAdminAction(res.locals.actorUser, "update", "colaborador", colab.id, `${colab.name}: ${decision}`);

  // Sem API oficial de WhatsApp configurada, devolve o link pronto para o
  // gestor enviar a mesma mensagem com um clique.
  const digits = String(colab.phone || "").replace(/\D/g, "");
  const whatsappLink = digits ? `https://wa.me/${digits.length <= 11 ? `55${digits}` : digits}?text=${encodeURIComponent(message)}` : null;
  res.json({ success: true, emailSent: mail.ok, whatsappLink });
});

app.get("/api/colaborador/me", authLimiter, async (req, res) => {
  const user = await getPartnerUserFromRequest(req);
  if (!user || user.app_metadata?.role !== "colaborador") return res.status(403).json({ error: "Esta conta não é de colaborador." });
  const { data } = await supabase.from("colaboradores").select("*").eq("userId", user.id).maybeSingle();
  if (!data) return res.status(404).json({ error: "Cadastro de colaborador não encontrado." });
  const { data: pousada } = await supabase.from("pousadas").select("name").eq("id", data.pousadaId).maybeSingle();
  res.json({ ...mapColaborador(data), pousadaName: pousada?.name || "" });
});
}
