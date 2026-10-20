// Vendas: pacotes combinados, cupons, ocupação pública e resultados do parceiro.
import type { Express } from "express";
import { Booking } from "../../src/types.js";
import { randomUUID } from "crypto";
import {
  ORIGEM_LABEL,
  cupomLimiter,
  loadPacote,
  log,
  logAdminAction,
  mapPacoteRow,
  mapPousadaRow,
  ocupacaoMensal,
  requireAdmin,
  requirePartnerAccess,
  sanitizeCupom,
  sanitizePacote,
  supabase,
  toPacotePublico,
  validarCupom,
} from "../core.js";

export function registerVendasRoutes(app: Express) {

// Público e sem PII: só a fração ocupada por mês nos próximos 12 meses.
app.get("/api/pousadas/:id/ocupacao", async (req, res) => {
  const { data: row } = await supabase.from("pousadas").select("*").eq("id", req.params.id).maybeSingle();
  if (!row) return res.status(404).json({ error: "Pousada não encontrada" });
  const meses = await ocupacaoMensal(mapPousadaRow(row), new Date(), 12);
  res.setHeader("Cache-Control", "public, max-age=600");
  res.json(meses.map(m => ({ month: m.month, occupancy: m.occupancy })));
});

// Ocupação, receita e origem das reservas da própria pousada: últimos 12
// meses + 3 à frente (reservas já feitas). Receita = reservas pagas ou
// confirmadas, pelo mês do check-in.
app.get("/api/pousadas/:id/resultados", requirePartnerAccess("pousada"), async (req, res) => {
  const { data: row } = await supabase.from("pousadas").select("*").eq("id", req.params.id).maybeSingle();
  if (!row) return res.status(404).json({ error: "Pousada não encontrada" });
  const pousada = mapPousadaRow(row);

  const now = new Date();
  const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 11, 1));
  const meses = await ocupacaoMensal(pousada, from, 15);

  const fromISO = from.toISOString().slice(0, 10);
  const { data: all, error } = await supabase.from("bookings").select("*").eq("pousadaId", pousada.id).gte("checkIn", fromISO);
  if (error) return res.status(500).json({ error: "Erro ao calcular resultados." });
  const bookings = (all || []) as (Booking & { origem?: string | null; pacoteId?: string | null })[];
  const todayISO = now.toISOString().slice(0, 10);
  const passadas = bookings.filter(b => b.checkIn <= todayISO);
  const validas = passadas.filter(b => b.status !== "cancelado");
  const pagas = validas.filter(b => b.status !== "pendente_pagamento");
  const noites = validas.map(b => Math.max(1, Math.round((Date.parse(b.checkOut) - Date.parse(b.checkIn)) / 86400000)));

  const contar = (keys: string[]) => {
    const map = new Map<string, number>();
    for (const k of keys) map.set(k, (map.get(k) || 0) + 1);
    return [...map.entries()].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count);
  };

  // Pesquisa "como você chegou até nós?" do site todo — agregada, sem PII.
  const { data: refs } = await supabase.from("referral_sources").select("source");

  res.json({
    meses,
    totais: {
      receita12m: pagas.reduce((acc, b) => acc + (Number(b.totalPrice) || 0), 0),
      reservas12m: validas.length,
      ticketMedio: pagas.length ? Math.round(pagas.reduce((acc, b) => acc + (Number(b.totalPrice) || 0), 0) / pagas.length) : 0,
      estadiaMedia: noites.length ? Math.round((noites.reduce((a, b) => a + b, 0) / noites.length) * 10) / 10 : 0,
      taxaCancelamento: passadas.length ? Math.round(((passadas.length - validas.length) / passadas.length) * 100) : 0,
      reservasFuturas: bookings.filter(b => b.checkIn > todayISO && b.status !== "cancelado").length,
    },
    origem: contar(validas.map(ORIGEM_LABEL)),
    nacionalidade: contar(validas.map(b => (b.nationality || "Não informada").trim() || "Não informada")).slice(0, 6),
    canaisDoSite: contar((refs || []).map(r => String(r.source || "outro"))).slice(0, 8),
  });
});

app.get("/api/pacotes", async (req, res) => {
  const { data, error } = await supabase.from("pacotes").select("*").eq("active", true).order("createdAt", { ascending: false });
  // Tabela ainda não criada (migração pendente): vitrine vazia, sem erro.
  if (error) return res.json([]);
  res.setHeader("Cache-Control", "public, max-age=120");
  res.json(await toPacotePublico((data || []).map(mapPacoteRow)));
});

app.get("/api/pacotes/:id", async (req, res) => {
  const pacote = await loadPacote(req.params.id);
  if (!pacote || !pacote.active) return res.status(404).json({ error: "Pacote não encontrado." });
  const [publico] = await toPacotePublico([pacote]);
  if (!publico) return res.status(404).json({ error: "Pacote não encontrado." });
  res.json(publico);
});

app.get("/api/admin/pacotes", requireAdmin, async (req, res) => {
  const { data, error } = await supabase.from("pacotes").select("*").order("createdAt", { ascending: false });
  if (error) return res.status(500).json({ error: "Tabela de pacotes não encontrada — rode scripts/add-pacotes-cupons-mapa.sql." });
  res.json((data || []).map(mapPacoteRow));
});

app.post("/api/admin/pacotes", requireAdmin, async (req, res) => {
  const parsed = sanitizePacote(req.body);
  if ("error" in parsed) return res.status(400).json({ error: parsed.error });
  const pacote = { ...parsed.value, id: `pk_${randomUUID()}`, createdAt: new Date().toISOString() };
  const { error } = await supabase.from("pacotes").insert(pacote);
  if (error) {
    log.error("[POST /api/admin/pacotes]", error.message);
    return res.status(500).json({ error: "Erro ao salvar o pacote.", requestId: res.getHeader("X-Request-Id") });
  }
  await logAdminAction(res.locals.adminUser, "create", "pacote", pacote.id, pacote.name);
  res.status(201).json(pacote);
});

app.put("/api/admin/pacotes/:id", requireAdmin, async (req, res) => {
  const parsed = sanitizePacote(req.body);
  if ("error" in parsed) return res.status(400).json({ error: parsed.error });
  const { data, error } = await supabase.from("pacotes").update(parsed.value).eq("id", req.params.id).select().maybeSingle();
  if (error) {
    log.error("[PUT /api/admin/pacotes/:id]", error.message);
    return res.status(500).json({ error: "Erro ao salvar o pacote.", requestId: res.getHeader("X-Request-Id") });
  }
  if (!data) return res.status(404).json({ error: "Pacote não encontrado." });
  await logAdminAction(res.locals.adminUser, "update", "pacote", req.params.id, parsed.value.name);
  res.json(mapPacoteRow(data));
});

app.delete("/api/admin/pacotes/:id", requireAdmin, async (req, res) => {
  const { error } = await supabase.from("pacotes").delete().eq("id", req.params.id);
  if (error) return res.status(500).json({ error: "Erro ao excluir o pacote." });
  await logAdminAction(res.locals.adminUser, "delete", "pacote", req.params.id, req.params.id);
  res.json({ success: true });
});

// Prévia do desconto na tela de reserva. Responde só o necessário — nunca
// a lista de cupons nem detalhes de uso.
app.post("/api/cupons/validar", cupomLimiter, async (req, res) => {
  const pousadaId = String(req.body.pousadaId ?? "").slice(0, 100);
  const total = Number(req.body.total);
  if (!pousadaId || !Number.isFinite(total) || total <= 0) return res.status(400).json({ error: "Dados inválidos." });
  const result = await validarCupom(req.body.code, pousadaId, total);
  if ("error" in result) return res.status(400).json({ error: result.error });
  res.json({ code: result.cupom.code, discount: result.discount, description: result.cupom.description });
});

app.get("/api/admin/cupons", requireAdmin, async (req, res) => {
  const { data, error } = await supabase.from("cupons").select("*").order("createdAt", { ascending: false });
  if (error) return res.status(500).json({ error: "Tabela de cupons não encontrada — rode scripts/add-pacotes-cupons-mapa.sql." });
  res.json(data || []);
});

app.post("/api/admin/cupons", requireAdmin, async (req, res) => {
  const parsed = sanitizeCupom(req.body);
  if ("error" in parsed) return res.status(400).json({ error: parsed.error });
  const cupom = { ...parsed.value, id: `cp_${randomUUID()}`, usedCount: 0, createdAt: new Date().toISOString() };
  const { error } = await supabase.from("cupons").insert(cupom);
  if (error) {
    if (error.code === "23505") return res.status(409).json({ error: "Já existe um cupom com esse código." });
    log.error("[POST /api/admin/cupons]", error.message);
    return res.status(500).json({ error: "Erro ao salvar o cupom.", requestId: res.getHeader("X-Request-Id") });
  }
  await logAdminAction(res.locals.adminUser, "create", "cupom", cupom.id, cupom.code!);
  res.status(201).json(cupom);
});

app.put("/api/admin/cupons/:id", requireAdmin, async (req, res) => {
  const parsed = sanitizeCupom(req.body);
  if ("error" in parsed) return res.status(400).json({ error: parsed.error });
  const { data, error } = await supabase.from("cupons").update(parsed.value).eq("id", req.params.id).select().maybeSingle();
  if (error) {
    if (error.code === "23505") return res.status(409).json({ error: "Já existe um cupom com esse código." });
    log.error("[PUT /api/admin/cupons/:id]", error.message);
    return res.status(500).json({ error: "Erro ao salvar o cupom.", requestId: res.getHeader("X-Request-Id") });
  }
  if (!data) return res.status(404).json({ error: "Cupom não encontrado." });
  await logAdminAction(res.locals.adminUser, "update", "cupom", req.params.id, parsed.value.code!);
  res.json(data);
});

app.delete("/api/admin/cupons/:id", requireAdmin, async (req, res) => {
  const { error } = await supabase.from("cupons").delete().eq("id", req.params.id);
  if (error) return res.status(500).json({ error: "Erro ao excluir o cupom." });
  await logAdminAction(res.locals.adminUser, "delete", "cupom", req.params.id, req.params.id);
  res.json({ success: true });
});
}
