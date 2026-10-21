// Catálogo público: pousadas, guias, atrações, espécies, avistamentos, avaliações, upload e páginas com SEO.
import type { Express } from "express";
import { randomUUID } from "crypto";
import { Pousada, Guide, Atracao, Sighting, Review, Species } from "../../src/types.js";
import { slugify, resolveSlug } from "../../src/lib/slug.js";
import { normalizeHost, isValidCustomDomain } from "../../src/lib/customDomain.js";
import { isGoogleMapsUrl, cleanGoogleMapsUrl } from "../../src/lib/mapsLinks.js";
import { normalizePrecosPorMes } from "../../src/lib/pricing.js";
import path from "path";
import fs from "fs";
import {
  addNotification,
  ATRACAO_FIELDS,
  detectImageType,
  distPath,
  GUIDE_FIELDS,
  injectPousadaMeta,
  isProd,
  log,
  logAdminAction,
  mapAtracaoRow,
  mapGuideRow,
  mapPousadaRow,
  moderateImage,
  moderateText,
  moverParaLixeira,
  optimizeUploadedImage,
  pickFields,
  POUSADA_CREATE_FIELDS,
  POUSADA_UPDATE_FIELDS,
  publicFormLimiter,
  requireAdmin,
  requireAnyUploader,
  requirePartnerAccess,
  requireTourist,
  sanitizeIlikeTerm,
  SITE_URL,
  SPECIES_FIELDS,
  supabase,
  toPublicGuide,
  upload,
  viewLimiter,
  viteDevServer,
  writeSkippingMissingColumns,
} from "../core.js";

// Reserva concluída (paga/confirmada, check-out no passado) do turista nesta
// pousada — pelo id do turista ou pelo e-mail da conta.
async function findCompletedStay(user: { id: string; email?: string }, pousadaId: string): Promise<string | undefined> {
  const today = new Date().toISOString().slice(0, 10);
  const statuses = ["pago", "confirmado_pousada", "confirmado_guia", "confirmado_total"];
  const or = [`turistaId.eq.${user.id}`, user.email ? `customerEmail.eq.${user.email}` : null].filter(Boolean).join(",");
  const { data } = await supabase.from("bookings").select("id").eq("pousadaId", pousadaId).in("status", statuses).lte("checkOut", today).or(or).limit(1);
  return data?.[0]?.id;
}

export function registerCatalogoRoutes(app: Express) {

// Pousadas que o turista logado já pode avaliar (estadia concluída) — para o
// formulário de avaliação só oferecer essas.
app.get("/api/turista/pousadas-avaliaveis", requireTourist, async (req, res) => {
  const user = res.locals.touristUser as { id: string; email?: string };
  const today = new Date().toISOString().slice(0, 10);
  const or = [`turistaId.eq.${user.id}`, user.email ? `customerEmail.eq.${user.email}` : null].filter(Boolean).join(",");
  const { data, error } = await supabase.from("bookings").select("pousadaId").in("status", ["pago", "confirmado_pousada", "confirmado_guia", "confirmado_total"]).lte("checkOut", today).or(or);
  if (error) return res.status(500).json({ error: "Erro ao buscar suas estadias." });
  res.json([...new Set((data || []).map(b => b.pousadaId))]);
});

// Domínio próprio de pousada → site oficial. O front chama isso só quando o
// hostname não é da plataforma (ver src/lib/customDomain.ts). mainUrl é o
// endereço do EcoSafari, para onde vão reserva, cadastro e pagamento.
app.get("/api/sites/by-host", async (req, res) => {
  const host = normalizeHost(String(req.query.host || ""));
  if (!host) return res.status(400).json({ error: "Informe o host." });
  const { data, error } = await supabase.from("pousadas").select("id, name, customDomain").ilike("customDomain", host).maybeSingle();
  if (error || !data) return res.status(404).json({ error: "Domínio não vinculado a nenhuma pousada." });
  res.setHeader("Cache-Control", "public, max-age=300");
  res.json({ pousadaId: data.id, slug: slugify(data.name), mainUrl: SITE_URL });
});

// ----------------------------------------------------
// REST API ROUTES
// ----------------------------------------------------

// POUSADAS CRUD
//
// Sem ?page=: devolve o array completo, como sempre — usado pelo fluxo
// central de dados do App.tsx (deep-link /pousadas/:id, "onde avistar esta
// espécie", MobileSimulator), que precisa da lista inteira pra funcionar.
// Com ?page=: devolve uma página filtrada/ordenada NO SERVIDOR
// ({items, total, page, pageSize}) — usada pela grade de busca do catálogo
// (PousadaCatalog.tsx), que antes carregava o catálogo inteiro pro navegador
// e filtrava em JS ali, algo que deixa de escalar conforme o catálogo cresce
// (é exatamente o oposto de como Booking/Airbnb fazem busca).
//
// Busca/filtro cobrem name, location e faixa de preço — ficaram de fora
// comodidades/atividades (features/activities), porque essas colunas
// passaram por uma migração pra jsonb (scripts/upgrade-schema.sql) cujo
// estado real em produção não dá pra confirmar só lendo o código; um filtro
// .ilike() nelas quebraria a rota inteira com 500 se o tipo não for texto.
// Mesmo raciocínio pra não excluir pousada sem nenhuma imagem do "perfil
// completo" aqui — os outros campos (descrição/localização/preço/
// capacidade) já cobrem o caso real que isCompletePousadaProfile existe pra
// evitar (cadastro vazio recém-criado).
app.get("/api/pousadas", async (req, res) => {
  res.setHeader("Cache-Control", "public, max-age=30, stale-while-revalidate=300");

  if (!req.query.page) {
    const { data, error } = await supabase.from("pousadas").select("*");
    if (error) return res.status(500).json({ error: "Erro ao buscar pousadas" });
    return res.json((data || []).map(mapPousadaRow));
  }

  const page = Math.max(1, parseInt(String(req.query.page), 10) || 1);
  const pageSize = Math.min(48, Math.max(1, parseInt(String(req.query.pageSize), 10) || 12));
  const location = typeof req.query.location === "string" ? req.query.location : "all";
  const search = typeof req.query.search === "string" ? sanitizeIlikeTerm(req.query.search) : "";
  const priceMin = req.query.priceMin ? Number(req.query.priceMin) : undefined;
  const priceMax = req.query.priceMax ? Number(req.query.priceMax) : undefined;
  const sortBy = typeof req.query.sortBy === "string" ? req.query.sortBy : "relevance";

  let query = supabase
    .from("pousadas")
    .select("*", { count: "exact" })
    .not("description", "is", null).neq("description", "")
    .not("location", "is", null).neq("location", "")
    .gt("pricePerNight", 0)
    .gt("capacity", 0);

  if (location !== "all") {
    query = query.ilike("location", `%${sanitizeIlikeTerm(location)}%`);
  }
  if (search) {
    query = query.or(`name.ilike.%${search}%,location.ilike.%${search}%`);
  }
  if (typeof priceMin === "number" && !Number.isNaN(priceMin)) query = query.gte("pricePerNight", priceMin);
  if (typeof priceMax === "number" && !Number.isNaN(priceMax)) query = query.lte("pricePerNight", priceMax);

  if (sortBy === "price-asc") query = query.order("pricePerNight", { ascending: true });
  else if (sortBy === "price-desc") query = query.order("pricePerNight", { ascending: false });
  else if (sortBy === "rating-desc") query = query.order("rating", { ascending: false });
  // Tiebreaker sempre presente — sem uma ordem determinística, .range() em
  // páginas sucessivas pode repetir ou pular linhas se o Postgres escolher
  // uma ordem física diferente entre uma requisição e outra.
  query = query.order("id", { ascending: true });

  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  const { data, error, count } = await query.range(from, to);
  if (error) return res.status(500).json({ error: "Erro ao buscar pousadas" });

  res.json({
    items: (data || []).map(mapPousadaRow),
    total: count || 0,
    page,
    pageSize,
  });
});

app.get("/api/pousadas/:id", async (req, res) => {
  const { data, error } = await supabase.from("pousadas").select("*").eq("id", req.params.id).maybeSingle();
  if (error || !data) return res.status(404).json({ error: "Pousada não encontrada" });
  res.json(mapPousadaRow(data));
});

app.post("/api/pousadas/:id/view", viewLimiter, async (req, res) => {
  const { id } = req.params;
  const { data: current, error: fetchErr } = await supabase.from("pousadas").select("viewCount").eq("id", id).maybeSingle();
  if (fetchErr || !current) return res.status(404).json({ error: "Pousada não encontrada" });

  const viewCount = (current.viewCount || 0) + 1;
  const { error } = await supabase.from("pousadas").update({ viewCount }).eq("id", id);
  if (error) {
    log.warn("Erro ao atualizar contador de visualizações no Supabase:", error.message);
    return res.status(500).json({ error: "Erro ao atualizar visualizações" });
  }
  res.json({ viewCount });
});

app.post("/api/upload-image", requireAnyUploader, (req, res) => {
  upload.single("file")(req, res, async (err: any) => {
    if (err) return res.status(400).json({ error: err.message });
    if (!req.file) return res.status(400).json({ error: "Nenhum arquivo enviado" });

    const detected = detectImageType(req.file.buffer);
    if (!detected) {
      return res.status(400).json({ error: "O conteúdo do arquivo não corresponde a uma imagem PNG, JPEG, WebP ou GIF válida." });
    }

    const moderation = await moderateImage(req.file.buffer, detected.contentType);
    if (!moderation.ok) {
      return res.status(400).json({ error: moderation.reason });
    }

    const optimized = await optimizeUploadedImage(req.file.buffer, detected);
    const objectPath = `uploads/${randomUUID()}.${optimized.ext}`;

    const { error } = await supabase.storage
      .from("site-media")
      .upload(objectPath, optimized.buffer, { contentType: optimized.contentType, upsert: false, cacheControl: "31536000" });

    if (error) {
      log.error("Erro ao subir imagem para o Supabase Storage:", error.message);
      return res.status(500).json({ error: "Falha ao enviar imagem" });
    }

    const { data } = supabase.storage.from("site-media").getPublicUrl(objectPath);
    res.status(201).json({ url: data.publicUrl });
  });
});

// images/features/activities/experiences are jsonb columns — pass the
// native arrays straight through, supabase-js serializes them correctly as
// nested JSON. Stringifying them here would double-encode into a jsonb
// string scalar instead of a jsonb array.
app.post("/api/pousadas", requireAdmin, async (req, res) => {
  const newPousada: Pousada = {
    ...pickFields<Pousada>(req.body, POUSADA_CREATE_FIELDS),
    id: `p_${randomUUID()}`,
    verified: false,
    viewCount: 0,
  } as Pousada;
  const { error } = await supabase.from("pousadas").insert(newPousada);
  if (error) {
    log.error("Erro ao salvar pousada no Supabase:", error.message);
    return res.status(500).json({ error: "Erro ao salvar pousada" });
  }
  await logAdminAction(res.locals.adminUser, "create", "pousada", newPousada.id, newPousada.name);
  res.status(201).json(newPousada);
});

// Admin OR the pousada's own linked partner account can edit it — "verified"
// stays admin-only (POUSADA_CREATE_FIELDS excludes it; only the admin branch
// upgrades to POUSADA_UPDATE_FIELDS), since that's a trust badge the partner
// shouldn't be able to self-certify.
app.put("/api/pousadas/:id", requirePartnerAccess("pousada"), async (req, res) => {
  const { id } = req.params;
  const updates = pickFields<Pousada>(req.body, res.locals.isAdmin ? POUSADA_UPDATE_FIELDS : POUSADA_CREATE_FIELDS);
  // Domínio próprio (só admin): grava normalizado, sem http/www; vazio limpa.
  if (typeof updates.customDomain === "string") {
    const host = normalizeHost(updates.customDomain);
    if (host && !isValidCustomDomain(host)) return res.status(400).json({ error: "Domínio inválido. Use só o endereço, ex.: pousadavagalume.com" });
    updates.customDomain = host;
  }
  if ("precosPorMes" in updates) updates.precosPorMes = normalizePrecosPorMes(updates.precosPorMes);
  // Ficha do Google Maps: só endereço do próprio Google, sem parâmetros de
  // rastreio; vazio limpa.
  if (typeof updates.googleMapsUrl === "string") {
    const raw = updates.googleMapsUrl.trim();
    if (raw && !isGoogleMapsUrl(raw)) return res.status(400).json({ error: "Link do Google Maps inválido. No Google Maps, abra a pousada → Compartilhar → Copiar link." });
    updates.googleMapsUrl = raw ? cleanGoogleMapsUrl(raw) : null as any;
  }
  for (const f of ["commissionPct", "conservationPct"] as const) {
    if (f in updates) {
      const v = (updates as any)[f];
      (updates as any)[f] = v === "" || v === null || v === undefined || !Number.isFinite(Number(v)) ? null : Number(v);
    }
  }
  if ("plano" in updates && updates.plano !== "basico" && updates.plano !== "gestao") delete updates.plano;
  // Vínculo com o app: UUID ou vazio (desvincula).
  if (typeof updates.appLodgeId === "string") {
    const id = updates.appLodgeId.trim().toLowerCase();
    if (id && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(id)) return res.status(400).json({ error: "Vínculo com o app inválido." });
    updates.appLodgeId = id || null as any;
  }
  const { data, error, skipped } = await writeSkippingMissingColumns(updates, row => supabase.from("pousadas").update(row).eq("id", id).select().single());
  if (error && error.code !== "PGRST116") {
    log.error("[PUT /api/pousadas/:id]", error.message);
    return res.status(500).json({ error: "Erro ao salvar a pousada. Tente novamente ou fale com o suporte.", requestId: res.getHeader("X-Request-Id") });
  }
  if (!data) return res.status(404).json({ error: "Pousada não encontrada" });
  await logAdminAction(res.locals.actorUser, "update", "pousada", id, data.name);
  res.json({ ...mapPousadaRow(data), skippedFields: skipped });
});

// O próprio gestor também pode remover a pousada pelo perfil — vai pra
// lixeira (restaurável pelo admin por 30 dias), nunca apagada de vez.
app.delete("/api/pousadas/:id", requirePartnerAccess("pousada"), async (req, res) => {
  const { id } = req.params;
  let existing: any;
  try {
    existing = await moverParaLixeira("pousada", id, res.locals.actorUser?.email || "admin");
  } catch (err: any) {
    log.error("Erro ao mover pousada para a lixeira:", err.message);
    return res.status(500).json({ error: "Erro ao excluir pousada" });
  }
  if (!existing) return res.status(404).json({ error: "Pousada não encontrada" });
  const { error } = await supabase.from("pousadas").delete().eq("id", id);
  if (error) {
    log.error("Erro ao excluir pousada no Supabase:", error.message);
    return res.status(500).json({ error: "Erro ao excluir pousada" });
  }
  await supabase.from("partner_links").delete().eq("partnerType", "pousada").eq("partnerId", id);
  await logAdminAction(res.locals.actorUser, "delete", "pousada", id, existing?.name || id);
  res.json({ success: true, message: "Pousada movida para a lixeira. Pode ser restaurada em até 30 dias." });
});

app.get("/api/guides", requireAdmin, async (req, res) => {
  const { data, error } = await supabase.from("guides").select("*");
  if (error) return res.status(500).json({ error: "Erro ao buscar guias" });
  res.json((data || []).map(mapGuideRow));
});

// Public guide directory + individual profile — PII-free. Registered before
// the admin-only routes above only for readability; Express doesn't need
// the ordering since none of these paths overlap (GET /api/guides vs.
// GET /api/guides/public[/:id]).
app.get("/api/guides/public", async (req, res) => {
  res.setHeader("Cache-Control", "public, max-age=30, stale-while-revalidate=300");
  const { data, error } = await supabase.from("guides").select("*");
  if (error) return res.status(500).json({ error: "Erro ao buscar guias" });
  res.json((data || []).map(mapGuideRow).map(toPublicGuide));
});

app.get("/api/guides/public/:id", async (req, res) => {
  const { data, error } = await supabase.from("guides").select("*").eq("id", req.params.id).maybeSingle();
  if (error || !data) return res.status(404).json({ error: "Guia não encontrado" });
  res.json(toPublicGuide(mapGuideRow(data)));
});

// languages/specialty are jsonb columns — passed straight through, no
// JSON.stringify (see the pousadas insert route further down for why).
app.post("/api/guides", requireAdmin, async (req, res) => {
  const newGuide: Guide = {
    ...pickFields<Guide>(req.body, GUIDE_FIELDS),
    id: `g_${randomUUID()}`,
  } as Guide;
  const { error } = await supabase.from("guides").insert(newGuide);
  if (error) {
    log.error("Erro ao salvar guia no Supabase:", error.message);
    return res.status(500).json({ error: "Erro ao salvar guia" });
  }
  await logAdminAction(res.locals.adminUser, "create", "guide", newGuide.id, newGuide.name);
  res.status(201).json(newGuide);
});

app.put("/api/guides/:id", requirePartnerAccess("guia"), async (req, res) => {
  const { id } = req.params;
  const updates = pickFields<Guide>(req.body, GUIDE_FIELDS);
  const { data, error } = await supabase.from("guides").update(updates).eq("id", id).select().single();
  if (error || !data) return res.status(404).json({ error: "Guia não encontrado" });
  await logAdminAction(res.locals.actorUser, "update", "guide", id, data.name);
  res.json(mapGuideRow(data));
});

app.delete("/api/guides/:id", requireAdmin, async (req, res) => {
  const { id } = req.params;
  let existing: any;
  try {
    existing = await moverParaLixeira("guide", id, res.locals.adminUser?.email || "admin");
  } catch (err: any) {
    log.error("Erro ao mover guia para a lixeira:", err.message);
    return res.status(500).json({ error: "Erro ao excluir guia" });
  }
  if (!existing) return res.status(404).json({ error: "Guia não encontrado" });
  const { error } = await supabase.from("guides").delete().eq("id", id);
  if (error) return res.status(500).json({ error: "Erro ao excluir guia" });
  await logAdminAction(res.locals.adminUser, "delete", "guide", id, existing?.name || id);
  res.json({ success: true, message: "Guia movido para a lixeira. Pode ser restaurado em até 30 dias." });
});

app.get("/api/atracoes", async (req, res) => {
  res.setHeader("Cache-Control", "public, max-age=30, stale-while-revalidate=300");
  const { data, error } = await supabase.from("atracoes").select("*");
  if (error) return res.status(500).json({ error: "Erro ao buscar atrações" });
  res.json((data || []).map(mapAtracaoRow));
});

app.get("/api/atracoes/:id", async (req, res) => {
  const { data, error } = await supabase.from("atracoes").select("*").eq("id", req.params.id).maybeSingle();
  if (error || !data) return res.status(404).json({ error: "Atração não encontrada" });
  res.json(mapAtracaoRow(data));
});

app.post("/api/atracoes", requireAdmin, async (req, res) => {
  const newAtracao: Atracao = {
    ...pickFields<Atracao>(req.body, ATRACAO_FIELDS),
    id: `at_${randomUUID()}`,
    rating: 0,
    verified: false,
    dateCreated: new Date().toISOString(),
  } as Atracao;
  const { error } = await writeSkippingMissingColumns(newAtracao, row => supabase.from("atracoes").insert(row));
  if (error) {
    log.error("Erro ao salvar atração no Supabase:", error.message);
    return res.status(500).json({ error: "Erro ao salvar atração" });
  }
  await logAdminAction(res.locals.adminUser, "create", "atracao", newAtracao.id, newAtracao.name);
  res.status(201).json(newAtracao);
});

// Admin OR the atração's own linked partner account — "verified" is
// admin-only, same reasoning as pousadas above.
app.put("/api/atracoes/:id", requirePartnerAccess("atracao"), async (req, res) => {
  const { id } = req.params;
  const fields = res.locals.isAdmin ? [...ATRACAO_FIELDS, "verified"] as const : ATRACAO_FIELDS;
  const updates = pickFields<Atracao>(req.body, fields);
  const { data, error } = await writeSkippingMissingColumns(updates, row => supabase.from("atracoes").update(row).eq("id", id).select().single());
  if (error || !data) return res.status(404).json({ error: "Atração não encontrada" });
  await logAdminAction(res.locals.actorUser, "update", "atracao", id, data.name);
  res.json(mapAtracaoRow(data));
});

app.delete("/api/atracoes/:id", requireAdmin, async (req, res) => {
  const { id } = req.params;
  let existing: any;
  try {
    existing = await moverParaLixeira("atracao", id, res.locals.adminUser?.email || "admin");
  } catch (err: any) {
    log.error("Erro ao mover atração para a lixeira:", err.message);
    return res.status(500).json({ error: "Erro ao excluir atração" });
  }
  if (!existing) return res.status(404).json({ error: "Atração não encontrada" });
  const { error } = await supabase.from("atracoes").delete().eq("id", id);
  if (error) return res.status(500).json({ error: "Erro ao excluir atração" });
  await logAdminAction(res.locals.adminUser, "delete", "atracao", id, existing?.name || id);
  res.json({ success: true, message: "Atração movida para a lixeira. Pode ser restaurada em até 30 dias." });
});

// SIGHTINGS CRUD
app.get("/api/sightings", async (req, res) => {
  const { data, error } = await supabase.from("sightings").select("*");
  if (error) return res.status(500).json({ error: "Erro ao buscar avistamentos" });
  res.json(data);
});

app.post("/api/sightings", publicFormLimiter, async (req, res) => {
  const { pousadaId, userName, animalName, imageUrl, location } = req.body;
  let targetPousada: { id: string; name: string } | null = null;
  if (pousadaId) {
    const { data } = await supabase.from("pousadas").select("id,name").eq("id", pousadaId).maybeSingle();
    targetPousada = data;
  }
  if (!targetPousada) {
    const { data } = await supabase.from("pousadas").select("id,name").limit(1).maybeSingle();
    targetPousada = data;
  }

  const newSighting: Sighting = {
    id: `s_${randomUUID()}`,
    pousadaId: targetPousada ? targetPousada.id : (pousadaId || ""),
    pousadaName: targetPousada ? targetPousada.name : "",
    userName: userName || "Turista Anônimo",
    animalName,
    // Generic nature scene, not a specific species — a sighting can be of any
    // animal, so falling back to one species' photo (like the old jaguar
    // default) mislabels every other animal that gets posted without a photo.
    imageUrl: imageUrl || "/pousadas/vagalume-lago-deck.png",
    location: location || "Pantanal",
    timestamp: new Date().toISOString(),
    likes: 0,
    status: "aprovado",
  };

  const { error } = await supabase.from("sightings").insert(newSighting);
  if (error) {
    log.error("Erro ao salvar avistamento no Supabase:", error.message);
    return res.status(500).json({ error: "Erro ao salvar avistamento" });
  }

  addNotification("admin", `Novo avistamento de ${animalName} postado por ${newSighting.userName}!`, "sighting_new");
  res.status(201).json(newSighting);
});

app.post("/api/sightings/:id/like", publicFormLimiter, async (req, res) => {
  const { id } = req.params;
  const { data: current, error: fetchErr } = await supabase.from("sightings").select("likes").eq("id", id).single();
  if (fetchErr || !current) return res.status(404).json({ error: "Avistamento não encontrado" });

  const { data, error } = await supabase.from("sightings").update({ likes: current.likes + 1 }).eq("id", id).select().single();
  if (error || !data) {
    return res.status(500).json({ error: "Erro ao curtir avistamento" });
  }
  res.json(data);
});

// REVIEWS
// Público — só os campos exibidos na vitrine de avaliações. turistaId fica de
// fora de propósito: é o id interno (Supabase Auth) de quem avaliou, sem uso
// nenhum no front-end, e não deveria vazar numa rota sem autenticação.
app.get("/api/reviews", async (req, res) => {
  res.setHeader("Cache-Control", "public, max-age=15, stale-while-revalidate=120");
  const { data, error } = await supabase
    .from("reviews")
    .select("id,pousadaId,atracaoId,guideId,userName,rating,comment,date,photoUrl");
  if (error) return res.status(500).json({ error: "Erro ao buscar avaliações" });
  res.json(data);
});

// A review targets exactly one of pousada/atração/guia — this table backs
// "avaliações" for all three partner kinds instead of a separate reviews
// table per kind. Whichever *Id is present in the body decides both which
// column gets set and which partner's average "rating" gets recalculated.
// Requires a tourist profile (requireTourist) — the display name and the
// review's ownership both come from that profile, never from the request
// body, so nobody can post under a made-up name or spoof somebody else's
// account.
app.post("/api/reviews", requireTourist, async (req, res) => {
  const { pousadaId, atracaoId, guideId } = req.body;
  const targetCount = [pousadaId, atracaoId, guideId].filter(Boolean).length;
  if (targetCount !== 1) {
    return res.status(400).json({ error: "Informe exatamente um de pousadaId, atracaoId ou guideId." });
  }
  const [column, table] = pousadaId ? ["pousadaId", "pousadas"] : atracaoId ? ["atracaoId", "atracoes"] : ["guideId", "guides"];
  const targetId = pousadaId || atracaoId || guideId;

  const touristId = (res.locals.touristUser as { id: string }).id;
  const { data: touristProfile } = await supabase.from("turistas").select("name").eq("id", touristId).maybeSingle();
  if (!touristProfile) {
    return res.status(403).json({ error: "Complete seu perfil de turista antes de avaliar." });
  }

  // One review per tourist per target — otherwise requiring a profile would
  // only add a login step in front of review-bombing, not actually stop it.
  const { data: existingReview } = await supabase.from("reviews").select("id").eq(column, targetId).eq("turistaId", touristId).maybeSingle();
  if (existingReview) {
    return res.status(400).json({ error: "Você já avaliou este item." });
  }

  // Pousada só é avaliada por quem se hospedou: precisa de uma reserva paga
  // ou confirmada, com check-out já passado, no e-mail da conta (casa também
  // reservas antigas feitas pela equipe). A avaliação ganha o selo e fica
  // ligada à reserva. Guias e atrações seguem abertos a quem tem perfil.
  let stayBookingId: string | undefined;
  if (pousadaId) {
    stayBookingId = await findCompletedStay(res.locals.touristUser, pousadaId);
    if (!stayBookingId) {
      return res.status(403).json({ error: "Só quem se hospedou nesta pousada pela EcoSafari pode avaliá-la. Você poderá avaliar depois do check-out." });
    }
  }

  const moderation = await moderateText(String(req.body.comment || ""));
  if (!moderation.ok) {
    return res.status(400).json({ error: moderation.reason });
  }

  const newReview: Review = {
    id: `r_${randomUUID()}`,
    pousadaId: pousadaId || undefined,
    atracaoId: atracaoId || undefined,
    guideId: guideId || undefined,
    userName: touristProfile.name,
    rating: req.body.rating || 5,
    comment: req.body.comment,
    date: new Date().toISOString().split("T")[0],
    photoUrl: req.body.photoUrl || undefined,
    turistaId: touristId,
    verifiedStay: !!stayBookingId,
    bookingId: stayBookingId,
  };

  const { error } = await writeSkippingMissingColumns(newReview, row => supabase.from("reviews").insert(row));
  if (error) {
    log.error("Erro ao salvar avaliação no Supabase:", error.message);
    return res.status(500).json({ error: "Erro ao salvar avaliação" });
  }

  // Recalculate the target's average rating from every review it has now
  const { data: targetReviews } = await supabase.from("reviews").select("rating").eq(column, targetId);
  if (targetReviews && targetReviews.length > 0) {
    const avg = Number((targetReviews.reduce((sum, r) => sum + r.rating, 0) / targetReviews.length).toFixed(1));
    const { error: ratingErr } = await supabase.from(table).update({ rating: avg }).eq("id", targetId);
    if (ratingErr) log.warn(`Erro ao atualizar nota (${table}) no Supabase:`, ratingErr.message);
  }

  res.status(201).json(newReview);
});

// SPECIES CRUD
app.get("/api/species", async (req, res) => {
  res.setHeader("Cache-Control", "public, max-age=60, stale-while-revalidate=600");
  const { data, error } = await supabase.from("species").select("*");
  if (error) return res.status(500).json({ error: "Erro ao buscar espécies" });
  res.json(data);
});

app.post("/api/species", requireAdmin, async (req, res) => {
  const newSpecie: Species = {
    ...pickFields<Species>(req.body, SPECIES_FIELDS),
    id: req.body.id || `s_${randomUUID()}`,
  } as Species;
  const { error } = await supabase.from("species").insert(newSpecie);
  if (error) {
    log.error("Erro ao salvar espécie no Supabase:", error.message);
    return res.status(500).json({ error: "Erro ao salvar espécie" });
  }
  await logAdminAction(res.locals.adminUser, "create", "species", newSpecie.id, (newSpecie as any).name || newSpecie.id);
  res.status(201).json(newSpecie);
});

app.put("/api/species/:id", requireAdmin, async (req, res) => {
  const { id } = req.params;
  const updates = pickFields<Species>(req.body, SPECIES_FIELDS);
  const { data, error } = await supabase.from("species").update(updates).eq("id", id).select().single();
  if (error || !data) return res.status(404).json({ error: "Espécie não encontrada" });
  await logAdminAction(res.locals.adminUser, "update", "species", id, (data as any).name || id);
  res.json(data);
});

app.delete("/api/species/:id", requireAdmin, async (req, res) => {
  const { id } = req.params;
  let existing: any;
  try {
    existing = await moverParaLixeira("species", id, res.locals.adminUser?.email || "admin");
  } catch (err: any) {
    log.error("Erro ao mover espécie para a lixeira:", err.message);
    return res.status(500).json({ error: "Erro ao excluir espécie" });
  }
  if (!existing) return res.status(404).json({ error: "Espécie não encontrada" });
  const { error } = await supabase.from("species").delete().eq("id", id);
  if (error) return res.status(500).json({ error: "Erro ao excluir espécie" });
  await logAdminAction(res.locals.adminUser, "delete", "species", id, existing?.name || id);
  res.json({ success: true, message: "Espécie movida para a lixeira. Pode ser restaurada em até 30 dias." });
});

app.get("/sitemap.xml", async (req, res) => {
  const staticPaths = ["/", "/sobre", "/faq", "/privacidade", "/termos", "/seja-parceiro"];
  const { data: pousadaRows } = await supabase.from("pousadas").select("id,name");
  const urls = [
    ...staticPaths.map(p => `${SITE_URL}${p}`),
    ...(pousadaRows || []).flatMap(p => [`${SITE_URL}/pousadas/${p.id}`, `${SITE_URL}/site/${slugify(p.name)}`]),
  ];
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls
    .map(u => `  <url><loc>${u}</loc></url>`)
    .join("\n")}\n</urlset>`;
  res.setHeader("Content-Type", "application/xml");
  res.send(xml);
});

// Registered at module scope (not inside startLocalServer) so these also run
// as a Vercel serverless function, where app.listen() never executes and the
// static/SPA-fallback branch below is handled by Vercel's CDN + vercel.json
// rewrites instead. Intercepts requests that match a real pousada id/slug —
// anything else (e.g. static files under /pousadas/*.png) falls through via
// next() to the static/Vite middleware (local) or Vercel's own static
// handling (production), which always takes priority over rewrites.
app.get('/pousadas/:id', async (req, res, next) => {
  try {
    const { data: pousadaRow } = await supabase.from("pousadas").select("*").eq("id", req.params.id).maybeSingle();
    if (!pousadaRow) return next();
    const pousada = mapPousadaRow(pousadaRow);
    const indexPath = isProd ? path.join(distPath, 'index.html') : path.join(process.cwd(), 'index.html');
    let html = fs.readFileSync(indexPath, 'utf-8');
    if (!isProd && viteDevServer) {
      html = await viteDevServer.transformIndexHtml(req.originalUrl, html);
    }
    html = injectPousadaMeta(html, pousada);
    res.setHeader("Content-Type", "text/html");
    res.send(html);
  } catch (err) {
    next(err);
  }
});

// Same meta injection for each pousada's own "official site" at /site/:slug
app.get('/site/:slug', async (req, res, next) => {
  try {
    const { data: allPousadas } = await supabase.from("pousadas").select("*");
    const pousadaRow = (allPousadas || []).find(p => slugify(p.name) === resolveSlug(req.params.slug));
    if (!pousadaRow) return next();
    const pousada = mapPousadaRow(pousadaRow);
    const indexPath = isProd ? path.join(distPath, 'index.html') : path.join(process.cwd(), 'index.html');
    let html = fs.readFileSync(indexPath, 'utf-8');
    if (!isProd && viteDevServer) {
      html = await viteDevServer.transformIndexHtml(req.originalUrl, html);
    }
    html = injectPousadaMeta(html, pousada);
    res.setHeader("Content-Type", "text/html");
    res.send(html);
  } catch (err) {
    next(err);
  }
});
}
