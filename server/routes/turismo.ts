// Camada de turismo (turistas, roteiros, reservas, pagamentos, guias) do painel de Gestão.
import type { Express } from "express";
import { Turista, Roteiro, Reserva, Pagamento, GuiaTuristico } from "../../src/types.js";
import { randomUUID } from "crypto";
import {
  GUIA_TURISTICO_FIELDS,
  PAGAMENTO_FIELDS,
  RESERVA_FIELDS,
  ROTEIRO_FIELDS,
  TURISTA_FIELDS,
  log,
  logAdminAction,
  moverParaLixeira,
  pickFields,
  requireAdmin,
  supabase,
} from "../core.js";

export function registerTurismoRoutes(app: Express) {

// ----------------------------------------------------
// CAMADA DE TURISMO: TURISTAS, ROTEIROS, RESERVAS, PAGAMENTOS, GUIAS
// (modelo adicional conforme especificação do banco de dados, independente
// do catálogo de Pousadas/Bookings já existente)
// ----------------------------------------------------

// TURISTAS CRUD
app.get("/api/turistas", requireAdmin, async (req, res) => {
  const { data, error } = await supabase.from("turistas").select("*");
  if (error) return res.status(500).json({ error: "Erro ao buscar turistas" });
  res.json(data);
});

app.post("/api/turistas", requireAdmin, async (req, res) => {
  const newTurista: Turista = { ...pickFields<Turista>(req.body, TURISTA_FIELDS), id: `t_${randomUUID()}` } as Turista;
  const { error } = await supabase.from("turistas").insert(newTurista);
  if (error) {
    log.error("Erro ao salvar turista no Supabase:", error.message);
    return res.status(500).json({ error: "Erro ao salvar turista" });
  }
  await logAdminAction(res.locals.adminUser, "create", "turista", newTurista.id, newTurista.name);
  res.status(201).json(newTurista);
});

app.put("/api/turistas/:id", requireAdmin, async (req, res) => {
  const { id } = req.params;
  const updates = pickFields<Turista>(req.body, TURISTA_FIELDS);
  const { data, error } = await supabase.from("turistas").update(updates).eq("id", id).select().single();
  if (error || !data) return res.status(404).json({ error: "Turista não encontrado" });
  await logAdminAction(res.locals.adminUser, "update", "turista", id, data.name);
  res.json(data);
});

// Só esta exclusão feita pelo admin passa pela lixeira. O hard-delete de
// verdade em DELETE /api/turista/me (autoexclusão LGPD, mais abaixo) fica
// como está — direito ao esquecimento não pode virar "recuperável em 30
// dias" escondido do próprio titular dos dados.
app.delete("/api/turistas/:id", requireAdmin, async (req, res) => {
  const { id } = req.params;
  let existing: any;
  try {
    existing = await moverParaLixeira("turista", id, res.locals.adminUser?.email || "admin");
  } catch (err: any) {
    log.error("Erro ao mover turista para a lixeira:", err.message);
    return res.status(500).json({ error: "Erro ao excluir turista" });
  }
  if (!existing) return res.status(404).json({ error: "Turista não encontrado" });
  const { error } = await supabase.from("turistas").delete().eq("id", id);
  if (error) return res.status(500).json({ error: "Erro ao excluir turista" });
  await logAdminAction(res.locals.adminUser, "delete", "turista", id, existing?.name || id);
  res.json({ success: true, message: "Turista movido para a lixeira. Pode ser restaurado em até 30 dias." });
});

// ROTEIROS CRUD
app.get("/api/roteiros", requireAdmin, async (req, res) => {
  const { data, error } = await supabase.from("roteiros").select("*");
  if (error) return res.status(500).json({ error: "Erro ao buscar roteiros" });
  res.json(data);
});

app.post("/api/roteiros", requireAdmin, async (req, res) => {
  const newRoteiro: Roteiro = { ...pickFields<Roteiro>(req.body, ROTEIRO_FIELDS), id: `rt_${randomUUID()}` } as Roteiro;
  const { error } = await supabase.from("roteiros").insert(newRoteiro);
  if (error) {
    log.error("Erro ao salvar roteiro no Supabase:", error.message);
    return res.status(500).json({ error: "Erro ao salvar roteiro" });
  }
  await logAdminAction(res.locals.adminUser, "create", "roteiro", newRoteiro.id, newRoteiro.name);
  res.status(201).json(newRoteiro);
});

app.put("/api/roteiros/:id", requireAdmin, async (req, res) => {
  const { id } = req.params;
  const updates = pickFields<Roteiro>(req.body, ROTEIRO_FIELDS);
  const { data, error } = await supabase.from("roteiros").update(updates).eq("id", id).select().single();
  if (error || !data) return res.status(404).json({ error: "Roteiro não encontrado" });
  await logAdminAction(res.locals.adminUser, "update", "roteiro", id, data.name);
  res.json(data);
});

app.delete("/api/roteiros/:id", requireAdmin, async (req, res) => {
  const { id } = req.params;
  const { data: existing } = await supabase.from("roteiros").select("name").eq("id", id).maybeSingle();
  const { error } = await supabase.from("roteiros").delete().eq("id", id);
  if (error) return res.status(500).json({ error: "Erro ao excluir roteiro" });
  await logAdminAction(res.locals.adminUser, "delete", "roteiro", id, existing?.name || id);
  res.json({ success: true, message: "Roteiro excluído com sucesso" });
});

// RESERVAS (DE ROTEIRO) CRUD
app.get("/api/reservas", requireAdmin, async (req, res) => {
  const { data, error } = await supabase.from("reservas").select("*");
  if (error) return res.status(500).json({ error: "Erro ao buscar reservas" });
  res.json(data);
});

app.post("/api/reservas", requireAdmin, async (req, res) => {
  const newReserva: Reserva = { ...pickFields<Reserva>(req.body, RESERVA_FIELDS), id: `rv_${randomUUID()}` } as Reserva;
  const { error } = await supabase.from("reservas").insert(newReserva);
  if (error) {
    log.error("Erro ao salvar reserva no Supabase:", error.message);
    return res.status(500).json({ error: "Erro ao salvar reserva" });
  }
  await logAdminAction(res.locals.adminUser, "create", "reserva_roteiro", newReserva.id, `roteiro ${newReserva.roteiroId} — turista ${newReserva.turistaId}`);
  res.status(201).json(newReserva);
});

app.put("/api/reservas/:id", requireAdmin, async (req, res) => {
  const { id } = req.params;
  const updates = pickFields<Reserva>(req.body, RESERVA_FIELDS);
  const { data, error } = await supabase.from("reservas").update(updates).eq("id", id).select().single();
  if (error || !data) return res.status(404).json({ error: "Reserva não encontrada" });
  await logAdminAction(res.locals.adminUser, "update", "reserva_roteiro", id, `status: ${data.status}`);
  res.json(data);
});

app.delete("/api/reservas/:id", requireAdmin, async (req, res) => {
  const { id } = req.params;
  const { error } = await supabase.from("reservas").delete().eq("id", id);
  if (error) return res.status(500).json({ error: "Erro ao excluir reserva" });
  await logAdminAction(res.locals.adminUser, "delete", "reserva_roteiro", id, id);
  res.json({ success: true, message: "Reserva excluída com sucesso" });
});

// PAGAMENTOS CRUD
app.get("/api/pagamentos", requireAdmin, async (req, res) => {
  const { data, error } = await supabase.from("pagamentos").select("*");
  if (error) return res.status(500).json({ error: "Erro ao buscar pagamentos" });
  res.json(data);
});

app.post("/api/pagamentos", requireAdmin, async (req, res) => {
  const newPagamento: Pagamento = { ...pickFields<Pagamento>(req.body, PAGAMENTO_FIELDS), id: `pg_${randomUUID()}` } as Pagamento;
  const { error } = await supabase.from("pagamentos").insert(newPagamento);
  if (error) {
    log.error("Erro ao salvar pagamento no Supabase:", error.message);
    return res.status(500).json({ error: "Erro ao salvar pagamento" });
  }
  await logAdminAction(res.locals.adminUser, "create", "pagamento", newPagamento.id, `R$ ${newPagamento.amount} — reserva ${newPagamento.reservaId}`);
  res.status(201).json(newPagamento);
});

app.put("/api/pagamentos/:id", requireAdmin, async (req, res) => {
  const { id } = req.params;
  const updates = pickFields<Pagamento>(req.body, PAGAMENTO_FIELDS);
  const { data, error } = await supabase.from("pagamentos").update(updates).eq("id", id).select().single();
  if (error || !data) return res.status(404).json({ error: "Pagamento não encontrado" });
  await logAdminAction(res.locals.adminUser, "update", "pagamento", id, `status: ${data.status}`);
  res.json(data);
});

app.delete("/api/pagamentos/:id", requireAdmin, async (req, res) => {
  const { id } = req.params;
  const { error } = await supabase.from("pagamentos").delete().eq("id", id);
  if (error) return res.status(500).json({ error: "Erro ao excluir pagamento" });
  await logAdminAction(res.locals.adminUser, "delete", "pagamento", id, id);
  res.json({ success: true, message: "Pagamento excluído com sucesso" });
});

// GUIAS (turismo) CRUD — distinta da tabela "guides" (pousadas) já existente
app.get("/api/guias", requireAdmin, async (req, res) => {
  const { data, error } = await supabase.from("guias").select("*");
  if (error) return res.status(500).json({ error: "Erro ao buscar guias" });
  res.json(data);
});

app.post("/api/guias", requireAdmin, async (req, res) => {
  const newGuia: GuiaTuristico = { ...pickFields<GuiaTuristico>(req.body, GUIA_TURISTICO_FIELDS), id: `gt_${randomUUID()}` } as GuiaTuristico;
  const { error } = await supabase.from("guias").insert(newGuia);
  if (error) {
    log.error("Erro ao salvar guia no Supabase:", error.message);
    return res.status(500).json({ error: "Erro ao salvar guia" });
  }
  await logAdminAction(res.locals.adminUser, "create", "guia_turistico", newGuia.id, newGuia.name);
  res.status(201).json(newGuia);
});

app.put("/api/guias/:id", requireAdmin, async (req, res) => {
  const { id } = req.params;
  const updates = pickFields<GuiaTuristico>(req.body, GUIA_TURISTICO_FIELDS);
  const { data, error } = await supabase.from("guias").update(updates).eq("id", id).select().single();
  if (error || !data) return res.status(404).json({ error: "Guia não encontrado" });
  await logAdminAction(res.locals.adminUser, "update", "guia_turistico", id, data.name);
  res.json(data);
});

app.delete("/api/guias/:id", requireAdmin, async (req, res) => {
  const { id } = req.params;
  const { data: existing } = await supabase.from("guias").select("name").eq("id", id).maybeSingle();
  const { error } = await supabase.from("guias").delete().eq("id", id);
  if (error) return res.status(500).json({ error: "Erro ao excluir guia" });
  await logAdminAction(res.locals.adminUser, "delete", "guia_turistico", id, existing?.name || id);
  res.json({ success: true, message: "Guia excluído com sucesso" });
});
}
