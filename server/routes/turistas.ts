// Conta do turista: cadastro, perfil, reservas online, favoritos, resgates.
import type { Express } from "express";
import { Turista, Pacote, Cupom, Booking, Resgate } from "../../src/types.js";
import { randomUUID } from "crypto";
import {
  ISO_DATE,
  OVERBOOKING_MESSAGE,
  SITE_URL,
  VISITED_BOOKING_STATUSES,
  addNotification,
  checkPousadaAvailability,
  checkoutLimiter,
  clip,
  computeBookingTotal,
  createBookingCheckoutSession,
  describeAuthError,
  escapeHtml,
  getPousadaGestorEmails,
  isOverbookingError,
  isTouristUser,
  isWeakPassword,
  loadPacote,
  log,
  mapPousadaRow,
  pacotePricePerPerson,
  publicFormLimiter,
  registrarUsoCupom,
  requireAnyAuth,
  requireTourist,
  resend,
  sanitizeTouristInterests,
  sendEmail,
  shiftDays,
  stripe,
  supabase,
  supabaseAdminAuth,
  validarCupom,
  writeSkippingMissingColumns,
} from "../core.js";

export function registerTuristasRoutes(app: Express) {

// TURISTA SELF-SERVICE (Supabase Auth) — unlike admin/partner (invite-only,
// provisioned by an admin), a tourist creates their own account: no vetting
// needed, this is just the "profile required to review" gate (see
// requireTourist above and POST /api/reviews below). The "turistas" row IS
// the profile the gate checks for — it's the same table TURISTAS CRUD above
// already exposes to the admin, just with the row's id set to the Supabase
// Auth user id itself (instead of a t_ prefix) so a self-service signup and
// its account are the same lookup.
app.post("/api/turista/signup", publicFormLimiter, async (req, res) => {
  if (!supabaseAdminAuth) return res.status(503).json({ error: "SUPABASE_SERVICE_ROLE_KEY não configurada — cadastro de turista indisponível." });

  const email = String(req.body.email || "").trim().toLowerCase();
  const password = String(req.body.password || "");
  const confirmPassword = String(req.body.confirmPassword || "");
  const name = String(req.body.name || "").trim();
  const whatsapp = String(req.body.whatsapp || "").trim();
  const country = String(req.body.country || "").trim();
  const language = String(req.body.language || "").trim();
  const age = Number(req.body.age);
  const preferences = String(req.body.preferences || "").trim();

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: "Informe um email válido." });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: "A senha precisa ter pelo menos 8 caracteres." });
  }
  if (isWeakPassword(password)) {
    return res.status(400).json({ error: "Essa senha é fácil demais de adivinhar. Use uma combinação de letras e números que não seja óbvia." });
  }
  if (password !== confirmPassword) {
    return res.status(400).json({ error: "As senhas não coincidem." });
  }
  // All profile fields are mandatory at signup — a "perfil de turista"
  // that's just an empty shell defeats the point of requiring one to review.
  if (!name || !whatsapp || !country || !language || !Number.isFinite(age) || age <= 0) {
    return res.status(400).json({ error: "Preencha nome, WhatsApp, país, idioma e idade." });
  }

  // Só exige a confirmação de email de verdade quando dá pra mandar o link
  // (Resend configurado) — sem isso, cai pro comportamento antigo (conta já
  // confirmada, login imediato) pra não travar o cadastro em ambientes sem
  // Resend configurado ainda.
  const requireEmailConfirmation = !!resend;

  const { data: created, error: createErr } = await supabaseAdminAuth.auth.admin.createUser({
    email,
    password,
    email_confirm: !requireEmailConfirmation,
    app_metadata: { role: "tourist" },
  });
  if (createErr || !created.user) {
    return res.status(400).json({ error: describeAuthError(createErr, "Erro ao criar sua conta (o email já pode estar em uso).") });
  }

  const interests = sanitizeTouristInterests(req.body.interests);
  const newTurista: Turista = { id: created.user.id, name, email, whatsapp, country, language, age, preferences, interests };
  const { error: insertErr } = await supabase.from("turistas").insert(newTurista);
  if (insertErr) {
    // Don't leave a bare auth account behind with no profile row — it would
    // pass requireTourist's role check but have nothing for a review to use.
    await supabaseAdminAuth.auth.admin.deleteUser(created.user.id).catch(() => {});
    log.error("Erro ao salvar perfil de turista no Supabase:", insertErr.message);
    return res.status(500).json({ error: "Erro ao criar seu perfil." });
  }

  if (!requireEmailConfirmation) {
    return res.status(201).json({ success: true, emailConfirmationSent: false });
  }

  // Gera o link de confirmação e manda pelo Resend — mesmo padrão já usado
  // pro convite de admin/parceiro (server-to-server, não depende do envio de
  // email nativo do Supabase, que precisa de SMTP configurado à parte).
  // redirectTo aponta de volta pra /turista, a mesma aba onde a pessoa criou
  // o cadastro — ao clicar, o Supabase já autentica a sessão e essa página
  // detecta o login sozinha, sem precisar de nenhum passo extra.
  const { data: linkData, error: linkErr } = await supabaseAdminAuth.auth.admin.generateLink({
    type: "signup",
    email,
    password,
    options: { redirectTo: `${SITE_URL}/turista` },
  });
  if (linkErr || !linkData?.properties?.action_link) {
    log.warn("Turista criado, mas falha ao gerar link de confirmação:", linkErr?.message);
    await supabaseAdminAuth.auth.admin.updateUserById(created.user.id, { email_confirm: true }).catch(() => {});
    return res.status(201).json({ success: true, emailConfirmationSent: false });
  }

  const sent = await sendEmail({
      to: email,
      subject: "Confirme seu email — EcoSafari Brasil",
      html: `
        <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
          <h2 style="color: #101B4C;">Bem-vindo(a) à EcoSafari! 🌿</h2>
          <p>Olá, ${escapeHtml(name)}! Falta só um passo: confirme seu email pra ativar seu perfil de turista e fazer suas reservas.</p>
          <p><a href="${linkData.properties.action_link}" style="display:inline-block; background:#101B4C; color:#fff; padding:10px 20px; text-decoration:none; border-radius:4px;">Confirmar meu email</a></p>
          <p style="color: #888; font-size: 12px;">Se o botão não funcionar, copie e cole este link no navegador:<br/>${linkData.properties.action_link}</p>
        </div>
      `,
    });
  if (sent.ok) return res.status(201).json({ success: true, emailConfirmationSent: true });

  // Não deixa a pessoa presa numa conta que nunca vai poder confirmar: se o
  // email não saiu, confirma a conta e segue com login direto.
  await supabaseAdminAuth.auth.admin.updateUserById(created.user.id, { email_confirm: true }).catch(() => {});
  res.status(201).json({ success: true, emailConfirmationSent: false });
});

// Recuperação de senha de parceiro/colaborador pelo Resend. Resposta
// sempre igual pra não revelar quais emails têm conta.
app.post("/api/auth/forgot-password", publicFormLimiter, async (req, res) => {
  const generic = { success: true };
  const email = String(req.body.email || "").trim().toLowerCase();
  if (!supabaseAdminAuth || !resend || !/^[^s@]+@[^s@]+.[^s@]+$/.test(email)) return res.json(generic);
  const { data } = await supabaseAdminAuth.auth.admin.listUsers({ perPage: 1000 });
  const user = (data?.users || []).find((u: any) => u.email?.toLowerCase() === email);
  const role = user?.app_metadata?.role;
  if (!user || (role !== "partner" && role !== "colaborador")) return res.json(generic);
  const { data: linkData, error } = await supabaseAdminAuth.auth.admin.generateLink({
    type: "recovery",
    email,
    options: { redirectTo: `${SITE_URL}/parceiro` },
  });
  const link = linkData?.properties?.action_link;
  if (error || !link) {
    log.warn("Falha ao gerar link de recuperação:", error?.message);
    return res.json(generic);
  }
  await sendEmail({
    to: email,
    subject: "Redefinir sua senha — EcoSafari Brasil",
    html: `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
        <h2 style="color: #101B4C;">Redefinir senha</h2>
        <p>Recebemos um pedido para redefinir a senha do seu acesso ao portal EcoSafari.</p>
        <p><a href="${link}" style="display:inline-block; background:#101B4C; color:#fff; padding:10px 20px; text-decoration:none; border-radius:4px;">Criar nova senha</a></p>
        <p style="color: #888; font-size: 12px;">Se você não pediu isso, ignore este email — sua senha continua a mesma.</p>
      </div>
    `,
  });
  res.json(generic);
});

// Reenvia o link de confirmação. Resposta sempre igual (exista ou não a
// conta) pra não servir de verificador de quais emails estão cadastrados.
app.post("/api/turista/resend-confirmation", publicFormLimiter, async (req, res) => {
  const generic = { success: true, message: "Se houver um cadastro pendente com esse email, enviamos um novo link." };
  const email = String(req.body.email || "").trim().toLowerCase();
  if (!supabaseAdminAuth || !resend || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.json(generic);

  const { data } = await supabaseAdminAuth.auth.admin.listUsers({ perPage: 1000 });
  const user = (data?.users || []).find((u: any) => u.email?.toLowerCase() === email);
  if (!user || user.email_confirmed_at || user.app_metadata?.role !== "tourist") return res.json(generic);

  const { data: linkData, error: linkErr } = await supabaseAdminAuth.auth.admin.generateLink({
    type: "magiclink",
    email,
    options: { redirectTo: `${SITE_URL}/turista` },
  });
  const link = linkData?.properties?.action_link;
  if (linkErr || !link) {
    log.warn("Falha ao gerar novo link de confirmação:", linkErr?.message);
    return res.json(generic);
  }
  await sendEmail({
    to: email,
    subject: "Confirme seu email — EcoSafari Brasil",
    html: `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
        <h2 style="color: #101B4C;">Confirme seu email 🌿</h2>
        <p>Clique no botão abaixo para ativar seu perfil de turista na EcoSafari.</p>
        <p><a href="${link}" style="display:inline-block; background:#101B4C; color:#fff; padding:10px 20px; text-decoration:none; border-radius:4px;">Confirmar meu email</a></p>
        <p style="color: #888; font-size: 12px;">Se você não pediu isso, pode ignorar este email.</p>
      </div>
    `,
  });
  res.json(generic);
});

// Reserva online feita pelo próprio turista (logado), direto da página da
// pousada — sem depender do WhatsApp. Preço e disponibilidade são sempre
// decididos aqui no servidor.
app.post("/api/turista/bookings", checkoutLimiter, requireTourist, async (req, res) => {
  const user = res.locals.touristUser as { id: string; email?: string };
  const pousadaId = clip(req.body.pousadaId, 100);
  const checkIn = clip(req.body.checkIn, 10);
  const checkOut = clip(req.body.checkOut, 10);
  const adults = Math.trunc(Number(req.body.adults));
  const children = Math.trunc(Number(req.body.children) || 0);
  const roomType = clip(req.body.roomType, 120) || undefined;
  const experienceType = clip(req.body.experienceType, 200) || undefined;
  const pacoteId = clip(req.body.pacoteId, 100) || undefined;

  const today = new Date().toISOString().slice(0, 10);
  if (!ISO_DATE.test(checkIn) || !ISO_DATE.test(checkOut) || Number.isNaN(Date.parse(checkIn)) || Number.isNaN(Date.parse(checkOut))) {
    return res.status(400).json({ error: "Datas inválidas." });
  }
  if (checkIn < today) return res.status(400).json({ error: "O check-in não pode ser no passado." });
  if (checkOut <= checkIn) return res.status(400).json({ error: "O check-out precisa ser depois do check-in." });
  if ((Date.parse(checkOut) - Date.parse(checkIn)) / 86400000 > 60) return res.status(400).json({ error: "Reservas online vão até 60 noites — para estadias maiores, fale com a equipe." });
  if (checkIn > shiftDays(today, 730)) return res.status(400).json({ error: "Reservas online podem ser feitas com até 2 anos de antecedência." });
  if (!Number.isInteger(adults) || adults < 1 || adults > 30 || children < 0 || children > 30) {
    return res.status(400).json({ error: "Número de hóspedes inválido." });
  }

  const { data: pousadaRow } = await supabase.from("pousadas").select("*").eq("id", pousadaId).maybeSingle();
  if (!pousadaRow) return res.status(404).json({ error: "Pousada não encontrada." });
  const pousada = mapPousadaRow(pousadaRow);
  if ((pousada.rooms || []).length > 0 && !roomType) return res.status(400).json({ error: "Escolha o tipo de quarto." });
  if (experienceType && !(pousada.experiences || []).some(e => e.title === experienceType)) {
    return res.status(400).json({ error: "Experiência não encontrada nesta pousada." });
  }

  // Pacote: preço por pessoa definido pelo admin e noites fixas.
  let pacote: Pacote | null = null;
  if (pacoteId) {
    pacote = await loadPacote(pacoteId);
    if (!pacote || !pacote.active || pacote.pousadaId !== pousadaId) return res.status(400).json({ error: "Este pacote não está mais disponível." });
    const noites = Math.round((Date.parse(checkOut) - Date.parse(checkIn)) / 86400000);
    if (noites !== pacote.nights) return res.status(400).json({ error: `Este pacote é de ${pacote.nights} noites.` });
  }
  const subtotal = pacote
    ? Math.round(pacotePricePerPerson(pacote) * (adults + children) * 100) / 100
    : computeBookingTotal(pousada, checkIn, checkOut, adults, experienceType);

  let cupom: Cupom | null = null;
  let discountAmount = 0;
  if (req.body.cupomCode) {
    const cr = await validarCupom(req.body.cupomCode, pousadaId, subtotal);
    if ("error" in cr) return res.status(400).json({ error: cr.error });
    cupom = cr.cupom;
    discountAmount = cr.discount;
  }

  const { data: profile } = await supabase.from("turistas").select("name, whatsapp, country").eq("id", user.id).maybeSingle();
  if (!profile) return res.status(403).json({ error: "Complete seu perfil de turista antes de reservar." });

  const availability = await checkPousadaAvailability(pousada, checkIn, checkOut, adults + children, roomType);
  if (!availability.ok) return res.status(availability.status || 400).json(availability.body);

  const details = {
    arrivalTime: clip(req.body.details?.arrivalTime, 40),
    occasion: clip(req.body.details?.occasion, 120),
    needsTransfer: !!req.body.details?.needsTransfer,
    interests: clip(req.body.details?.interests, 500),
    notes: clip(req.body.details?.notes, 1000),
  };
  const detailsSummary = [
    pacote && `Pacote: ${pacote.name}`,
    cupom && `Cupom: ${cupom.code}`,
    details.arrivalTime && `Chegada prevista: ${details.arrivalTime}`,
    details.occasion && `Ocasião: ${details.occasion}`,
    details.needsTransfer && "Precisa de transfer",
    details.interests && `Interesses: ${details.interests}`,
    details.notes && `Observações: ${details.notes}`,
  ].filter(Boolean).join(" | ");

  const newBooking = {
    id: `b_${randomUUID()}`,
    pousadaId,
    pousadaName: pousada.name,
    customerName: profile.name,
    customerEmail: user.email || "",
    customerPhone: profile.whatsapp || "",
    nationality: profile.country || "",
    adults,
    children,
    childAges: clip(req.body.childAges, 200),
    dietaryRestrictions: clip(req.body.dietaryRestrictions, 500) || "Nenhuma",
    specialNeeds: clip(req.body.specialNeeds, 500) || "Nenhuma",
    checkIn,
    checkOut,
    experienceType: pacote ? `Pacote: ${pacote.name}` : experienceType || "Hospedagem",
    totalPrice: Math.round((subtotal - discountAmount) * 100) / 100,
    pacoteId: pacote?.id,
    cupomCode: cupom?.code,
    discountAmount: discountAmount || undefined,
    status: "pendente_pagamento" as const,
    dateCreated: new Date().toISOString(),
    roomType,
    turistaId: user.id,
    guestDetails: JSON.stringify(details),
    origem: "site",
  };

  const { error: insertErr, skipped } = await writeSkippingMissingColumns(newBooking, row => supabase.from("bookings").insert(row));
  if (isOverbookingError(insertErr)) return res.status(409).json({ error: OVERBOOKING_MESSAGE, available: false });
  if (insertErr) {
    log.error("Erro ao salvar reserva online:", insertErr.message);
    return res.status(500).json({ error: "Não foi possível registrar sua reserva. Tente novamente." });
  }
  // Sem a coluna guestDetails (migração pendente), os detalhes não se
  // perdem: vão junto do campo de necessidades especiais.
  if (skipped.includes("guestDetails") && detailsSummary) {
    await supabase.from("bookings").update({ specialNeeds: `${newBooking.specialNeeds} | ${detailsSummary}`.slice(0, 1800) }).eq("id", newBooking.id);
  }

  // Duas reservas simultâneas podem passar pela checagem ao mesmo tempo —
  // revalida já contando a outra e desfaz esta se o quarto estourou.
  const recheck = await checkPousadaAvailability(pousada, checkIn, checkOut, adults + children, roomType, newBooking.id);
  if (!recheck.ok) {
    await supabase.from("bookings").delete().eq("id", newBooking.id);
    return res.status(409).json({ error: OVERBOOKING_MESSAGE, available: false });
  }

  // Cupom consumido só depois da reserva confirmada no banco; se esgotou
  // no meio do caminho (corrida com outro uso), desfaz a reserva.
  if (cupom && !(await registrarUsoCupom(cupom))) {
    await supabase.from("bookings").delete().eq("id", newBooking.id);
    return res.status(409).json({ error: "Este cupom acabou de esgotar. Tente de novo sem o cupom." });
  }

  addNotification("admin", `Nova reserva online: ${newBooking.customerName} na ${newBooking.pousadaName} (${checkIn} a ${checkOut}).`, "booking_new", newBooking.id);
  addNotification("pousada", `Nova reserva online de ${newBooking.customerName} (${checkIn} a ${checkOut}).`, "booking_new", newBooking.id);

  for (const gestorEmail of await getPousadaGestorEmails(pousadaId)) {
    await sendEmail({
      to: gestorEmail,
      subject: `Nova reserva online — ${pousada.name}`,
      html: `
        <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
          <h2 style="color: #101B4C;">Nova reserva pelo site 🌿</h2>
          <p><strong>${escapeHtml(newBooking.customerName)}</strong> reservou de <strong>${checkIn}</strong> a <strong>${checkOut}</strong> (${adults} adulto(s), ${children} criança(s))${roomType ? ` — ${escapeHtml(roomType)}` : ""}.</p>
          ${detailsSummary ? `<p style="color:#555">${escapeHtml(detailsSummary)}</p>` : ""}
          <p>A reserva aparece na sua Agenda de Reservas. Ela fica como "pendente de pagamento" até o hóspede pagar.</p>
          <p><a href="${SITE_URL}/parceiro" style="display:inline-block; background:#101B4C; color:#fff; padding:10px 20px; text-decoration:none; border-radius:4px;">Abrir minha agenda</a></p>
        </div>
      `,
    });
  }

  let checkoutUrl: string | null = null;
  if (stripe) {
    try {
      checkoutUrl = await createBookingCheckoutSession(newBooking as Booking);
    } catch (err: any) {
      log.warn("Reserva online criada, mas falha ao abrir o checkout:", err.message);
    }
  }

  res.status(201).json({
    booking: { id: newBooking.id, pousadaName: newBooking.pousadaName, checkIn, checkOut, totalPrice: newBooking.totalPrice, status: newBooking.status },
    checkoutUrl,
  });
});

// Minhas reservas — casadas pelo email da conta (funciona mesmo em reservas
// antigas criadas pelo admin, que não têm turistaId).
app.get("/api/turista/bookings", requireTourist, async (req, res) => {
  const user = res.locals.touristUser as { email?: string };
  if (!user.email) return res.json([]);
  const { data, error } = await supabase
    .from("bookings")
    .select("id, pousadaId, pousadaName, checkIn, checkOut, adults, children, roomType, experienceType, totalPrice, status, dateCreated")
    .eq("customerEmail", user.email)
    .order("checkIn", { ascending: false });
  if (error) return res.status(500).json({ error: "Erro ao buscar suas reservas." });
  res.json(data || []);
});

// Retomar o pagamento de uma reserva própria que ficou pendente.
app.post("/api/turista/bookings/:id/pagar", checkoutLimiter, requireTourist, async (req, res) => {
  const user = res.locals.touristUser as { email?: string };
  if (!stripe) return res.status(503).json({ error: "Pagamento online ainda não está ativo — a equipe vai te enviar o link de pagamento." });
  const { data: booking } = await supabase.from("bookings").select("*").eq("id", req.params.id).maybeSingle();
  if (!booking || !user.email || booking.customerEmail !== user.email) return res.status(404).json({ error: "Reserva não encontrada." });
  if (booking.status !== "pendente_pagamento") return res.status(409).json({ error: "Esta reserva não está aguardando pagamento." });
  try {
    res.json({ url: await createBookingCheckoutSession(booking as Booking) });
  } catch (err: any) {
    log.error("Erro ao criar checkout para reserva do turista:", err.message);
    res.status(500).json({ error: "Erro ao abrir o pagamento." });
  }
});

app.get("/api/turista/me", requireTourist, async (req, res) => {
  const userId = (res.locals.touristUser as { id: string }).id;
  const { data, error } = await supabase.from("turistas").select("*").eq("id", userId).maybeSingle();
  if (error || !data) return res.status(404).json({ error: "Perfil de turista não encontrado." });
  res.json(data as Turista);
});

// Edição do próprio perfil — nunca mexe em email/coins aqui: email é a
// identidade de login (mudar exigiria reautenticação), coins só espelham o
// saldo do app via POST /api/integrations/app-coins-sync, nunca são
// escritas pelo próprio turista.
app.put("/api/turista/me", requireTourist, async (req, res) => {
  const userId = (res.locals.touristUser as { id: string }).id;

  // Esta mesma rota também é usada por ações rápidas que só mexem num campo
  // — marcar/desmarcar um interesse, trocar a foto (ver handleToggleInterest/
  // handlePhotoUploaded em TuristaProfileView.tsx) — sem passar pelo
  // formulário completo de edição. Antes, exigir todos os campos (inclusive
  // "idioma") preenchidos em TODA chamada quebrava essas ações pra quem
  // ainda não tinha completado o perfil: o toggle de interesse "voltava"
  // sozinho e o upload de foto caía direto no "Erro ao salvar". Agora só
  // valida o que veio preenchido na requisição; o que não veio mantém o
  // valor que já estava salvo.
  const { data: current, error: currentError } = await supabase.from("turistas").select("*").eq("id", userId).maybeSingle();
  if (currentError || !current) return res.status(404).json({ error: "Perfil não encontrado." });

  const pick = (key: string, fallback: string) => {
    const raw = req.body[key];
    if (raw === undefined) return fallback;
    const trimmed = String(raw).trim();
    return trimmed || fallback;
  };
  const name = pick("name", current.name);
  const whatsapp = pick("whatsapp", current.whatsapp);
  const country = pick("country", current.country);
  const language = pick("language", current.language);
  const preferences = pick("preferences", current.preferences);
  const age = req.body.age !== undefined && Number.isFinite(Number(req.body.age)) && Number(req.body.age) > 0
    ? Number(req.body.age)
    : current.age;
  if (!name || !Number.isFinite(age) || age <= 0) {
    return res.status(400).json({ error: "Preencha ao menos nome e idade." });
  }
  const interests = req.body.interests !== undefined ? sanitizeTouristInterests(req.body.interests) : current.interests;
  // Opcionais — só são enviados quando a pessoa troca a foto de perfil ou de
  // capa (ver ImageUploadButton em TuristaProfileView.tsx); omitidos, o
  // UPDATE simplesmente não mexe neles.
  const photoUrl = typeof req.body.photoUrl === "string" ? req.body.photoUrl.trim() : undefined;
  const coverPhotoUrl = typeof req.body.coverPhotoUrl === "string" ? req.body.coverPhotoUrl.trim() : undefined;

  const { data, error } = await supabase
    .from("turistas")
    .update({
      name, whatsapp, country, language, age, preferences, interests,
      ...(photoUrl !== undefined ? { photoUrl } : {}),
      ...(coverPhotoUrl !== undefined ? { coverPhotoUrl } : {}),
    })
    .eq("id", userId)
    .select()
    .maybeSingle();
  if (error || !data) return res.status(500).json({ error: "Erro ao salvar seu perfil." });
  res.json(data as Turista);
});

// Direito de acesso/portabilidade (LGPD art. 18, incisos I/V) — um dump de
// tudo que está vinculado a este turista, pra ele baixar sozinho sem
// precisar pedir pra equipe. Junta os mesmos dados que já existem
// espalhados em /favoritos, /visitados, /resgates, num JSON só.
app.get("/api/turista/me/export", requireTourist, async (req, res) => {
  const user = res.locals.touristUser as { id: string; email?: string };
  const [profileRes, favoritosRes, resgatesRes, reviewsRes, bookingsRes] = await Promise.all([
    supabase.from("turistas").select("*").eq("id", user.id).maybeSingle(),
    supabase.from("turista_favoritos").select("pousadaId").eq("turistaId", user.id),
    supabase.from("turista_resgates").select("*").eq("turistaId", user.id),
    supabase.from("reviews").select("id,pousadaId,atracaoId,guideId,rating,comment,date,photoUrl").eq("turistaId", user.id),
    user.email
      ? supabase.from("bookings").select("id,pousadaName,checkIn,checkOut,status,totalPrice").eq("customerEmail", user.email)
      : Promise.resolve({ data: [] as unknown[] }),
  ]);

  res.setHeader("Content-Disposition", `attachment; filename="ecosafari-meus-dados-${new Date().toISOString().slice(0, 10)}.json"`);
  res.json({
    exportedAt: new Date().toISOString(),
    perfil: profileRes.data,
    favoritos: favoritosRes.data || [],
    resgates: resgatesRes.data || [],
    avaliacoes: reviewsRes.data || [],
    reservas: bookingsRes.data || [],
  });
});

// Direito de eliminação (LGPD art. 18, inciso VI) — apaga o perfil e os
// dados diretamente pessoais (favoritos), remove a conta de autenticação, e
// ANONIMIZA (não apaga) as avaliações já publicadas: o nome vira "Usuário
// removido", mas a nota/comentário continua valendo pro histórico da
// pousada/guia avaliado — mesma lógica de qualquer loja que mantém reviews
// depois que o autor fecha a conta. Resgates não são tocados: são registro
// de uma transação já concluída com o parceiro (código já usado/pendente),
// não dado pessoal solto.
app.delete("/api/turista/me", requireTourist, async (req, res) => {
  const user = res.locals.touristUser as { id: string };
  if (!supabaseAdminAuth) {
    return res.status(503).json({ error: "SUPABASE_SERVICE_ROLE_KEY não configurada — não é possível excluir a conta agora." });
  }

  await supabase.from("reviews").update({ userName: "Usuário removido", photoUrl: null }).eq("turistaId", user.id);
  await supabase.from("turista_favoritos").delete().eq("turistaId", user.id);
  await supabase.from("turistas").delete().eq("id", user.id);
  const { error: deleteAuthErr } = await supabaseAdminAuth.auth.admin.deleteUser(user.id);
  if (deleteAuthErr) {
    log.error("Erro ao excluir conta de autenticação do turista:", deleteAuthErr.message);
    return res.status(500).json({ error: "Seu perfil foi removido, mas houve um erro ao excluir a conta de login. Fale com a equipe pra concluir." });
  }

  res.json({ success: true });
});

// Deixa uma conta já autenticada (admin, parceiro...) virar turista também,
// SEM criar uma segunda conta desconectada — só acrescenta isTourist=true ao
// app_metadata que a conta já tem (nunca mexe em role/isAdmin/partnerType já
// existentes) e cria o perfil em "turistas" com o mesmo id/email. Não pede
// email nem senha porque a pessoa já está logada; só falta o perfil.
app.post("/api/turista/upgrade", requireAnyAuth, async (req, res) => {
  if (!supabaseAdminAuth) return res.status(503).json({ error: "SUPABASE_SERVICE_ROLE_KEY não configurada — não é possível virar turista agora." });
  const user = res.locals.authUser as { id: string; email?: string; app_metadata?: Record<string, unknown> };

  if (isTouristUser(user)) {
    return res.status(400).json({ error: "Esta conta já tem um perfil de turista." });
  }
  const email = String(user.email || "").trim().toLowerCase();
  if (!email) return res.status(400).json({ error: "Esta conta não tem um email associado." });

  const name = String(req.body.name || "").trim();
  const whatsapp = String(req.body.whatsapp || "").trim();
  const country = String(req.body.country || "").trim();
  const language = String(req.body.language || "").trim();
  const age = Number(req.body.age);
  const preferences = String(req.body.preferences || "").trim();
  if (!name || !whatsapp || !country || !language || !Number.isFinite(age) || age <= 0) {
    return res.status(400).json({ error: "Preencha nome, WhatsApp, país, idioma e idade." });
  }

  const mergedMetadata = { ...(user.app_metadata || {}), isTourist: true };
  const { error: updateErr } = await supabaseAdminAuth.auth.admin.updateUserById(user.id, { app_metadata: mergedMetadata });
  if (updateErr) return res.status(500).json({ error: describeAuthError(updateErr, "Erro ao ativar o perfil de turista.") });

  const interests = sanitizeTouristInterests(req.body.interests);
  const newTurista: Turista = { id: user.id, name, email, whatsapp, country, language, age, preferences, interests };
  const { error: insertErr } = await supabase.from("turistas").insert(newTurista);
  if (insertErr) {
    // Desfaz o isTourist se não conseguiu criar o perfil — não deixa a conta
    // passando no requireTourist sem ter uma linha em "turistas" pra usar.
    await supabaseAdminAuth.auth.admin.updateUserById(user.id, { app_metadata: user.app_metadata || {} }).catch(() => {});
    log.error("Erro ao salvar perfil de turista no Supabase:", insertErr.message);
    return res.status(500).json({ error: "Erro ao criar seu perfil de turista." });
  }

  res.status(201).json({ success: true });
});

app.get("/api/turista/visitados", requireTourist, async (req, res) => {
  const email = (res.locals.touristUser as { email?: string }).email;
  if (!email) return res.json([]);
  const { data, error } = await supabase
    .from("bookings")
    .select("pousadaId,pousadaName,checkIn,checkOut,status")
    .eq("customerEmail", email)
    .in("status", VISITED_BOOKING_STATUSES);
  if (error) return res.status(500).json({ error: "Erro ao buscar histórico de visitas." });
  // Uma pousada só aparece uma vez, mesmo com várias reservas — mostra a
  // estadia mais recente.
  const byPousada = new Map<string, any>();
  for (const b of data || []) {
    const existing = byPousada.get(b.pousadaId);
    if (!existing || b.checkIn > existing.checkIn) byPousada.set(b.pousadaId, b);
  }
  res.json(Array.from(byPousada.values()));
});

// ----------------------------------------------------
// FAVORITOS — pousadas que um turista logado marcou como "gostei". Alimenta
// o widget de perfil no cabeçalho e a lista de favoritos.
// ----------------------------------------------------

app.get("/api/turista/favoritos", requireTourist, async (req, res) => {
  const userId = (res.locals.touristUser as { id: string }).id;
  const { data: favs, error } = await supabase.from("turista_favoritos").select("pousadaId").eq("turistaId", userId);
  if (error) return res.status(500).json({ error: "Erro ao buscar favoritos." });
  const ids = (favs || []).map((f: any) => f.pousadaId);
  if (ids.length === 0) return res.json([]);
  const { data: rows } = await supabase.from("pousadas").select("*").in("id", ids);
  res.json((rows || []).map(mapPousadaRow));
});

app.post("/api/turista/favoritos/:pousadaId", requireTourist, async (req, res) => {
  const userId = (res.locals.touristUser as { id: string }).id;
  const { pousadaId } = req.params;
  const { data: pousada } = await supabase.from("pousadas").select("id").eq("id", pousadaId).maybeSingle();
  if (!pousada) return res.status(404).json({ error: "Pousada não encontrada." });
  const { error } = await supabase.from("turista_favoritos").upsert({ turistaId: userId, pousadaId }, { onConflict: "turistaId,pousadaId" });
  if (error) return res.status(500).json({ error: "Erro ao favoritar pousada." });
  res.status(201).json({ success: true });
});

app.delete("/api/turista/favoritos/:pousadaId", requireTourist, async (req, res) => {
  const userId = (res.locals.touristUser as { id: string }).id;
  const { error } = await supabase.from("turista_favoritos").delete().eq("turistaId", userId).eq("pousadaId", req.params.pousadaId);
  if (error) return res.status(500).json({ error: "Erro ao remover favorito." });
  res.json({ success: true });
});

// ----------------------------------------------------
// POSTS DO TURISTA — um diário pessoal de viagem no próprio perfil (texto +
// foto opcional). Só o próprio turista vê os próprios posts — não existe
// perfil público de turista nem feed compartilhado nesta plataforma.
// ----------------------------------------------------
app.get("/api/turista/posts", requireTourist, async (req, res) => {
  const userId = (res.locals.touristUser as { id: string }).id;
  const { data, error } = await supabase.from("turista_posts").select("*").eq("turistaId", userId).order("createdAt", { ascending: false });
  if (error) return res.status(500).json({ error: "Erro ao buscar posts." });
  res.json(data);
});

app.post("/api/turista/posts", requireTourist, async (req, res) => {
  const userId = (res.locals.touristUser as { id: string }).id;
  const text = String(req.body.text || "").trim();
  const photoUrl = typeof req.body.photoUrl === "string" ? req.body.photoUrl.trim() : "";
  if (!text && !photoUrl) return res.status(400).json({ error: "Escreva algo ou adicione uma foto." });
  const newPost = { id: `tp_${randomUUID()}`, turistaId: userId, text, photoUrl: photoUrl || null, createdAt: new Date().toISOString() };
  const { error } = await supabase.from("turista_posts").insert(newPost);
  if (error) return res.status(500).json({ error: "Erro ao publicar." });
  res.status(201).json(newPost);
});

app.delete("/api/turista/posts/:id", requireTourist, async (req, res) => {
  const userId = (res.locals.touristUser as { id: string }).id;
  const { error } = await supabase.from("turista_posts").delete().eq("id", req.params.id).eq("turistaId", userId);
  if (error) return res.status(500).json({ error: "Erro ao excluir post." });
  res.json({ success: true });
});

app.post("/api/turista/resgates", requireTourist, async (req, res) => {
  const userId = (res.locals.touristUser as { id: string }).id;
  const { recompensaId } = req.body;

  const { data: recompensa } = await supabase.from("pousada_recompensas").select("*").eq("id", recompensaId).maybeSingle();
  if (!recompensa || !recompensa.active) return res.status(404).json({ error: "Recompensa não encontrada ou não está mais disponível." });

  const { data: turista } = await supabase.from("turistas").select("coins").eq("id", userId).maybeSingle();
  const currentCoins = turista?.coins || 0;
  if (currentCoins < recompensa.coinCost) {
    return res.status(400).json({ error: `Coins insuficientes — você tem ${currentCoins}, essa recompensa custa ${recompensa.coinCost}.` });
  }

  const newResgate: Resgate = {
    id: `rs_${randomUUID()}`,
    turistaId: userId,
    recompensaId,
    pousadaId: recompensa.pousadaId,
    coinCost: recompensa.coinCost,
    code: randomUUID().replace(/-/g, "").slice(0, 8).toUpperCase(),
    status: "pendente",
    createdAt: new Date().toISOString(),
  };

  const { error: insertErr } = await supabase.from("turista_resgates").insert(newResgate);
  if (insertErr) return res.status(500).json({ error: "Erro ao criar resgate." });

  const { error: updateErr } = await supabase.from("turistas").update({ coins: currentCoins - recompensa.coinCost }).eq("id", userId);
  if (updateErr) {
    // Desfaz o resgate se não conseguiu debitar as Coins — não deixa o
    // turista com um código válido sem ter pago por ele.
    await supabase.from("turista_resgates").delete().eq("id", newResgate.id);
    return res.status(500).json({ error: "Erro ao debitar Coins." });
  }

  res.status(201).json(newResgate);
});

app.get("/api/turista/resgates", requireTourist, async (req, res) => {
  const userId = (res.locals.touristUser as { id: string }).id;
  const { data, error } = await supabase.from("turista_resgates").select("*").eq("turistaId", userId).order("createdAt", { ascending: false });
  if (error) return res.status(500).json({ error: "Erro ao buscar resgates." });
  res.json(data);
});
}
