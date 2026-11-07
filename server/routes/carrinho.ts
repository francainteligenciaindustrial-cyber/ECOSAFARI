// Carrinho: o turista junta várias estadias/pacotes e paga tudo de uma vez.
// Cada item vira uma reserva própria (a pousada só vê a sua), ligadas por um
// número de pedido; a vaga fica segurada por ~30 min enquanto ele paga.
import type { Express } from "express";
import { randomUUID } from "crypto";
import type { Booking } from "../../src/types.js";
import {
  addNotification,
  authLimiter,
  CART_HOLD_MINUTES,
  checkoutLimiter,
  createPedidoCheckoutSession,
  log,
  refundBookingAmount,
  releasePedidoHold,
  requireAdmin,
  requireTourist,
  stripe,
  supabase,
  writeSkippingMissingColumns,
} from "../core.js";
import { insertTouristBooking, loadTouristProfile, prepareTouristBooking } from "../touristBooking.js";

export const MAX_CART_ITEMS = 8;

const itemsFrom = (body: any): any[] => (Array.isArray(body?.items) ? body.items.slice(0, MAX_CART_ITEMS) : []);
// Cupom não entra no carrinho (o Stripe aceita um desconto por pagamento);
// ele continua valendo na reserva avulsa.
const sanitize = (item: any) => ({ ...(item || {}), cupomCode: undefined });

export function registerCarrinhoRoutes(app: Express) {

// Preço e vaga de cada item, sem reservar nada — a página do carrinho chama
// a cada mudança, por isso usa o limite folgado de leitura.
app.post("/api/carrinho/cotar", authLimiter, async (req, res) => {
  const items = itemsFrom(req.body);
  const result = [];
  for (const item of items) {
    const prep = await prepareTouristBooking(sanitize(item));
    if ("body" in prep) result.push({ ok: false, error: prep.body.error, suggestions: prep.body.suggestions || [] });
    else result.push({ ok: true, total: prep.total, pousadaName: prep.pousada.name, experienceType: prep.base.experienceType });
  }
  res.json({ items: result, total: result.reduce((acc, r: any) => acc + (r.ok ? r.total : 0), 0) });
});

// Fecha o pedido: cria as reservas (pendentes, com prazo) e abre UM checkout
// do Stripe com todas. Se um item falha, nada é reservado e a resposta diz
// qual item precisa de ajuste.
app.post("/api/turista/carrinho/checkout", checkoutLimiter, requireTourist, async (req, res) => {
  if (!stripe) return res.status(503).json({ error: "Pagamento online ainda não está ativo — fale com a equipe pelo WhatsApp." });
  const items = itemsFrom(req.body);
  if (items.length === 0) return res.status(400).json({ error: "Seu carrinho está vazio." });
  if (req.body.acceptedTerms !== true) return res.status(400).json({ error: "Aceite os termos e a política de cancelamento." });

  const user = res.locals.touristUser as { id: string; email?: string };
  const profile = await loadTouristProfile(user);
  if (!profile) return res.status(403).json({ error: "Complete seu perfil de turista antes de reservar." });

  // Nova tentativa depois de fechar o pagamento: a anterior ainda segura as
  // vagas (e bloquearia o próprio turista). Encerra aquele checkout no
  // Stripe — para não ser pago em dobro — e libera as vagas.
  const { data: anteriores, error: antErr } = await supabase.from("bookings").select("*").eq("turistaId", user.id).eq("status", "pendente_pagamento").eq("origem", "carrinho");
  if (!antErr && anteriores && anteriores.length) {
    const sessions = Array.from(new Set(anteriores.map((b: any) => b.stripeSessionId).filter(Boolean))) as string[];
    for (const sid of sessions) await stripe.checkout.sessions.expire(sid).catch(() => {});
    await releasePedidoHold(anteriores.map((b: any) => b.id));
  }

  const preps = [];
  for (let i = 0; i < items.length; i++) {
    const prep = await prepareTouristBooking(sanitize(items[i]));
    if ("body" in prep) return res.status(409).json({ error: prep.body.error, itemIndex: i, suggestions: prep.body.suggestions || [] });
    preps.push(prep);
  }

  const pedidoId = `ped_${randomUUID()}`;
  const holdUntil = new Date(Date.now() + CART_HOLD_MINUTES * 60000).toISOString();
  const created: Booking[] = [];
  const rollback = async () => {
    if (created.length) await supabase.from("bookings").delete().in("id", created.map(b => b.id));
  };
  for (let i = 0; i < preps.length; i++) {
    const r = await insertTouristBooking(preps[i], profile, { afiliadoCode: req.body.afiliadoCode, pedidoId, holdUntil });
    if ("body" in r) {
      await rollback();
      return res.status(r.status).json({ error: r.body.error, itemIndex: i });
    }
    created.push(r.booking as Booking);
  }

  try {
    const { url, sessionId } = await createPedidoCheckoutSession(created, pedidoId, holdUntil);
    await writeSkippingMissingColumns({ stripeSessionId: sessionId }, row => supabase.from("bookings").update(row).in("id", created.map(b => b.id)));
    addNotification("admin", `Novo pedido no carrinho (${created.length} reserva(s)) de ${profile.name}, aguardando pagamento.`, "booking_new", created[0].id);
    res.status(201).json({ url, pedidoId, holdUntil, bookingIds: created.map(b => b.id) });
  } catch (err: any) {
    log.error("Erro ao abrir o checkout do carrinho:", err.message);
    await rollback();
    res.status(500).json({ error: "Não foi possível abrir o pagamento. Tente novamente." });
  }
});

// Gestão: cancelar UMA reserva paga e devolver só o valor dela, sem mexer
// nas outras do mesmo pedido (vale também para reserva avulsa).
app.post("/api/admin/bookings/:id/reembolso", requireAdmin, async (req, res) => {
  const { data: b } = await supabase.from("bookings").select("*").eq("id", req.params.id).maybeSingle();
  if (!b) return res.status(404).json({ error: "Reserva não encontrada." });
  if (!stripe) return res.status(503).json({ error: "Stripe não configurado." });
  if (b.refundedAt) return res.status(409).json({ error: "Esta reserva já foi reembolsada." });
  if (!b.stripePaymentIntentId) return res.status(400).json({ error: "Esta reserva não tem pagamento online registrado (paga antes da atualização ou por outro meio). Reembolse pelo painel do Stripe." });
  const amount = req.body.amount != null ? Number(req.body.amount) : Number(b.totalPrice);
  if (!(amount > 0) || amount > Number(b.totalPrice)) return res.status(400).json({ error: "Valor de reembolso inválido." });
  try {
    await refundBookingAmount(b.stripePaymentIntentId, amount, b.id);
  } catch (err: any) {
    log.error("Erro no reembolso:", err.message);
    return res.status(502).json({ error: `O Stripe recusou o reembolso: ${err.message}` });
  }
  await writeSkippingMissingColumns({ status: "cancelado", refundedAt: new Date().toISOString(), refundedAmount: amount, reembolsoValor: amount, canceladoPor: "gestao", canceladoEm: new Date().toISOString(), repasseStatus: "reembolsado", repasseValor: 0 }, row => supabase.from("bookings").update(row).eq("id", b.id));
  addNotification("admin", `Reserva ${b.id} (${b.pousadaName}) cancelada e R$ ${amount.toLocaleString("pt-BR")} reembolsados.`, "status_update", b.id);
  res.json({ success: true, amount });
});
}
