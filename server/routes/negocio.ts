// Modelo de negócio: afiliados (links de indicação), painel financeiro
// (comissão, repasse, mensalidades, serviços), pedido de plano Gestão,
// câmbio para turista estrangeiro e impacto de conservação.
import type { Express } from "express";
import { randomUUID } from "crypto";
import rateLimit from "express-rate-limit";
import type { Afiliado } from "../../src/types.js";
import {
  AGENCY_WHATSAPP,
  COMISSAO_PADRAO_PCT,
  CONSERVACAO_PADRAO_PCT,
  PLANO_GESTAO_VALOR,
  addNotification,
  commissionPctOf,
  log,
  logAdminAction,
  mapPousadaRow,
  requireAdmin,
  requirePartnerAccess,
  supabase,
} from "../core.js";

const PAID = ["pago", "confirmado_pousada", "confirmado_guia", "confirmado_total"];
const r2 = (n: number) => Math.round(n * 100) / 100;
const normCode = (v: unknown) => String(v ?? "").trim().toUpperCase().replace(/[^A-Z0-9_-]/g, "").slice(0, 40);

const clickLimiter = rateLimit({ windowMs: 60 * 60 * 1000, max: 30, standardHeaders: true, legacyHeaders: false });

// Câmbio BRL → USD/EUR (Banco Central Europeu via frankfurter.app), 12h de
// cache. Só para exibir valor aproximado; a cobrança é sempre em reais.
let cambio: { at: number; rates: { USD: number; EUR: number } } | null = null;

function sanitizeAfiliado(body: any): { ok: true; value: Partial<Afiliado> } | { ok: false; error: string } {
  const code = normCode(body.code);
  const name = String(body.name ?? "").trim().slice(0, 120);
  const pct = Number(body.commissionPct);
  if (code.length < 3) return { ok: false, error: "O código precisa ter ao menos 3 letras/números." };
  if (!name) return { ok: false, error: "Informe o nome do afiliado." };
  if (!Number.isFinite(pct) || pct < 0 || pct > 30) return { ok: false, error: "Comissão do afiliado entre 0 e 30%." };
  return {
    ok: true,
    value: {
      code, name,
      tipo: ["agencia", "influenciador", "outro"].includes(body.tipo) ? body.tipo : "influenciador",
      email: String(body.email ?? "").trim().slice(0, 200) || undefined,
      telefone: String(body.telefone ?? "").trim().slice(0, 40) || undefined,
      commissionPct: pct,
      active: body.active !== false,
    },
  };
}

export function registerNegocioRoutes(app: Express) {

// ---------------- Afiliados ----------------

// Público: conta o clique no link de indicação (?ref=CODIGO).
app.post("/api/afiliados/clique", clickLimiter, async (req, res) => {
  const code = normCode(req.body.code);
  if (code) await supabase.rpc("afiliado_registrar_clique", { p_code: code }).then(() => {}, () => {});
  res.json({ ok: true });
});

app.get("/api/admin/afiliados", requireAdmin, async (req, res) => {
  const { data, error } = await supabase.from("afiliados").select("*").order("createdAt", { ascending: false });
  if (error) return res.status(503).json({ error: "Tabela de afiliados não encontrada — rode scripts/add-receita-confianca-crescimento.sql." });
  const { data: bookings } = await supabase.from("bookings").select("afiliadoCode, totalPrice, afiliadoCommission, status").not("afiliadoCode", "is", null);
  res.json((data || []).map(a => {
    const own = (bookings || []).filter(b => b.afiliadoCode === a.code && b.status !== "cancelado");
    const pagas = own.filter(b => PAID.includes(b.status));
    return {
      ...a,
      reservas: own.length,
      reservasPagas: pagas.length,
      receita: r2(pagas.reduce((s, b) => s + (Number(b.totalPrice) || 0), 0)),
      comissaoDevida: r2(pagas.reduce((s, b) => s + (Number(b.afiliadoCommission) || 0), 0)),
    };
  }));
});

app.post("/api/admin/afiliados", requireAdmin, async (req, res) => {
  const parsed = sanitizeAfiliado(req.body);
  if ("error" in parsed) return res.status(400).json({ error: parsed.error });
  const row = { ...parsed.value, id: `af_${randomUUID()}`, cliques: 0, createdAt: new Date().toISOString() };
  const { error } = await supabase.from("afiliados").insert(row);
  if (error) {
    if (error.code === "23505") return res.status(409).json({ error: "Já existe um afiliado com esse código." });
    log.error("[POST afiliados]", error.message);
    return res.status(500).json({ error: "Erro ao salvar o afiliado." });
  }
  await logAdminAction(res.locals.adminUser, "create", "afiliado", row.id, row.code!);
  res.status(201).json(row);
});

app.put("/api/admin/afiliados/:id", requireAdmin, async (req, res) => {
  const parsed = sanitizeAfiliado(req.body);
  if ("error" in parsed) return res.status(400).json({ error: parsed.error });
  const { data, error } = await supabase.from("afiliados").update(parsed.value).eq("id", req.params.id).select().maybeSingle();
  if (error) return res.status(error.code === "23505" ? 409 : 500).json({ error: error.code === "23505" ? "Já existe um afiliado com esse código." : "Erro ao salvar o afiliado." });
  if (!data) return res.status(404).json({ error: "Afiliado não encontrado." });
  await logAdminAction(res.locals.adminUser, "update", "afiliado", req.params.id, parsed.value.code!);
  res.json(data);
});

app.delete("/api/admin/afiliados/:id", requireAdmin, async (req, res) => {
  const { error } = await supabase.from("afiliados").delete().eq("id", req.params.id);
  if (error) return res.status(500).json({ error: "Erro ao excluir o afiliado." });
  await logAdminAction(res.locals.adminUser, "delete", "afiliado", req.params.id, req.params.id);
  res.json({ success: true });
});

// ---------------- Financeiro (Gestão) ----------------

// Mês (pelo check-in) das reservas pagas: bruto, comissão EcoSafari,
// afiliados, conservação e repasse por pousada; mais mensalidades do plano
// Gestão e serviços (site/logo) entregues no mês. Reserva antiga sem
// snapshot usa a comissão atual da pousada.
app.get("/api/admin/financeiro", requireAdmin, async (req, res) => {
  const mes = /^\d{4}-\d{2}$/.test(String(req.query.mes)) ? String(req.query.mes) : new Date().toISOString().slice(0, 7);
  const [y, m] = mes.split("-").map(Number);
  const inicio = `${mes}-01`;
  const fim = new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10);

  const [{ data: bookings, error }, { data: pousadaRows }, { data: pedidos }] = await Promise.all([
    supabase.from("bookings").select("*").in("status", PAID).gte("checkIn", inicio).lt("checkIn", fim),
    supabase.from("pousadas").select("*"),
    supabase.from("pedidos_site").select("*").eq("status", "entregue").gte("updatedAt", inicio).lt("updatedAt", fim),
  ]);
  if (error) return res.status(500).json({ error: "Erro ao calcular o financeiro." });
  const pousadas = (pousadaRows || []).map(mapPousadaRow);
  const byId = new Map(pousadas.map(p => [p.id, p]));

  const linhas = new Map<string, { pousadaId: string; pousada: string; reservas: number; bruto: number; comissao: number; afiliados: number; conservacao: number; repasse: number }>();
  for (const b of bookings || []) {
    const p = byId.get(b.pousadaId);
    const total = Number(b.totalPrice) || 0;
    const comissao = b.commissionAmount != null ? Number(b.commissionAmount) : r2((total * (p ? commissionPctOf(p) : COMISSAO_PADRAO_PCT)) / 100);
    const l = linhas.get(b.pousadaId) || { pousadaId: b.pousadaId, pousada: p?.name || b.pousadaName, reservas: 0, bruto: 0, comissao: 0, afiliados: 0, conservacao: 0, repasse: 0 };
    l.reservas++;
    l.bruto = r2(l.bruto + total);
    l.comissao = r2(l.comissao + comissao);
    l.afiliados = r2(l.afiliados + (Number(b.afiliadoCommission) || 0));
    l.conservacao = r2(l.conservacao + (Number(b.conservationAmount) || 0));
    l.repasse = r2(l.repasse + total - comissao);
    linhas.set(b.pousadaId, l);
  }
  const porPousada = [...linhas.values()].sort((a, b) => b.bruto - a.bruto);
  const sum = (k: keyof (typeof porPousada)[number]) => r2(porPousada.reduce((s, l) => s + (Number(l[k]) || 0), 0));

  const assinantes = pousadas.filter(p => p.plano === "gestao");
  const mensalidades = PLANO_GESTAO_VALOR ? r2(assinantes.length * PLANO_GESTAO_VALOR) : 0;
  const servicos = r2((pedidos || []).reduce((s, p) => s + (Number(p.valor) || 0), 0));
  const comissao = sum("comissao");
  const afiliados = sum("afiliados");
  const conservacao = sum("conservacao");

  res.json({
    mes,
    config: { comissaoPadraoPct: COMISSAO_PADRAO_PCT, conservacaoPadraoPct: CONSERVACAO_PADRAO_PCT, planoGestaoValor: PLANO_GESTAO_VALOR },
    totais: {
      reservas: sum("reservas"), bruto: sum("bruto"), comissao, afiliados, conservacao, repasse: sum("repasse"),
      mensalidades, assinantesGestao: assinantes.length, servicos, servicosEntregues: (pedidos || []).length,
      // Receita líquida da EcoSafari no mês.
      receitaLiquida: r2(comissao - afiliados - conservacao + mensalidades + servicos),
    },
    porPousada,
    servicos: (pedidos || []).map(p => ({ id: p.id, pousadaId: p.pousadaId, pousada: byId.get(p.pousadaId)?.name || "—", servico: p.servico || "site", valor: Number(p.valor) || 0 })),
  });
});

// ---------------- Planos ----------------

app.get("/api/planos", (req, res) => {
  res.json({ gestao: { valor: PLANO_GESTAO_VALOR } });
});

// Pousada no plano Básico pede o Gestão: avisa a equipe e devolve o WhatsApp.
app.post("/api/pousadas/:id/pedido-plano", requirePartnerAccess("pousada"), async (req, res) => {
  const { data: p } = await supabase.from("pousadas").select("name").eq("id", req.params.id).maybeSingle();
  if (!p) return res.status(404).json({ error: "Pousada não encontrada" });
  const nome = res.locals.actorUser?.user_metadata?.name;
  addNotification("admin", `${p.name} quer contratar o plano Gestão${nome ? ` (${nome})` : ""}.`, "status_update");
  const text = `Olá! ${nome ? `Sou ${nome}, gestor(a) da` : "Sou gestor(a) da"} ${p.name} e quero contratar o plano Gestão da EcoSafari.`;
  res.json({ whatsappUrl: `https://wa.me/${AGENCY_WHATSAPP.replace(/\D/g, "")}?text=${encodeURIComponent(text)}` });
});

// ---------------- Câmbio ----------------

app.get("/api/cambio", async (req, res) => {
  if (!cambio || Date.now() - cambio.at > 12 * 60 * 60 * 1000) {
    try {
      const r = await fetch("https://api.frankfurter.app/latest?from=BRL&to=USD,EUR", { signal: AbortSignal.timeout(6000) });
      const body = await r.json() as { rates?: { USD?: number; EUR?: number } };
      if (body.rates?.USD && body.rates?.EUR) cambio = { at: Date.now(), rates: { USD: body.rates.USD, EUR: body.rates.EUR } };
    } catch (err: any) {
      log.warn("Falha ao buscar câmbio:", err?.message);
    }
  }
  res.setHeader("Cache-Control", "public, max-age=3600");
  res.json(cambio ? { base: "BRL", rates: cambio.rates, updatedAt: new Date(cambio.at).toISOString() } : { base: "BRL", rates: null });
});

// ---------------- Conservação ----------------

// Total destinado a projetos ambientais pelas reservas pagas, e os projetos.
app.get("/api/conservacao/impacto", async (req, res) => {
  const [{ data: bookings, error }, { data: pousadaRows }] = await Promise.all([
    supabase.from("bookings").select("conservationAmount").in("status", PAID).not("conservationAmount", "is", null),
    supabase.from("pousadas").select("conservationPartner").not("conservationPartner", "is", null),
  ]);
  if (error) return res.json({ total: 0, reservas: 0, parceiros: [] });
  res.setHeader("Cache-Control", "public, max-age=600");
  res.json({
    total: r2((bookings || []).reduce((s, b) => s + (Number(b.conservationAmount) || 0), 0)),
    reservas: (bookings || []).filter(b => Number(b.conservationAmount) > 0).length,
    parceiros: [...new Set((pousadaRows || []).map(p => String(p.conservationPartner || "").trim()).filter(Boolean))],
  });
});
}
