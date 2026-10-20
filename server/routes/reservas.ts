// Reservas: criação, status, agenda, confiabilidade e o cron diário.
import type { Express } from "express";
import { Booking } from "../../src/types.js";
import { randomUUID } from "crypto";
import { safeEqual } from "../../src/lib/safeEqual.js";
import {
  CONFIRMED_BOOKING_STATUSES,
  CRON_SECRET,
  OVERBOOKING_MESSAGE,
  REMINDER_THRESHOLDS,
  addNotification,
  applyBookingStatusUpdate,
  checkPousadaAvailability,
  computeBookingTotal,
  diasAteData,
  enviarLembreteCancelamento,
  enviarPedidosDeAvaliacao,
  generateVoucherPdfBuffer,
  getAuthorizedBooking,
  isOverbookingError,
  log,
  logAdminAction,
  mapAtracaoRow,
  mapGuideRow,
  mapPousadaRow,
  purgeLixeiraExpirada,
  registrarPenalidadeCancelamento,
  requireAdmin,
  requirePartnerAccess,
  supabase,
} from "../core.js";

export function registerReservasRoutes(app: Express) {

// BOOKINGS CRUD & FLOWS
app.get("/api/bookings", requireAdmin, async (req, res) => {
  const { data, error } = await supabase.from("bookings").select("*");
  if (error) return res.status(500).json({ error: "Erro ao buscar reservas" });
  res.json(data);
});

// Disponibilidade consolidada de pousadas + guias + atrações num período —
// antes disso, saber "o que está livre" exigia cruzar reservas, guias e
// atrações manualmente em telas separadas. Reaproveita a mesma lógica de
// checagem por tipo de quarto usada em POST /api/bookings, só que em modo
// leitura/agregado em vez de "posso criar esta reserva?". Desenhada pra
// também alimentar a IA quando ela passar a montar roteiro personalizado —
// mesma resposta, só que consumida por código em vez de olhos humanos.
app.get("/api/gestao/agenda", requireAdmin, async (req, res) => {
  const startDate = String(req.query.startDate || "");
  const endDate = String(req.query.endDate || startDate);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
    return res.status(400).json({ error: "Informe startDate (e opcionalmente endDate) no formato YYYY-MM-DD." });
  }

  const [pousadasRes, guidesRes, atracoesRes, bookingsRes] = await Promise.all([
    supabase.from("pousadas").select("*"),
    supabase.from("guides").select("*"),
    supabase.from("atracoes").select("*"),
    supabase.from("bookings").select("pousadaId,roomType,checkIn,checkOut,adults,children,status").neq("status", "cancelado"),
  ]);

  const pousadaRows = (pousadasRes.data || []).map(mapPousadaRow);
  const guideRows = (guidesRes.data || []).map(mapGuideRow);
  const atracaoRows = (atracoesRes.data || []).map(mapAtracaoRow);
  const overlappingBookings = (bookingsRes.data || []).filter((b: any) => b.checkIn <= endDate && b.checkOut >= startDate);

  const pousadas = pousadaRows.map(p => {
    const theseBookings = overlappingBookings.filter((b: any) => b.pousadaId === p.id);
    const blockedDatesInRange = (p.unavailableDates || []).filter(d => d >= startDate && d <= endDate);
    if (p.rooms && p.rooms.length > 0) {
      const rooms = p.rooms.map(r => {
        const bookedUnits = theseBookings.filter((b: any) => b.roomType === r.type).length;
        return { type: r.type, capacity: r.capacity, quantity: r.quantity, availableUnits: Math.max(0, r.quantity - bookedUnits) };
      });
      return { id: p.id, name: p.name, location: p.location, rooms, blockedDatesInRange, hasAvailability: blockedDatesInRange.length === 0 && rooms.some(r => r.availableUnits > 0) };
    }
    const guestsBooked = theseBookings.reduce((sum: number, b: any) => sum + (b.adults || 0) + (b.children || 0), 0);
    return { id: p.id, name: p.name, location: p.location, capacity: p.capacity, guestsBooked, blockedDatesInRange, hasAvailability: blockedDatesInRange.length === 0 && guestsBooked < p.capacity };
  });

  const guides = guideRows.map(g => {
    const blockedDatesInRange = (g.unavailableDates || []).filter(d => d >= startDate && d <= endDate);
    return {
      id: g.id, name: g.name, specialty: g.specialty, languages: g.languages, status: g.status,
      blockedDatesInRange,
      hasAvailability: g.status === "disponivel" && blockedDatesInRange.length === 0,
    };
  });

  const atracoes = atracaoRows.map(a => ({
    id: a.id, name: a.name, type: a.type, location: a.location, availability: a.availability || "",
  }));

  res.json({ startDate, endDate, pousadas, guides, atracoes });
});

// Public, PII-free summary for the mobile app check-in demo: only pousada
// name, dates and status — never customer name/email/phone.
app.get("/api/bookings/public-confirmed", async (req, res) => {
  const { data, error } = await supabase
    .from("bookings")
    // Sem "id": o calendário público só precisa de pousada e datas, e o id
    // de uma reserva não deve circular em rota sem autenticação.
    .select("pousadaName,checkIn,checkOut,status")
    .eq("status", "confirmado_total");
  if (error) return res.status(500).json({ error: "Erro ao buscar reservas" });
  res.json(data);
});

app.post("/api/bookings", requireAdmin, async (req, res) => {
  const { pousadaId, checkIn, checkOut, adults, children, roomType } = req.body;
  const { data: pousadaRow, error: pErr } = await supabase.from("pousadas").select("*").eq("id", pousadaId).maybeSingle();
  if (pErr || !pousadaRow) {
    return res.status(404).json({ error: "Pousada não encontrada" });
  }
  const targetPousada = mapPousadaRow(pousadaRow);
  const newGuests = (adults || 1) + (children || 0);

  const availability = await checkPousadaAvailability(targetPousada, checkIn, checkOut, newGuests, roomType);
  if (!availability.ok) return res.status(availability.status || 400).json(availability.body);

  // Create booking
  const totalPrice = computeBookingTotal(targetPousada, checkIn, checkOut, adults || 1, req.body.experienceType);

  const newBooking: Booking = {
    id: `b_${randomUUID()}`,
    pousadaId,
    pousadaName: targetPousada.name,
    customerName: req.body.customerName || "Cliente WhatsApp",
    customerEmail: req.body.customerEmail || "cliente@reserva.com",
    customerPhone: req.body.customerPhone || "+55 11 99999-9999",
    nationality: req.body.nationality || "Brasileira",
    adults: adults || 1,
    children: children || 0,
    childAges: req.body.childAges || "",
    dietaryRestrictions: req.body.dietaryRestrictions || "Nenhuma",
    specialNeeds: req.body.specialNeeds || "Nenhuma",
    checkIn,
    checkOut,
    experienceType: req.body.experienceType || "Padrão",
    totalPrice,
    status: req.body.status || "pendente_pagamento",
    dateCreated: new Date().toISOString(),
    roomType: roomType || undefined,
  };

  const { error } = await supabase.from("bookings").insert(newBooking);
  if (isOverbookingError(error)) return res.status(409).json({ error: OVERBOOKING_MESSAGE, available: false });
  if (error) {
    log.error("Erro ao salvar reserva no Supabase:", error.message);
    return res.status(500).json({ error: "Erro ao criar reserva" });
  }

  addNotification("admin", `Nova reserva criada: ${newBooking.customerName} na ${newBooking.pousadaName}.`, "booking_new", newBooking.id);
  await logAdminAction(res.locals.adminUser, "create", "booking", newBooking.id, `${newBooking.customerName} — ${newBooking.pousadaName}`);

  res.status(201).json({ available: true, booking: newBooking });
});

app.put("/api/bookings/:id/status", requireAdmin, async (req, res) => {
  const updated = await applyBookingStatusUpdate(req.params.id, req.body, req);
  if (!updated) {
    return res.status(404).json({ error: "Reserva não encontrada" });
  }
  await logAdminAction(res.locals.adminUser, "update_status", "booking", updated.id, `${updated.customerName} — ${updated.status}`);
  res.json(updated);
});

app.get("/api/pousadas/:id/bookings", requirePartnerAccess("pousada"), async (req, res) => {
  const { data, error } = await supabase.from("bookings").select("*").eq("pousadaId", req.params.id).order("checkIn", { ascending: true });
  if (error) return res.status(500).json({ error: "Erro ao buscar reservas." });
  res.json(data);
});

app.put("/api/pousadas/:id/bookings/:bookingId/status", requirePartnerAccess("pousada"), async (req, res) => {
  const { data: booking } = await supabase.from("bookings").select("*").eq("id", req.params.bookingId).maybeSingle();
  if (!booking || booking.pousadaId !== req.params.id) return res.status(404).json({ error: "Reserva não encontrada nesta pousada." });

  const { status } = req.body;
  if (status !== "confirmado_pousada" && status !== "cancelado") {
    return res.status(400).json({ error: "A pousada só pode aprovar o quarto ou cancelar a própria reserva." });
  }
  if (status === "cancelado" && CONFIRMED_BOOKING_STATUSES.includes(booking.status)) {
    await registrarPenalidadeCancelamento("pousada", req.params.id, booking as Booking);
  }

  const updated = await applyBookingStatusUpdate(req.params.bookingId, { status }, req);
  if (!updated) return res.status(404).json({ error: "Reserva não encontrada." });
  await logAdminAction(res.locals.actorUser, "update_status", "booking", updated.id, `${updated.customerName} — ${updated.status} (pousada)`);
  res.json(updated);
});

app.get("/api/guides/:id/bookings", requirePartnerAccess("guia"), async (req, res) => {
  const { data, error } = await supabase.from("bookings").select("*").eq("guideId", req.params.id).order("checkIn", { ascending: true });
  if (error) return res.status(500).json({ error: "Erro ao buscar reservas." });
  res.json(data);
});

app.put("/api/guides/:id/bookings/:bookingId/status", requirePartnerAccess("guia"), async (req, res) => {
  const { data: booking } = await supabase.from("bookings").select("*").eq("id", req.params.bookingId).maybeSingle();
  if (!booking || booking.guideId !== req.params.id) return res.status(404).json({ error: "Reserva não encontrada para este guia." });

  const { status } = req.body;
  if (status !== "confirmado_guia" && status !== "cancelado") {
    return res.status(400).json({ error: "O guia só pode confirmar a própria participação ou cancelar." });
  }

  if (status === "cancelado") {
    if (CONFIRMED_BOOKING_STATUSES.includes(booking.status)) {
      await registrarPenalidadeCancelamento("guia", req.params.id, booking as Booking);
    }
    // Guia cancelar não cancela a reserva inteira (o quarto continua
    // reservado) — só desvincula o guia, pra pousada buscar outro.
    const revertStatus = booking.status === "confirmado_total" || booking.status === "confirmado_pousada" ? "confirmado_pousada" : "pago";
    const { data: updated, error } = await supabase.from("bookings").update({ status: revertStatus, guideId: null, guideName: null }).eq("id", booking.id).select().single();
    if (error) return res.status(500).json({ error: "Erro ao cancelar participação do guia." });
    await logAdminAction(res.locals.actorUser, "update_status", "booking", booking.id, `Guia cancelou participação — reserva volta pra ${revertStatus}`);
    return res.json(updated);
  }

  const updated = await applyBookingStatusUpdate(req.params.bookingId, { status, guideId: req.params.id }, req);
  if (!updated) return res.status(404).json({ error: "Reserva não encontrada." });
  await logAdminAction(res.locals.actorUser, "update_status", "booking", updated.id, `${updated.customerName} — ${updated.status} (guia)`);
  res.json(updated);
});

// Visão de confiabilidade só-admin — soma penalidades por prestador. Nunca
// mexe na nota pública de avaliação, é um selo interno separado.
app.get("/api/gestao/confiabilidade", requireAdmin, async (req, res) => {
  const { data: penalidades, error } = await supabase.from("prestador_penalidades").select("*").order("createdAt", { ascending: false });
  if (error) return res.status(500).json({ error: "Erro ao buscar penalidades." });

  const [{ data: pousadaRows }, { data: guideRows }] = await Promise.all([
    supabase.from("pousadas").select("id,name"),
    supabase.from("guides").select("id,name"),
  ]);
  const nomes: Record<string, string> = {};
  (pousadaRows || []).forEach((p: any) => { nomes[`pousada:${p.id}`] = p.name; });
  (guideRows || []).forEach((g: any) => { nomes[`guia:${g.id}`] = g.name; });

  const resumo: Record<string, { prestadorType: string; prestadorId: string; prestadorName: string; totalEstrelasPerdidas: number; totalDevido: number; qtdCancelamentos: number }> = {};
  for (const p of penalidades || []) {
    const key = `${p.prestadorType}:${p.prestadorId}`;
    if (!resumo[key]) {
      resumo[key] = { prestadorType: p.prestadorType, prestadorId: p.prestadorId, prestadorName: nomes[key] || "(removido)", totalEstrelasPerdidas: 0, totalDevido: 0, qtdCancelamentos: 0 };
    }
    resumo[key].totalEstrelasPerdidas += p.estrelasPerdidas;
    resumo[key].totalDevido += p.valorPenalidade;
    resumo[key].qtdCancelamentos += 1;
  }

  res.json({ penalidades, resumoPorPrestador: Object.values(resumo) });
});

app.get("/api/cron/lembretes-cancelamento", async (req, res) => {
  // Vercel Cron manda esse header automaticamente quando CRON_SECRET está
  // definido — sem isso, qualquer um poderia disparar o job manualmente.
  // Fail-closed: sem CRON_SECRET configurada o job fica desligado, em vez de
  // aberto para qualquer um disparar e-mails para todos os hóspedes.
  if (!CRON_SECRET) {
    log.warn("CRON_SECRET não configurada — job de lembretes recusado.");
    return res.status(503).json({ error: "Job indisponível: CRON_SECRET não configurada." });
  }
  if (!safeEqual(String(req.headers.authorization || ""), `Bearer ${CRON_SECRET}`)) {
    return res.status(401).json({ error: "Não autorizado." });
  }

  const { data: bookings, error } = await supabase.from("bookings").select("*").in("status", CONFIRMED_BOOKING_STATUSES);
  if (error) return res.status(500).json({ error: "Erro ao buscar reservas confirmadas." });

  let sent = 0;
  for (const booking of (bookings || []) as Booking[]) {
    const dias = diasAteData(booking.checkIn);
    if (!(REMINDER_THRESHOLDS as readonly number[]).includes(dias)) continue;

    const { data: already } = await supabase.from("lembretes_enviados").select("id").eq("bookingId", booking.id).eq("threshold", dias).maybeSingle();
    if (already) continue;

    await enviarLembreteCancelamento(booking, dias);
    const { error: logErr } = await supabase.from("lembretes_enviados").insert({ id: `lb_${randomUUID()}`, bookingId: booking.id, threshold: dias, sentAt: new Date().toISOString() });
    if (!logErr) sent++;
  }

  // Mesmo job diário aproveita pra esvaziar a lixeira vencida (>30 dias) —
  // ver moverParaLixeira/scripts/add-lixeira.sql. Não justifica um cron
  // separado só pra isso.
  await purgeLixeiraExpirada();

  // E-mail de avaliação no dia seguinte ao check-out (Resend + este cron).
  const reviewRequestsSent = await enviarPedidosDeAvaliacao();

  res.json({ success: true, remindersSent: sent, reviewRequestsSent });
});

app.get("/api/bookings/:id/voucher.pdf", async (req, res) => {
  const booking = await getAuthorizedBooking(req, res);
  if (!booking) return; // getAuthorizedBooking já respondeu o erro

  try {
    const buffer = await generateVoucherPdfBuffer(booking);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="voucher-${booking.id}.pdf"`);
    res.send(buffer);
  } catch (err: any) {
    log.error("Erro ao gerar voucher PDF:", err.message);
    res.status(500).json({ error: "Erro ao gerar voucher" });
  }
});
}
