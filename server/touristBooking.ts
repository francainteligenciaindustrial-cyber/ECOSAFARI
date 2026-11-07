// Reserva online do turista: validação, preço e disponibilidade num lugar
// só — usado pela reserva avulsa (POST /api/turista/bookings) e pelo
// carrinho (server/routes/carrinho.ts). Preço e vaga são sempre decididos
// aqui no servidor, nunca pelo navegador.
import { randomUUID } from "crypto";
import type { Pacote, Cupom, Pousada } from "../src/types.js";
import {
  bookingFinance,
  checkPousadaAvailability,
  clip,
  computeBookingTotal,
  ISO_DATE,
  isOverbookingError,
  loadPacote,
  log,
  mapPousadaRow,
  OVERBOOKING_MESSAGE,
  pacotePricePerPerson,
  registrarUsoCupom,
  shiftDays,
  supabase,
  validarCupom,
  writeSkippingMissingColumns,
} from "./core.js";

export type Fail = { ok: false; status: number; body: { error: string; available?: boolean; suggestions?: unknown } };
const fail = (status: number, error: string, extra: Record<string, unknown> = {}): Fail => ({ ok: false, status, body: { error, ...extra } });

export interface Prepared {
  ok: true;
  pousada: Pousada;
  pacote: Pacote | null;
  cupom: Cupom | null;
  subtotal: number;
  total: number;
  detailsSummary: string;
  // Tudo da reserva menos dados do turista e finanças (ver buildBookingRow).
  base: Record<string, any>;
}

// Confere datas, hóspedes, quarto, passeios, pacote, cupom e vaga. Não grava nada.
export async function prepareTouristBooking(body: any): Promise<Prepared | Fail> {
  const pousadaId = clip(body.pousadaId, 100);
  const checkIn = clip(body.checkIn, 10);
  const checkOut = clip(body.checkOut, 10);
  const adults = Math.trunc(Number(body.adults));
  const children = Math.trunc(Number(body.children) || 0);
  const roomType = clip(body.roomType, 120) || undefined;
  // Vários passeios (experienceTypes) ou um só (experienceType, legado).
  const experienceTitles = Array.from(new Set(
    (Array.isArray(body.experienceTypes) ? body.experienceTypes : [body.experienceType])
      .map((t: unknown) => clip(t, 200))
      .filter(Boolean) as string[]
  )).slice(0, 15);
  const pacoteId = clip(body.pacoteId, 100) || undefined;

  const today = new Date().toISOString().slice(0, 10);
  if (!ISO_DATE.test(checkIn) || !ISO_DATE.test(checkOut) || Number.isNaN(Date.parse(checkIn)) || Number.isNaN(Date.parse(checkOut))) {
    return fail(400, "Datas inválidas.");
  }
  if (checkIn < today) return fail(400, "O check-in não pode ser no passado.");
  if (checkOut <= checkIn) return fail(400, "O check-out precisa ser depois do check-in.");
  if ((Date.parse(checkOut) - Date.parse(checkIn)) / 86400000 > 60) return fail(400, "Reservas online vão até 60 noites — para estadias maiores, fale com a equipe.");
  if (checkIn > shiftDays(today, 730)) return fail(400, "Reservas online podem ser feitas com até 2 anos de antecedência.");
  if (!Number.isInteger(adults) || adults < 1 || adults > 30 || children < 0 || children > 30) {
    return fail(400, "Número de hóspedes inválido.");
  }

  const { data: pousadaRow } = await supabase.from("pousadas").select("*").eq("id", pousadaId).maybeSingle();
  if (!pousadaRow) return fail(404, "Pousada não encontrada.");
  if ("publicacao" in pousadaRow && pousadaRow.publicacao && pousadaRow.publicacao !== "publicada") return fail(404, "Esta pousada não está disponível para reservas no momento.");
  const pousada = mapPousadaRow(pousadaRow);
  // Reserva online só com o contrato de parceria assinado (comissão e
  // repasse definidos). Antes da migração (coluna inexistente), não bloqueia.
  if ("contratoId" in pousadaRow && !pousadaRow.contratoId && process.env.EXIGIR_CONTRATO !== "false") {
    return fail(403, "Esta pousada ainda está ativando as reservas online. Fale com a nossa equipe pelo WhatsApp para reservar.");
  }
  if ((pousada.rooms || []).length > 0 && !roomType) return fail(400, "Escolha o tipo de quarto.");
  const missingExperience = experienceTitles.find(title => !(pousada.experiences || []).some(e => e.title === title));
  if (missingExperience) return fail(400, `Experiência não encontrada nesta pousada: ${missingExperience}.`);
  const experienceType = experienceTitles.length ? experienceTitles.join(" + ").slice(0, 300) : undefined;

  // Pacote: preço por pessoa definido pelo admin e noites fixas.
  let pacote: Pacote | null = null;
  if (pacoteId) {
    pacote = await loadPacote(pacoteId);
    if (!pacote || !pacote.active || pacote.pousadaId !== pousadaId) return fail(400, "Este pacote não está mais disponível.");
    const noites = Math.round((Date.parse(checkOut) - Date.parse(checkIn)) / 86400000);
    if (noites !== pacote.nights) return fail(400, `Este pacote é de ${pacote.nights} noites.`);
  }
  const subtotal = pacote
    ? Math.round(pacotePricePerPerson(pacote) * (adults + children) * 100) / 100
    : computeBookingTotal(pousada, checkIn, checkOut, adults, experienceTitles);

  let cupom: Cupom | null = null;
  let discountAmount = 0;
  if (body.cupomCode) {
    const cr = await validarCupom(body.cupomCode, pousadaId, subtotal);
    if ("error" in cr) return fail(400, cr.error);
    cupom = cr.cupom;
    discountAmount = cr.discount;
  }

  const availability = await checkPousadaAvailability(pousada, checkIn, checkOut, adults + children, roomType);
  if (!availability.ok) return { ok: false, status: availability.status || 400, body: availability.body as Fail["body"] };

  const details = {
    arrivalTime: clip(body.details?.arrivalTime, 40),
    occasion: clip(body.details?.occasion, 120),
    needsTransfer: !!body.details?.needsTransfer,
    interests: clip(body.details?.interests, 500),
    notes: clip(body.details?.notes, 1000),
  };
  const detailsSummary = [
    pacote && `Pacote: ${pacote.name}`,
    cupom && `Cupom: ${cupom.code}`,
    details.arrivalTime && `Horário de chegada: ${details.arrivalTime}`,
    details.occasion && `Ocasião: ${details.occasion}`,
    details.needsTransfer && "Precisa de transfer",
    details.interests && `Interesses: ${details.interests}`,
    details.notes && `Observações: ${details.notes}`,
  ].filter(Boolean).join(" | ");

  const total = Math.round((subtotal - discountAmount) * 100) / 100;
  return {
    ok: true,
    pousada,
    pacote,
    cupom,
    subtotal,
    total,
    detailsSummary,
    base: {
      pousadaId,
      pousadaName: pousada.name,
      adults,
      children,
      childAges: clip(body.childAges, 200),
      dietaryRestrictions: clip(body.dietaryRestrictions, 500) || "Nenhuma",
      specialNeeds: clip(body.specialNeeds, 500) || "Nenhuma",
      checkIn,
      checkOut,
      experienceType: pacote ? `Pacote: ${pacote.name}` : experienceType || "Hospedagem",
      totalPrice: total,
      pacoteId: pacote?.id,
      cupomCode: cupom?.code,
      discountAmount: discountAmount || undefined,
      roomType,
      guestDetails: JSON.stringify(details),
    },
  };
}

export interface TouristProfile { id: string; email?: string; name: string; whatsapp?: string; country?: string }

// Grava a reserva preparada (pendente de pagamento), revalida a vaga já
// contando as outras e consome o cupom. Desfaz tudo se algo falhar.
export async function insertTouristBooking(
  prep: Prepared,
  user: TouristProfile,
  opts: { afiliadoCode?: unknown; pedidoId?: string; holdUntil?: string } = {}
): Promise<{ ok: true; booking: Record<string, any> } | Fail> {
  const booking: Record<string, any> = {
    id: `b_${randomUUID()}`,
    ...prep.base,
    customerName: user.name,
    customerEmail: user.email || "",
    customerPhone: user.whatsapp || "",
    nationality: user.country || "",
    // Comissão/afiliado/conservação congelados no momento da reserva; o
    // afiliado vem do link de indicação (?ref=) guardado no navegador.
    ...(await bookingFinance(prep.pousada, prep.total, opts.afiliadoCode)),
    status: "pendente_pagamento" as const,
    dateCreated: new Date().toISOString(),
    turistaId: user.id,
    origem: opts.pedidoId ? "carrinho" : "site",
    ...(opts.pedidoId ? { pedidoId: opts.pedidoId } : {}),
    ...(opts.holdUntil ? { holdUntil: opts.holdUntil } : {}),
  };

  const { error: insertErr, skipped } = await writeSkippingMissingColumns(booking, row => supabase.from("bookings").insert(row));
  if (isOverbookingError(insertErr)) return fail(409, OVERBOOKING_MESSAGE, { available: false });
  if (insertErr) {
    log.error("Erro ao salvar reserva online:", insertErr.message);
    return fail(500, "Não foi possível registrar sua reserva. Tente novamente.");
  }
  // Sem a coluna guestDetails (migração pendente), os detalhes não se
  // perdem: vão junto do campo de necessidades especiais.
  if (skipped.includes("guestDetails") && prep.detailsSummary) {
    await supabase.from("bookings").update({ specialNeeds: `${booking.specialNeeds} | ${prep.detailsSummary}`.slice(0, 1800) }).eq("id", booking.id);
  }

  // Duas reservas simultâneas podem passar pela checagem ao mesmo tempo —
  // revalida já contando a outra e desfaz esta se o quarto estourou.
  const recheck = await checkPousadaAvailability(prep.pousada, booking.checkIn, booking.checkOut, booking.adults + booking.children, booking.roomType, booking.id);
  if (!recheck.ok) {
    await supabase.from("bookings").delete().eq("id", booking.id);
    return fail(409, OVERBOOKING_MESSAGE, { available: false });
  }

  // Cupom consumido só depois da reserva confirmada no banco; se esgotou
  // no meio do caminho (corrida com outro uso), desfaz a reserva.
  if (prep.cupom && !(await registrarUsoCupom(prep.cupom))) {
    await supabase.from("bookings").delete().eq("id", booking.id);
    return fail(409, "Este cupom acabou de esgotar. Tente de novo sem o cupom.");
  }
  return { ok: true, booking };
}

// Perfil do turista logado (nome/WhatsApp/país vão na reserva).
export async function loadTouristProfile(user: { id: string; email?: string }): Promise<TouristProfile | null> {
  const { data: profile } = await supabase.from("turistas").select("name, whatsapp, country").eq("id", user.id).maybeSingle();
  if (!profile) return null;
  return { id: user.id, email: user.email, name: profile.name, whatsapp: profile.whatsapp || "", country: profile.country || "" };
}
