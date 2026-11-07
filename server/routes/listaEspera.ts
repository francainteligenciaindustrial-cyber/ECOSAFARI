// Datas desejadas e lista de espera.
//  - POST /api/pousadas/:id/disponibilidade: o turista escolhe as datas e a
//    página já diz se cabe — e, se não, as datas livres mais próximas.
//  - Se ele recusar as datas sugeridas, fica na lista de espera daquelas
//    datas: a equipe e a pousada sabem quando seria uma boa data para esse
//    cliente, e ele é avisado por e-mail se a data ficar livre (reserva
//    cancelada, vaga do carrinho vencida, pousada liberou a data).
import type { Express } from "express";
import { randomUUID } from "crypto";
import {
  addNotification,
  authLimiter,
  bookingHooks,
  checkPousadaAvailability,
  clip,
  escapeHtml,
  ISO_DATE,
  log,
  mapPousadaRow,
  requireAdmin,
  requirePartnerAccess,
  requireTourist,
  sendEmail,
  SITE_URL,
  supabase,
} from "../core.js";

const MIGRATION_MSG = "A lista de espera precisa da migração scripts/add-lista-espera.sql rodada no Supabase.";
const isMissing = (err: any) => !!err && /relation|does not exist|schema cache|column/i.test(String(err.message || ""));
const br = (iso: string) => String(iso || "").slice(0, 10).split("-").reverse().join("/");
const firstName = (n: string) => String(n || "").trim().split(/\s+/)[0] || "";

async function carregarPousada(id: string) {
  const { data } = await supabase.from("pousadas").select("*").eq("id", id).maybeSingle();
  return data ? mapPousadaRow(data) : null;
}

const linkReserva = (e: any) =>
  `${SITE_URL}/reservar/${encodeURIComponent(e.pousadaId)}?checkin=${e.checkIn}&checkout=${e.checkOut}${e.pacoteId ? `&pacote=${encodeURIComponent(e.pacoteId)}` : ""}`;

// Confere quem está esperando e avisa por e-mail quem agora cabe.
// Sem pousadaId: todas (cron diário).
export async function verificarListaEspera(pousadaId?: string) {
  const hoje = new Date().toISOString().slice(0, 10);
  const resultado = { avisados: 0, expirados: 0 };
  const exp = await supabase.from("lista_espera").update({ status: "expirada" }).eq("status", "ativa").lte("checkIn", hoje).select("id");
  if (exp.error) { if (!isMissing(exp.error)) log.warn("Lista de espera:", exp.error.message); return resultado; }
  resultado.expirados = (exp.data || []).length;

  let q = supabase.from("lista_espera").select("*").eq("status", "ativa").gt("checkIn", hoje).order("createdAt").limit(300);
  if (pousadaId) q = q.eq("pousadaId", pousadaId);
  const { data: entradas } = await q;
  const pousadas = new Map<string, any>();
  for (const e of entradas || []) {
    if (!pousadas.has(e.pousadaId)) pousadas.set(e.pousadaId, await carregarPousada(e.pousadaId));
    const pousada = pousadas.get(e.pousadaId);
    if (!pousada) continue;
    // excludeBookingId fictício: só queremos sim/não, sem calcular sugestões.
    const disp = await checkPousadaAvailability(pousada, e.checkIn, e.checkOut, (e.adults || 1) + (e.children || 0), e.roomType || undefined, "__lista_espera__");
    if (!disp.ok) continue;
    const r = await sendEmail({
      to: e.email,
      subject: `Boa notícia: ${pousada.name} ficou disponível em ${br(e.checkIn)} a ${br(e.checkOut)}`,
      preheader: "As datas que você queria liberaram. Reserve antes que outra pessoa reserve.",
      html: `
        <h1 style="margin:0 0 12px;font-size:22px;color:#0B1412">${firstName(e.nome) ? `${escapeHtml(firstName(e.nome))}, as` : "As"} suas datas ficaram disponíveis 🌿</h1>
        <p style="margin:0 0 16px">Você pediu para avisarmos: a <strong>${escapeHtml(pousada.name)}</strong> agora tem vaga de <strong>${br(e.checkIn)} a ${br(e.checkOut)}</strong> para ${e.adults} adulto(s)${e.children ? ` e ${e.children} criança(s)` : ""}${e.roomType ? ` (${escapeHtml(e.roomType)})` : ""}.</p>
        <p style="margin:0 0 16px;font-size:14px">A vaga não fica guardada: quem reservar primeiro garante.</p>
        <p style="margin:24px 0"><a href="${linkReserva(e)}" style="display:inline-block;background:#0B9467;color:#FFFFFF;padding:12px 24px;border-radius:999px;text-decoration:none;font-weight:700;font-size:14px">Reservar essas datas</a></p>
      `,
    }).catch(() => ({ ok: false }));
    if ((r as any)?.ok === false) continue;
    await supabase.from("lista_espera").update({ status: "avisada", avisadoEm: new Date().toISOString() }).eq("id", e.id);
    resultado.avisados++;
  }
  return resultado;
}

export function registerListaEsperaRoutes(app: Express) {

  // Reserva cancelada abre vaga: confere a lista de espera da pousada.
  bookingHooks.cancelled.push(async (booking) => { await verificarListaEspera(booking.pousadaId); });

  // Disponibilidade das datas escolhidas (sem reservar nada).
  app.post("/api/pousadas/:id/disponibilidade", authLimiter, async (req, res) => {
    const checkIn = clip(req.body.checkIn, 10);
    const checkOut = clip(req.body.checkOut, 10);
    const adults = Math.max(1, Math.trunc(Number(req.body.adults) || 1));
    const children = Math.max(0, Math.trunc(Number(req.body.children) || 0));
    const roomType = clip(req.body.roomType, 120) || undefined;
    if (!ISO_DATE.test(checkIn) || !ISO_DATE.test(checkOut) || checkOut <= checkIn) return res.status(400).json({ error: "Datas inválidas." });
    const pousada = await carregarPousada(req.params.id);
    if (!pousada) return res.status(404).json({ error: "Pousada não encontrada." });
    const r = await checkPousadaAvailability(pousada, checkIn, checkOut, adults + children, roomType);
    if (r.ok) return res.json({ available: true });
    res.json({ available: false, error: r.body.error, nearest: (r.body as any).nearest || null });
  });

  // "Não quero outra data": entra na lista de espera dessas datas.
  app.post("/api/turista/lista-espera", authLimiter, requireTourist, async (req, res) => {
    const user = res.locals.touristUser as { id: string; email?: string };
    if (!user.email) return res.status(400).json({ error: "Sua conta não tem e-mail." });
    const pousadaId = clip(req.body.pousadaId, 100);
    const checkIn = clip(req.body.checkIn, 10);
    const checkOut = clip(req.body.checkOut, 10);
    const hoje = new Date().toISOString().slice(0, 10);
    if (!ISO_DATE.test(checkIn) || !ISO_DATE.test(checkOut) || checkOut <= checkIn || checkIn <= hoje) return res.status(400).json({ error: "Datas inválidas." });
    const pousada = await carregarPousada(pousadaId);
    if (!pousada) return res.status(404).json({ error: "Pousada não encontrada." });
    const { data: perfil } = await supabase.from("turistas").select("name").eq("id", user.id).maybeSingle();

    const sugerida = req.body.sugestaoRecusada && ISO_DATE.test(String(req.body.sugestaoRecusada.checkIn || "")) ? req.body.sugestaoRecusada : null;
    const row = {
      id: `le_${randomUUID()}`,
      pousadaId,
      pousadaName: pousada.name,
      turistaId: user.id,
      email: user.email,
      nome: perfil?.name || "",
      checkIn,
      checkOut,
      adults: Math.max(1, Math.trunc(Number(req.body.adults) || 1)),
      children: Math.max(0, Math.trunc(Number(req.body.children) || 0)),
      roomType: clip(req.body.roomType, 120) || null,
      pacoteId: clip(req.body.pacoteId, 100) || null,
      sugestaoRecusadaCheckIn: sugerida ? clip(sugerida.checkIn, 10) : null,
      sugestaoRecusadaCheckOut: sugerida ? clip(sugerida.checkOut, 10) : null,
      status: "ativa",
      createdAt: new Date().toISOString(),
    };
    // Mesmo turista, mesma pousada e mesmas datas: não duplica.
    const { data: ja, error: jaErr } = await supabase.from("lista_espera").select("id").eq("turistaId", user.id).eq("pousadaId", pousadaId).eq("checkIn", checkIn).eq("checkOut", checkOut).eq("status", "ativa").maybeSingle();
    if (jaErr && isMissing(jaErr)) return res.status(503).json({ error: MIGRATION_MSG });
    if (!ja) {
      const { error } = await supabase.from("lista_espera").insert(row);
      if (error) return isMissing(error) ? res.status(503).json({ error: MIGRATION_MSG }) : res.status(500).json({ error: "Não foi possível salvar." });
      addNotification("admin", `Lista de espera: ${row.nome || user.email} quer a ${pousada.name} de ${br(checkIn)} a ${br(checkOut)} (${row.adults + row.children} pessoa(s)).`, "booking_new");
      await sendEmail({
        to: user.email,
        subject: `Anotamos: ${pousada.name}, ${br(checkIn)} a ${br(checkOut)}`,
        preheader: "Você será avisado por e-mail se essas datas ficarem disponíveis.",
        html: `
          <h1 style="margin:0 0 12px;font-size:22px;color:#0B1412">Obrigado${firstName(row.nome) ? `, ${escapeHtml(firstName(row.nome))}` : ""}! Anotamos as suas datas</h1>
          <p style="margin:0 0 16px">Você está na lista de espera da <strong>${escapeHtml(pousada.name)}</strong> para <strong>${br(checkIn)} a ${br(checkOut)}</strong>. Se essas datas ficarem disponíveis, avisamos você por e-mail na hora — com o link para reservar.</p>
          <p style="margin:0;font-size:13px;color:#4F5D58">Enquanto isso, você pode ver outras pousadas da região em <a href="${SITE_URL}" style="color:#087A55">ipantanal.com.br</a>.</p>
        `,
      }).catch(() => {});
    }
    res.json({ ok: true });
  });

  // Pousada: quem quer vir e quando (demanda) — sem o contato do turista.
  app.get("/api/pousadas/:id/lista-espera", requirePartnerAccess("pousada"), async (req, res) => {
    const hoje = new Date().toISOString().slice(0, 10);
    const { data, error } = await supabase.from("lista_espera").select("*").eq("pousadaId", req.params.id).gt("checkIn", hoje).in("status", ["ativa", "avisada"]).order("checkIn");
    if (error) return isMissing(error) ? res.json([]) : res.status(500).json({ error: "Erro ao buscar." });
    res.json((data || []).map((e: any) => ({ id: e.id, nome: firstName(e.nome), checkIn: e.checkIn, checkOut: e.checkOut, adults: e.adults, children: e.children, roomType: e.roomType, status: e.status, createdAt: e.createdAt })));
  });

  // Gestão: lista de espera completa.
  app.get("/api/admin/lista-espera", requireAdmin, async (req, res) => {
    const { data, error } = await supabase.from("lista_espera").select("*").order("createdAt", { ascending: false }).limit(500);
    if (error) return isMissing(error) ? res.json([]) : res.status(500).json({ error: "Erro ao buscar." });
    res.json(data || []);
  });
}
