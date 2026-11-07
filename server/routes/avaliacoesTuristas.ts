// Avaliação dos turistas pelos prestadores de serviço — pousadas (gestores),
// guias e colaboradores aprovados. Regra de privacidade: SOMENTE prestadores
// veem essas notas, e só de turistas que reservaram com eles. O turista não
// tem acesso a nenhuma destas rotas.
import type { Express } from "express";
import { randomUUID } from "crypto";
import { supabase, getPartnerUserFromRequest, isAdminUser, authLimiter, clip, log } from "../core.js";
import { clampScore, ratingWindow, summarizeGuestRatings, RATING_WINDOW_DAYS, type GuestRatingRow } from "../guestRating.js";

type ProviderKind = "pousada" | "guia" | "colaborador";

interface Provider {
  userId: string;
  admin: boolean;
  // pousadas que a pessoa gere (gestor) ou onde trabalha (colaborador aprovado)
  gestorPousadas: string[];
  colabPousadas: string[];
  guias: string[];
  colabName?: string;
}

const MIGRATION_MSG = "A avaliação de hóspedes precisa da migração scripts/add-avaliacao-turistas.sql rodada no Supabase.";
const isMissingTable = (e: any) => e && (e.code === "42P01" || e.code === "PGRST205" || /avaliacoes_turistas/.test(e.message || ""));
const today = () => new Date().toISOString().slice(0, 10);

async function resolveProvider(req: any): Promise<Provider | null> {
  const user = await getPartnerUserFromRequest(req);
  if (!user) return null;
  const meta = (user.app_metadata || {}) as Record<string, any>;
  const p: Provider = { userId: user.id, admin: isAdminUser(user), gestorPousadas: [], colabPousadas: [], guias: [] };

  if (meta.role === "partner") {
    const links = [{ partnerType: meta.partnerType, partnerId: meta.partnerId }];
    const { data: extra } = await supabase.from("partner_links").select('"partnerType", "partnerId"').eq("userId", user.id);
    for (const l of (extra || []) as any[]) links.push(l);
    for (const l of links) {
      if (!l?.partnerId) continue;
      if (l.partnerType === "pousada") p.gestorPousadas.push(l.partnerId);
      if (l.partnerType === "guia") p.guias.push(l.partnerId);
    }
  }
  if (meta.role === "colaborador") {
    const { data: rows } = await supabase.from("colaboradores").select("pousadaId, status, name").eq("userId", user.id);
    for (const r of (rows || []) as any[]) {
      if (r.status === "aprovado") {
        p.colabPousadas.push(r.pousadaId);
        p.colabName = r.name;
      }
    }
  }
  const isProvider = p.admin || p.gestorPousadas.length || p.colabPousadas.length || p.guias.length;
  return isProvider ? p : null;
}

// Por qual vínculo esta pessoa atende esta reserva (null = não atende).
function accessKind(p: Provider, b: { pousadaId?: string; guideId?: string }): ProviderKind | "admin" | null {
  if (b.pousadaId && p.gestorPousadas.includes(b.pousadaId)) return "pousada";
  if (b.guideId && p.guias.includes(b.guideId)) return "guia";
  if (b.pousadaId && p.colabPousadas.includes(b.pousadaId)) return "colaborador";
  if (p.admin) return "admin";
  return null;
}

async function ratingsForGuest(b: { turistaId?: string; customerEmail?: string }) {
  const email = String(b.customerEmail || "").trim().toLowerCase();
  let q = supabase.from("avaliacoes_turistas").select("*");
  // Valores entre aspas: e-mail e id podem ter caracteres que o filtro do
  // PostgREST interpretaria (ponto, parênteses).
  const quote = (v: string) => `"${v.replace(/"/g, "")}"`;
  q = b.turistaId ? q.or(`turistaId.eq.${quote(b.turistaId)},customerEmail.eq.${quote(email)}`) : q.eq("customerEmail", email);
  return q;
}

export function registerAvaliacoesTuristasRoutes(app: Express) {

// Hóspedes que esta pessoa atendeu e ainda pode avaliar (últimos 30 dias).
app.get("/api/avaliacoes-turistas/pendentes", authLimiter, async (req, res) => {
  const p = await resolveProvider(req);
  if (!p) return res.status(403).json({ error: "Só prestadores de serviço avaliam hóspedes." });
  const pousadas = [...new Set([...p.gestorPousadas, ...p.colabPousadas])];
  if (!pousadas.length && !p.guias.length) return res.json([]);

  const since = new Date(Date.now() - RATING_WINDOW_DAYS * 86400000).toISOString().slice(0, 10);
  const filters = [
    pousadas.length ? `pousadaId.in.(${pousadas.map(id => `"${id}"`).join(",")})` : "",
    p.guias.length ? `guideId.in.(${p.guias.map(id => `"${id}"`).join(",")})` : "",
  ].filter(Boolean).join(",");
  const { data: bookings, error } = await supabase
    .from("bookings")
    .select("id, pousadaId, pousadaName, guideId, customerName, customerEmail, turistaId, checkIn, checkOut, status")
    .or(filters)
    .gte("checkOut", since)
    .lte("checkOut", today())
    .order("checkOut", { ascending: false })
    .limit(200);
  if (error) return res.status(500).json({ error: "Erro ao buscar as estadias." });

  const ids = (bookings || []).map((b: any) => b.id);
  const { data: mine, error: mineErr } = ids.length
    ? await supabase.from("avaliacoes_turistas").select("bookingId").eq("autorUserId", p.userId).in("bookingId", ids)
    : { data: [], error: null };
  if (mineErr && isMissingTable(mineErr)) return res.status(503).json({ error: MIGRATION_MSG });
  const done = new Set((mine || []).map((r: any) => r.bookingId));

  res.json((bookings || [])
    .filter((b: any) => ratingWindow(b, today()).ok && !done.has(b.id))
    .map((b: any) => ({ bookingId: b.id, customerName: b.customerName, pousadaName: b.pousadaName, checkIn: b.checkIn, checkOut: b.checkOut })));
});

// Resumo da nota do hóspede de uma reserva (para quem atende essa reserva).
app.get("/api/avaliacoes-turistas/resumo", authLimiter, async (req, res) => {
  const p = await resolveProvider(req);
  if (!p) return res.status(403).json({ error: "Só prestadores de serviço veem a avaliação dos hóspedes." });
  const bookingId = clip(req.query.bookingId, 100);
  const { data: b } = await supabase.from("bookings").select("id, pousadaId, guideId, customerEmail, turistaId, checkOut, status").eq("id", bookingId).maybeSingle();
  if (!b) return res.status(404).json({ error: "Reserva não encontrada." });
  const kind = accessKind(p, b as any);
  if (!kind) return res.status(403).json({ error: "Você não atende esta reserva." });

  const { data: rows, error } = await ratingsForGuest(b as any);
  if (error) return isMissingTable(error) ? res.status(503).json({ error: MIGRATION_MSG }) : res.status(500).json({ error: "Erro ao buscar as avaliações." });
  const list = (rows || []) as (GuestRatingRow & { bookingId: string; autorUserId: string })[];
  const jaAvaliei = list.some(r => r.bookingId === b.id && r.autorUserId === p.userId);
  const janela = ratingWindow(b as any, today());
  res.json({
    ...summarizeGuestRatings(list),
    podeAvaliar: kind !== "admin" && !jaAvaliei && janela.ok,
    jaAvaliei,
    motivo: kind === "admin" ? "Administradores só visualizam." : jaAvaliei ? "Você já avaliou este hóspede nesta reserva." : janela.ok ? null : (janela as any).motivo,
  });
});

// Avaliar o hóspede de uma reserva (uma vez por prestador e reserva).
app.post("/api/avaliacoes-turistas", authLimiter, async (req, res) => {
  const p = await resolveProvider(req);
  if (!p) return res.status(403).json({ error: "Só prestadores de serviço avaliam hóspedes." });
  const bookingId = clip(req.body.bookingId, 100);
  const notaComunicacao = clampScore(req.body.notaComunicacao);
  const notaRegras = clampScore(req.body.notaRegras);
  const notaCuidado = clampScore(req.body.notaCuidado);
  if (!notaComunicacao || !notaRegras || !notaCuidado) return res.status(400).json({ error: "Dê uma nota de 1 a 5 em cada critério." });

  const { data: b } = await supabase.from("bookings").select("id, pousadaId, pousadaName, guideId, guideName, customerEmail, turistaId, checkOut, status").eq("id", bookingId).maybeSingle();
  if (!b) return res.status(404).json({ error: "Reserva não encontrada." });
  const kind = accessKind(p, b as any);
  if (!kind || kind === "admin") return res.status(403).json({ error: "Você não atende esta reserva." });
  const janela = ratingWindow(b as any, today());
  if (!janela.ok) return res.status(400).json({ error: (janela as any).motivo });
  if (!b.customerEmail) return res.status(400).json({ error: "Reserva sem email do hóspede." });

  const autorNome = kind === "pousada" ? b.pousadaName : kind === "guia" ? b.guideName : p.colabName ? `${p.colabName} (${b.pousadaName})` : b.pousadaName;
  const row = {
    id: `at_${randomUUID()}`,
    bookingId: b.id,
    turistaId: b.turistaId || null,
    customerEmail: String(b.customerEmail).trim().toLowerCase(),
    autorUserId: p.userId,
    autorTipo: kind,
    autorNome: autorNome || null,
    pousadaId: b.pousadaId || null,
    notaComunicacao,
    notaRegras,
    notaCuidado,
    nota: Math.round(((notaComunicacao + notaRegras + notaCuidado) / 3) * 100) / 100,
    comentario: clip(req.body.comentario, 1000) || null,
    createdAt: new Date().toISOString(),
  };
  const { error } = await supabase.from("avaliacoes_turistas").insert(row);
  if (error) {
    if (isMissingTable(error)) return res.status(503).json({ error: MIGRATION_MSG });
    if (error.code === "23505") return res.status(409).json({ error: "Você já avaliou este hóspede nesta reserva." });
    log.error("Erro ao salvar avaliação de hóspede:", error.message);
    return res.status(500).json({ error: "Erro ao salvar a avaliação." });
  }
  res.status(201).json({ success: true });
});
}
