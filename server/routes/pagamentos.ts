// Pagamentos: checkout do Stripe e confirmação.
import type { Express } from "express";
import { Booking } from "../../src/types.js";
import {
  applyBookingStatusUpdate,
  applyConsumoPayment,
  checkoutLimiter,
  createBookingCheckoutSession,
  log,
  stripe,
  supabase,
} from "../core.js";

export function registerPagamentosRoutes(app: Express) {

// ----------------------------------------------------
// PAGAMENTO REAL (STRIPE) — ativa automaticamente quando STRIPE_SECRET_KEY
// está configurado; enquanto isso, o chatbot usa o botão de simulação.
// ----------------------------------------------------

app.get("/api/stripe/status", (req, res) => {
  res.json({ configured: !!stripe });
});

app.post("/api/create-checkout-session", checkoutLimiter, async (req, res) => {
  if (!stripe) {
    return res.status(503).json({ error: "Stripe não configurado. Defina STRIPE_SECRET_KEY para ativar o checkout real." });
  }

  const { bookingId } = req.body;
  const { data: booking, error: bookingErr } = await supabase.from("bookings").select("*").eq("id", bookingId).maybeSingle();
  if (bookingErr || !booking) {
    return res.status(404).json({ error: "Reserva não encontrada" });
  }

  if (booking.status !== "pendente_pagamento") {
    return res.status(409).json({ error: "Esta reserva não está aguardando pagamento." });
  }

  try {
    res.json({ url: await createBookingCheckoutSession(booking as Booking) });
  } catch (err: any) {
    log.error("Erro ao criar sessão de checkout Stripe:", err.message);
    res.status(500).json({ error: "Erro ao criar sessão de pagamento" });
  }
});

app.get("/api/payments/confirm", checkoutLimiter, async (req, res) => {
  if (!stripe) {
    return res.status(503).json({ error: "Stripe não configurado" });
  }
  const sessionId = String(req.query.session_id || "");
  if (!sessionId) {
    return res.status(400).json({ error: "session_id é obrigatório" });
  }

  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    if (session.payment_status !== "paid") {
      return res.status(402).json({ error: "Pagamento ainda não confirmado" });
    }
    const bookingId = session.metadata?.bookingId;
    if (!bookingId) {
      // Sem bookingId: é uma cobrança de consumo, não de reserva (ver
      // POST /api/pousadas/:id/bookings/:bookingId/consumos/cobrar).
      const settled = await applyConsumoPayment(session);
      if (!settled) return res.status(400).json({ error: "Sessão de pagamento não identificada." });
      return res.json({ consumo: true });
    }
    const updated = await applyBookingStatusUpdate(bookingId, { status: "pago" }, req);
    if (!updated) {
      return res.status(404).json({ error: "Reserva não encontrada" });
    }
    res.json({ booking: updated });
  } catch (err: any) {
    log.error("Erro ao confirmar pagamento Stripe:", err.message);
    res.status(500).json({ error: "Erro ao confirmar pagamento" });
  }
});
}
