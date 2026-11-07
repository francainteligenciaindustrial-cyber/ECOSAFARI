// Conta do turista: cadastro, perfil, reservas online, favoritos, resgates.
import type { Express } from "express";
import { Turista, Pacote, Cupom, Booking, Resgate } from "../../src/types.js";
import { randomUUID } from "crypto";
import {
  addNotification,
  bookingFinance,
  CART_HOLD_MINUTES,
  checkoutLimiter,
  checkPousadaAvailability,
  clip,
  computeBookingTotal,
  createBookingCheckoutSession,
  describeAuthError,
  escapeHtml,
  getPousadaGestorEmails,
  ISO_DATE,
  isOverbookingError,
  isTouristUser,
  isWeakPassword,
  loadPacote,
  log,
  mapPousadaRow,
  OVERBOOKING_MESSAGE,
  pacotePricePerPerson,
  publicFormLimiter,
  registrarUsoCupom,
  requireAnyAuth,
  requireTourist,
  resend,
  sanitizeTouristInterests,
  sendEmail,
  shiftDays,
  SITE_URL,
  stripe,
  supabase,
  supabaseAdminAuth,
  validarCupom,
  VISITED_BOOKING_STATUSES,
  writeSkippingMissingColumns,
} from "../core.js";
import { insertTouristBooking, loadTouristProfile, prepareTouristBooking } from "../touristBooking.js";

// Novo link de confirmação para um turista que ainda não confirmou. Usa
// magiclink (não "signup"): não precisa da senha e, ao clicar, o Supabase
// confirma o email e já abre a sessão.
async function sendTouristConfirmationEmail(email: string, name?: string): Promise<boolean> {
  if (!supabaseAdminAuth) return false;
  const { data: linkData, error: linkErr } = await supabaseAdminAuth.auth.admin.generateLink({
    type: "magiclink",
    email,
    options: { redirectTo: `${SITE_URL}/turista` },
  });
  const link = linkData?.properties?.action_link;
  if (linkErr || !link) {
    log.warn("Falha ao gerar novo link de confirmação:", linkErr?.message);
    return false;
  }
  const sent = await sendEmail({
    to: email,
    subject: "Confirme seu email — Ipantanal",
    html: `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
        <h2 style="color: #0B1412;">Confirme seu email 🌿</h2>
        <p>${name ? `Olá, ${escapeHtml(name)}! ` : ""}Clique no botão abaixo para ativar seu perfil de turista na Ipantanal.</p>
        <p><a href="${link}" style="display:inline-block; background:#0B1412; color:#fff; padding:10px 20px; text-decoration:none; border-radius:999px;">Confirmar meu email</a></p>
        <p style="color: #888; font-size: 12px;">Se o botão não funcionar, copie e cole este link no navegador:<br/>${link}</p>
        <p style="color: #888; font-size: 12px;">Se você não pediu isso, pode ignorar este email.</p>
      </div>
    `,
  });
  return sent.ok;
}

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
  // Nome, WhatsApp e país são obrigatórios. Idioma e idade saíram do
  // cadastro (reunião de 20/10/2026): o idioma vem do idioma do site e
  // ambos continuam editáveis no perfil.
  if (!name || !whatsapp || !country) {
    return res.status(400).json({ error: "Preencha nome, WhatsApp e país." });
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
    // Email já cadastrado: se for um turista que nunca confirmou (o caso de
    // quem tenta de novo porque o primeiro email não chegou), reenvia o
    // link em vez de só dar erro. A senha NÃO é trocada pela nova — senão
    // qualquer um poderia definir a senha de um cadastro pendente alheio.
    const { data: list } = await supabaseAdminAuth.auth.admin.listUsers({ perPage: 1000 });
    const existing = (list?.users || []).find((u: any) => u.email?.toLowerCase() === email);
    if (existing && !existing.email_confirmed_at && existing.app_metadata?.role === "tourist") {
      const resent = await sendTouristConfirmationEmail(email, name);
      return res.status(resent ? 200 : 400).json(resent
        ? { success: true, emailConfirmationSent: true, alreadyRegistered: true }
        : { error: "Esse email já tem um cadastro aguardando confirmação, mas não conseguimos reenviar o link agora. Tente de novo em alguns minutos." });
    }
    if (existing) {
      return res.status(400).json({ error: "Já existe uma conta com esse email. Use \"Entrar\" (ou \"Esqueci minha senha\")." });
    }
    return res.status(400).json({ error: describeAuthError(createErr, "Erro ao criar sua conta.") });
  }

  const interests = sanitizeTouristInterests(req.body.interests);
  // Novidades por e-mail só com aceite explícito (LGPD): caixa desmarcada
  // por padrão no cadastro, editável depois no perfil.
  const marketingOptIn = req.body.marketingOptIn === true;
  const newTurista = {
    id: created.user.id, name, email, whatsapp, country,
    language: language || undefined,
    age: Number.isFinite(age) && age > 0 ? age : undefined,
    preferences, interests,
    marketingOptIn,
    marketingOptInAt: marketingOptIn ? new Date().toISOString() : null,
  };
  const { error: insertErr } = await writeSkippingMissingColumns(newTurista, row => supabase.from("turistas").insert(row));
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
      subject: "Confirme seu email — Ipantanal",
      html: `
        <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
          <h2 style="color: #0B1412;">Bem-vindo(a) à Ipantanal! 🌿</h2>
          <p>Olá, ${escapeHtml(name)}! Falta só um passo: confirme seu email pra ativar seu perfil de turista e fazer suas reservas.</p>
          <p><a href="${linkData.properties.action_link}" style="display:inline-block; background:#0B1412; color:#fff; padding:10px 20px; text-decoration:none; border-radius:999px;">Confirmar meu email</a></p>
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

// Recuperação de senha (parceiro, colaborador e turista) pelo Resend.
// Resposta sempre igual pra não revelar quais emails têm conta. O link
// volta para a tela de login de cada um, que pede a senha nova.
app.post("/api/auth/forgot-password", publicFormLimiter, async (req, res) => {
  const generic = { success: true };
  const email = String(req.body.email || "").trim().toLowerCase();
  if (!supabaseAdminAuth || !resend || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.json(generic);
  const { data } = await supabaseAdminAuth.auth.admin.listUsers({ perPage: 1000 });
  const user = (data?.users || []).find((u: any) => u.email?.toLowerCase() === email);
  const role = user?.app_metadata?.role;
  const isPortalUser = role === "partner" || role === "colaborador";
  if (!user || (!isPortalUser && !isTouristUser(user))) return res.json(generic);
  const { data: linkData, error } = await supabaseAdminAuth.auth.admin.generateLink({
    type: "recovery",
    email,
    options: { redirectTo: `${SITE_URL}${isPortalUser ? "/parceiro" : "/turista"}` },
  });
  const link = linkData?.properties?.action_link;
  if (error || !link) {
    log.warn("Falha ao gerar link de recuperação:", error?.message);
    return res.json(generic);
  }
  await sendEmail({
    to: email,
    subject: "Redefinir sua senha — Ipantanal",
    html: `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
        <h2 style="color: #0B1412;">Redefinir senha</h2>
        <p>Recebemos um pedido para redefinir a senha da sua conta Ipantanal.</p>
        <p><a href="${link}" style="display:inline-block; background:#0B1412; color:#fff; padding:10px 20px; text-decoration:none; border-radius:999px;">Criar nova senha</a></p>
        <p style="color: #888; font-size: 12px;">Se você não pediu isso, ignore este email — sua senha continua a mesma.</p>
      </div>
    `,
  });
  res.json(generic);
});

// Nome do lugar a partir das coordenadas (post do turista com local da
// foto). OpenStreetMap/Nominatim, pelo servidor: identifica o site no
// User-Agent (exigência da política de uso) e guarda em cache — a mesma
// região quase sempre se repete.
const reverseGeoCache = new Map<string, string>();
app.get("/api/geo/reverse", publicFormLimiter, async (req, res) => {
  const lat = Number(req.query.lat);
  const lng = Number(req.query.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    return res.status(400).json({ error: "Coordenadas inválidas." });
  }
  const key = `${lat.toFixed(2)},${lng.toFixed(2)}`;
  const cached = reverseGeoCache.get(key);
  if (cached !== undefined) return res.json({ name: cached });
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=12&accept-language=pt-BR&lat=${lat}&lon=${lng}`;
    const r = await fetch(url, { headers: { "User-Agent": `Ipantanal/1.0 (${SITE_URL})` }, signal: AbortSignal.timeout(6000) });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const body: any = await r.json();
    const a = body?.address || {};
    const place = a.city || a.town || a.village || a.municipality || a.hamlet || a.county || a.state_district || "";
    const name = [place, a.state].filter(Boolean).join(", ") || String(body?.display_name || "").split(",").slice(0, 2).join(",").trim();
    if (reverseGeoCache.size > 2000) reverseGeoCache.clear();
    reverseGeoCache.set(key, name);
    res.json({ name });
  } catch (err: any) {
    log.warn("Falha no reverse geocoding:", err?.message);
    res.json({ name: "" });
  }
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

  await sendTouristConfirmationEmail(email);
  res.json(generic);
});

// Reserva online feita pelo próprio turista (logado), direto da página da
// pousada — sem depender do WhatsApp. Preço e disponibilidade são sempre
// decididos aqui no servidor.
app.post("/api/turista/bookings", checkoutLimiter, requireTourist, async (req, res) => {
  const user = res.locals.touristUser as { id: string; email?: string };
  const profile = await loadTouristProfile(user);
  if (!profile) return res.status(403).json({ error: "Complete seu perfil de turista antes de reservar." });
  const prep = await prepareTouristBooking(req.body);
  if ("body" in prep) return res.status(prep.status).json(prep.body);
  // Com a Stripe ligada, a vaga fica segurada pelo mesmo prazo do checkout
  // (~30 min); sem a Stripe, a equipe manda o link e a reserva não expira.
  const holdUntil = stripe ? new Date(Date.now() + CART_HOLD_MINUTES * 60000).toISOString() : undefined;
  const inserted = await insertTouristBooking(prep, profile, { afiliadoCode: req.body.afiliadoCode, holdUntil });
  if ("body" in inserted) return res.status(inserted.status).json(inserted.body);
  const newBooking = inserted.booking;
  const { pousada, detailsSummary } = prep;
  const { checkIn, checkOut, adults, children, roomType, pousadaId } = newBooking;

  addNotification("admin", `Nova reserva online: ${newBooking.customerName} na ${newBooking.pousadaName} (${checkIn} a ${checkOut}).`, "booking_new", newBooking.id);
  addNotification("pousada", `Nova reserva online de ${newBooking.customerName} (${checkIn} a ${checkOut}).`, "booking_new", newBooking.id);

  for (const gestorEmail of await getPousadaGestorEmails(pousadaId)) {
    await sendEmail({
      to: gestorEmail,
      subject: `Nova reserva online — ${pousada.name}`,
      html: `
        <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
          <h2 style="color: #0B1412;">Nova reserva pelo site 🌿</h2>
          <p><strong>${escapeHtml(newBooking.customerName)}</strong> reservou de <strong>${checkIn}</strong> a <strong>${checkOut}</strong> (${adults} adulto(s), ${children} criança(s))${roomType ? ` — ${escapeHtml(roomType)}` : ""}.</p>
          ${detailsSummary ? `<p style="color:#555">${escapeHtml(detailsSummary)}</p>` : ""}
          <p>A reserva aparece na sua Agenda de Reservas. Ela fica como "pendente de pagamento" até o hóspede pagar.</p>
          <p><a href="${SITE_URL}/parceiro" style="display:inline-block; background:#0B1412; color:#fff; padding:10px 20px; text-decoration:none; border-radius:999px;">Abrir minha agenda</a></p>
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
    .select("id, pousadaId, pousadaName, guideId, guideName, checkIn, checkOut, adults, children, roomType, experienceType, totalPrice, status, dateCreated")
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
  // Retomar o pagamento renova o prazo — se a vaga ainda estiver livre.
  if (booking.holdUntil && Date.parse(booking.holdUntil) < Date.now()) {
    const { data: pRow } = await supabase.from("pousadas").select("*").eq("id", booking.pousadaId).maybeSingle();
    const avail = pRow ? await checkPousadaAvailability(mapPousadaRow(pRow), booking.checkIn, booking.checkOut, (booking.adults || 0) + (booking.children || 0), booking.roomType || undefined, booking.id) : { ok: false };
    if (!avail.ok) {
      await supabase.from("bookings").update({ status: "cancelado" }).eq("id", booking.id);
      return res.status(409).json({ error: "O prazo para pagar venceu e essas datas foram reservadas por outra pessoa. Faça uma nova reserva com outras datas." });
    }
  }
  if ("holdUntil" in booking) {
    booking.holdUntil = new Date(Date.now() + CART_HOLD_MINUTES * 60000).toISOString();
    await supabase.from("bookings").update({ holdUntil: booking.holdUntil }).eq("id", booking.id);
  }
  try {
    res.json({ url: await createBookingCheckoutSession(booking as Booking) });
  } catch (err: any) {
    log.error("Erro ao criar checkout para reserva do turista:", err.message);
    res.status(500).json({ error: "Erro ao abrir o pagamento." });
  }
});

app.get("/api/turista/me", requireTourist, async (req, res) => {
  const user = res.locals.touristUser as { id: string; email?: string; email_confirmed_at?: string };
  const userId = user.id;
  const { data, error } = await supabase.from("turistas").select("*").eq("id", userId).maybeSingle();
  if (error || !data) return res.status(404).json({ error: "Perfil de turista não encontrado." });

  // Boas-vindas: uma vez, na primeira visita depois do e-mail confirmado.
  // Só quando a coluna existe ("welcomeSentAt" in data) — sem a migração,
  // mandaria a cada abertura do perfil.
  if ("welcomeSentAt" in data && !data.welcomeSentAt && user.email_confirmed_at && user.email) {
    const sent = await sendWelcomeEmail(user.email, String(data.name || ""));
    if (sent) {
      const at = new Date().toISOString();
      await supabase.from("turistas").update({ welcomeSentAt: at }).eq("id", userId);
      (data as any).welcomeSentAt = at;
    }
  }
  res.json(data as Turista);
});

async function sendWelcomeEmail(email: string, name: string): Promise<boolean> {
  const first = escapeHtml(name.split(" ")[0] || "");
  const r = await sendEmail({
    to: email,
    subject: "Bem-vindo(a) ao Ipantanal 🌿",
    preheader: "Seu perfil está ativo. Veja o que dá para fazer agora.",
    html: `
      <h1 style="margin:0 0 12px;font-size:24px;line-height:1.25;color:#0B1412">Bem-vindo(a)${first ? `, ${first}` : ""}!</h1>
      <p style="margin:0 0 16px">Seu perfil de turista está ativo. A partir de agora você pode:</p>
      <ul style="margin:0 0 16px;padding-left:20px">
        <li style="margin-bottom:6px"><strong>Reservar online</strong> nas pousadas parceiras, com confirmação na hora;</li>
        <li style="margin-bottom:6px"><strong>Planejar a viagem</strong> pelo calendário de melhor época de cada espécie e pelo mapa de avistamentos;</li>
        <li style="margin-bottom:6px"><strong>Juntar Jaguars</strong> e trocar por benefícios nas pousadas;</li>
        <li><strong>Avaliar</strong> as pousadas onde se hospedou (selo de hóspede verificado).</li>
      </ul>
      <p style="margin:24px 0"><a href="${SITE_URL}/#catalogo" style="display:inline-block;background:#0B1412;color:#FFFFFF;padding:12px 22px;border-radius:999px;text-decoration:none;font-weight:600;font-size:14px">Explorar pousadas</a></p>
      <p style="margin:0;font-size:13px;color:#4F5D58">Dúvidas? É só responder este e-mail.</p>
    `,
  });
  return r.ok;
}

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
  // Idade virou opcional (saiu do cadastro em 20/10/2026).
  if (!name) {
    return res.status(400).json({ error: "Preencha ao menos o nome." });
  }
  const interests = req.body.interests !== undefined ? sanitizeTouristInterests(req.body.interests) : current.interests;
  // Opcionais — só são enviados quando a pessoa troca a foto de perfil ou de
  // capa (ver ImageUploadButton em TuristaProfileView.tsx); omitidos, o
  // UPDATE simplesmente não mexe neles.
  const photoUrl = typeof req.body.photoUrl === "string" ? req.body.photoUrl.trim() : undefined;
  const coverPhotoUrl = typeof req.body.coverPhotoUrl === "string" ? req.body.coverPhotoUrl.trim() : undefined;
  // Enquadramento da capa escolhido pelo turista ("x% y%", object-position).
  const coverPosition = typeof req.body.coverPosition === "string" && /^\d{1,3}(\.\d+)?% \d{1,3}(\.\d+)?%$/.test(req.body.coverPosition.trim())
    ? req.body.coverPosition.trim()
    : undefined;
  // Aceite das novidades por e-mail (só muda quando vem na requisição).
  const marketingOptIn = typeof req.body.marketingOptIn === "boolean" ? req.body.marketingOptIn : undefined;

  const { data, error } = await writeSkippingMissingColumns(
    {
      name, whatsapp, country, language, age, preferences, interests,
      ...(photoUrl !== undefined ? { photoUrl } : {}),
      ...(coverPhotoUrl !== undefined ? { coverPhotoUrl } : {}),
      ...(coverPosition !== undefined ? { coverPosition } : {}),
      ...(marketingOptIn !== undefined ? { marketingOptIn, marketingOptInAt: marketingOptIn ? new Date().toISOString() : null } : {}),
    },
    row => supabase.from("turistas").update(row).eq("id", userId).select().maybeSingle()
  );
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

  res.setHeader("Content-Disposition", `attachment; filename="ipantanal-meus-dados-${new Date().toISOString().slice(0, 10)}.json"`);
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
  if (!name || !whatsapp || !country) {
    return res.status(400).json({ error: "Preencha nome, WhatsApp e país." });
  }

  const mergedMetadata = { ...(user.app_metadata || {}), isTourist: true };
  const { error: updateErr } = await supabaseAdminAuth.auth.admin.updateUserById(user.id, { app_metadata: mergedMetadata });
  if (updateErr) return res.status(500).json({ error: describeAuthError(updateErr, "Erro ao ativar o perfil de turista.") });

  const interests = sanitizeTouristInterests(req.body.interests);
  const newTurista: Turista = {
    id: user.id, name, email, whatsapp, country,
    language: language || undefined,
    age: Number.isFinite(age) && age > 0 ? age : undefined,
    preferences, interests,
  };
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
  // Local da foto: vem do GPS gravado na própria foto (EXIF) ou da
  // localização do aparelho, e o turista pode editar o nome antes de publicar.
  const lat = Number(req.body.latitude);
  const lng = Number(req.body.longitude);
  const hasCoords = req.body.latitude != null && req.body.longitude != null && Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
  const newPost = {
    id: `tp_${randomUUID()}`, turistaId: userId, text, photoUrl: photoUrl || null, createdAt: new Date().toISOString(),
    location: clip(req.body.location, 120) || null,
    latitude: hasCoords ? lat : null,
    longitude: hasCoords ? lng : null,
  };
  const { error } = await writeSkippingMissingColumns(newPost, row => supabase.from("turista_posts").insert(row));
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
