// Mensagens turista ↔ guia dentro da plataforma.
// Regra: o telefone/WhatsApp do guia só é liberado ao turista depois de
// uma reserva PAGA com esse guia. Antes disso, contatos digitados nas
// mensagens (telefone, email, links, @) são ocultados — o original fica
// guardado só para a Gestão consultar em caso de problema.
import type { Express } from "express";
import { randomUUID } from "crypto";
import {
  supabase,
  requireTourist,
  requirePartnerAccess,
  requireAdmin,
  authLimiter,
  sendEmail,
  escapeHtml,
  clip,
  log,
  SITE_URL,
  mapGuideRow,
  toPublicGuide,
} from "../core.js";
import { maskContact } from "../contactMask.js";

const PAID = ["pago", "confirmado_pousada", "confirmado_guia", "confirmado_total"];
const MIGRATION_MSG = "As mensagens precisam da migração scripts/add-mensagens-e-listas.sql rodada no Supabase.";
const isMissing = (e: any) => e && (e.code === "42P01" || e.code === "PGRST205" || /conversas|mensagens/.test(e.message || ""));

async function hasPaidBookingWithGuide(turistaId: string, guideId: string): Promise<boolean> {
  const { data } = await supabase.from("bookings").select("id").eq("turistaId", turistaId).eq("guideId", guideId).in("status", PAID).limit(1);
  return !!(data && data.length);
}

const waLink = (phone: string) => {
  const d = String(phone || "").replace(/\D/g, "");
  return d ? `https://wa.me/${d.length <= 11 ? `55${d}` : d}` : null;
};

async function addMessage(conversaId: string, autor: "turista" | "guia", raw: string, unlocked: boolean) {
  const texto = clip(raw, 2000);
  const masked = unlocked ? { text: texto, masked: false } : maskContact(texto);
  const msg = {
    id: `msg_${randomUUID()}`,
    conversaId,
    autor,
    texto: masked.text,
    textoOriginal: masked.masked ? texto : null,
    ocultado: masked.masked,
    createdAt: new Date().toISOString(),
  };
  const { error } = await supabase.from("mensagens").insert(msg);
  if (error) throw error;
  return msg;
}

async function bumpConversa(conversaId: string, autor: "turista" | "guia", preview: string) {
  const { data: c } = await supabase.from("conversas").select("turistaUnread, guiaUnread").eq("id", conversaId).maybeSingle();
  const unreadKey = autor === "turista" ? "guiaUnread" : "turistaUnread";
  const before = Number((c as any)?.[unreadKey] || 0);
  await supabase.from("conversas").update({
    lastMessageAt: new Date().toISOString(),
    lastMessagePreview: preview.slice(0, 140),
    [unreadKey]: before + 1,
  }).eq("id", conversaId);
  return before; // 0 = primeira não lida → vale mandar aviso por email
}

export function registerMensagensRoutes(app: Express) {

// ---------------- Turista ----------------

// Começa (ou continua) uma conversa com o guia.
app.post("/api/turista/conversas", requireTourist, async (req, res) => {
  const user = res.locals.touristUser as { id: string; email?: string };
  const guideId = clip(req.body.guideId, 100);
  const texto = clip(req.body.texto, 2000);
  if (!guideId || !texto) return res.status(400).json({ error: "Escreva sua pergunta." });
  const { data: g } = await supabase.from("guides").select("*").eq("id", guideId).maybeSingle();
  if (!g) return res.status(404).json({ error: "Guia não encontrado." });
  const guide = mapGuideRow(g);

  let { data: conversa, error } = await supabase.from("conversas").select("*").eq("turistaId", user.id).eq("guideId", guideId).maybeSingle();
  if (error && isMissing(error)) return res.status(503).json({ error: MIGRATION_MSG });
  if (!conversa) {
    const row = { id: `cv_${randomUUID()}`, turistaId: user.id, guideId, createdAt: new Date().toISOString(), lastMessageAt: new Date().toISOString(), turistaUnread: 0, guiaUnread: 0 };
    const ins = await supabase.from("conversas").insert(row).select().single();
    if (ins.error) return isMissing(ins.error) ? res.status(503).json({ error: MIGRATION_MSG }) : res.status(500).json({ error: "Erro ao iniciar a conversa." });
    conversa = ins.data;
  }
  try {
    const unlocked = await hasPaidBookingWithGuide(user.id, guideId);
    const msg = await addMessage(conversa.id, "turista", texto, unlocked);
    const before = await bumpConversa(conversa.id, "turista", msg.texto);
    if (before === 0 && guide.email) await notifyGuide(guide.email, guide.name, conversa.id, msg.texto, user.id);
    res.status(201).json({ conversaId: conversa.id, ocultado: msg.ocultado });
  } catch (err: any) {
    log.error("Erro ao enviar mensagem:", err?.message);
    res.status(500).json({ error: "Erro ao enviar a mensagem." });
  }
});

app.get("/api/turista/conversas", requireTourist, async (_req, res) => {
  const user = res.locals.touristUser as { id: string };
  const { data, error } = await supabase.from("conversas").select("*").eq("turistaId", user.id).order("lastMessageAt", { ascending: false });
  if (error) return isMissing(error) ? res.status(503).json({ error: MIGRATION_MSG }) : res.status(500).json({ error: "Erro ao buscar conversas." });
  const ids = [...new Set((data || []).map((c: any) => c.guideId))];
  const { data: guides } = ids.length ? await supabase.from("guides").select("*").in("id", ids) : { data: [] as any[] };
  const byId = new Map((guides || []).map((g: any) => [g.id, toPublicGuide(mapGuideRow(g))]));
  res.json((data || []).map((c: any) => ({ ...c, guia: byId.get(c.guideId) || null })));
});

app.get("/api/turista/conversas/:id", requireTourist, async (req, res) => {
  const user = res.locals.touristUser as { id: string };
  const { data: c, error } = await supabase.from("conversas").select("*").eq("id", req.params.id).eq("turistaId", user.id).maybeSingle();
  if (error && isMissing(error)) return res.status(503).json({ error: MIGRATION_MSG });
  if (!c) return res.status(404).json({ error: "Conversa não encontrada." });
  const [{ data: msgs }, { data: g }, unlocked] = await Promise.all([
    supabase.from("mensagens").select("id, autor, texto, ocultado, createdAt").eq("conversaId", c.id).order("createdAt", { ascending: true }),
    supabase.from("guides").select("*").eq("id", c.guideId).maybeSingle(),
    hasPaidBookingWithGuide(user.id, c.guideId),
  ]);
  if (c.turistaUnread) await supabase.from("conversas").update({ turistaUnread: 0 }).eq("id", c.id);
  const guide = g ? mapGuideRow(g) : null;
  res.json({
    conversa: c,
    guia: guide ? toPublicGuide(guide) : null,
    mensagens: msgs || [],
    contatoLiberado: unlocked,
    contato: unlocked && guide ? { phone: guide.phone, whatsapp: waLink(guide.phone) } : null,
  });
});

app.post("/api/turista/conversas/:id/mensagens", requireTourist, async (req, res) => {
  const user = res.locals.touristUser as { id: string };
  const texto = clip(req.body.texto, 2000);
  if (!texto) return res.status(400).json({ error: "Escreva a mensagem." });
  const { data: c } = await supabase.from("conversas").select("*").eq("id", req.params.id).eq("turistaId", user.id).maybeSingle();
  if (!c) return res.status(404).json({ error: "Conversa não encontrada." });
  try {
    const unlocked = await hasPaidBookingWithGuide(user.id, c.guideId);
    const msg = await addMessage(c.id, "turista", texto, unlocked);
    const before = await bumpConversa(c.id, "turista", msg.texto);
    if (before === 0) {
      const { data: g } = await supabase.from("guides").select("*").eq("id", c.guideId).maybeSingle();
      const guide = g ? mapGuideRow(g) : null;
      if (guide?.email) await notifyGuide(guide.email, guide.name, c.id, msg.texto, user.id);
    }
    res.status(201).json(msg);
  } catch {
    res.status(500).json({ error: "Erro ao enviar a mensagem." });
  }
});

// Contato direto do guia: só com reserva paga com ele.
app.get("/api/turista/guias/:guideId/contato", requireTourist, async (req, res) => {
  const user = res.locals.touristUser as { id: string };
  if (!(await hasPaidBookingWithGuide(user.id, req.params.guideId))) {
    return res.status(403).json({ error: "O contato direto do guia é liberado depois da reserva paga. Até lá, fale com ele pelas mensagens." });
  }
  const { data: g } = await supabase.from("guides").select("*").eq("id", req.params.guideId).maybeSingle();
  if (!g) return res.status(404).json({ error: "Guia não encontrado." });
  const guide = mapGuideRow(g);
  res.json({ name: guide.name, phone: guide.phone, whatsapp: waLink(guide.phone) });
});

// ---------------- Guia ----------------

app.get("/api/guides/:id/conversas", requirePartnerAccess("guia"), async (req, res) => {
  const { data, error } = await supabase.from("conversas").select("*").eq("guideId", req.params.id).order("lastMessageAt", { ascending: false });
  if (error) return isMissing(error) ? res.status(503).json({ error: MIGRATION_MSG }) : res.status(500).json({ error: "Erro ao buscar conversas." });
  const ids = [...new Set((data || []).map((c: any) => c.turistaId))];
  const { data: turistas } = ids.length ? await supabase.from("turistas").select("id, name, photoUrl, country").in("id", ids) : { data: [] as any[] };
  const byId = new Map((turistas || []).map((t: any) => [t.id, t]));
  res.json((data || []).map((c: any) => ({ ...c, turista: byId.get(c.turistaId) || null })));
});

app.get("/api/guides/:id/conversas/:cid", requirePartnerAccess("guia"), async (req, res) => {
  const { data: c } = await supabase.from("conversas").select("*").eq("id", req.params.cid).eq("guideId", req.params.id).maybeSingle();
  if (!c) return res.status(404).json({ error: "Conversa não encontrada." });
  const [{ data: msgs }, { data: t }, unlocked] = await Promise.all([
    supabase.from("mensagens").select("id, autor, texto, ocultado, createdAt").eq("conversaId", c.id).order("createdAt", { ascending: true }),
    supabase.from("turistas").select("id, name, photoUrl, country").eq("id", c.turistaId).maybeSingle(),
    hasPaidBookingWithGuide(c.turistaId, c.guideId),
  ]);
  if (c.guiaUnread) await supabase.from("conversas").update({ guiaUnread: 0 }).eq("id", c.id);
  res.json({ conversa: c, turista: t || null, mensagens: msgs || [], reservaPaga: unlocked });
});

app.post("/api/guides/:id/conversas/:cid/mensagens", requirePartnerAccess("guia"), async (req, res) => {
  const texto = clip(req.body.texto, 2000);
  if (!texto) return res.status(400).json({ error: "Escreva a mensagem." });
  const { data: c } = await supabase.from("conversas").select("*").eq("id", req.params.cid).eq("guideId", req.params.id).maybeSingle();
  if (!c) return res.status(404).json({ error: "Conversa não encontrada." });
  try {
    const unlocked = await hasPaidBookingWithGuide(c.turistaId, c.guideId);
    const msg = await addMessage(c.id, "guia", texto, unlocked);
    const before = await bumpConversa(c.id, "guia", msg.texto);
    if (before === 0) {
      const [{ data: t }, { data: g }] = await Promise.all([
        supabase.from("turistas").select("email, name").eq("id", c.turistaId).maybeSingle(),
        supabase.from("guides").select("name").eq("id", c.guideId).maybeSingle(),
      ]);
      if (t?.email) {
        await sendEmail({
          to: t.email,
          subject: `${g?.name || "O guia"} respondeu sua mensagem — Ipantanal`,
          preheader: msg.texto.slice(0, 90),
          html: `
            <h1 style="margin:0 0 12px;font-size:22px;color:#0B1412">Você tem uma resposta</h1>
            <p style="margin:0 0 14px"><strong>${escapeHtml(g?.name || "O guia")}</strong> respondeu:</p>
            <blockquote style="margin:0 0 16px;padding:12px 16px;background:#F4F6F5;border-radius:12px">${escapeHtml(msg.texto.slice(0, 500))}</blockquote>
            <p style="margin:24px 0"><a href="${SITE_URL}/turista/mensagens?c=${encodeURIComponent(c.id)}" style="display:inline-block;background:#0B1412;color:#FFFFFF;padding:12px 22px;border-radius:999px;text-decoration:none;font-weight:600;font-size:14px">Ver a conversa</a></p>
          `,
        });
      }
    }
    res.status(201).json(msg);
  } catch {
    res.status(500).json({ error: "Erro ao enviar a mensagem." });
  }
});

// ---------------- Gestão (em caso de problema) ----------------

app.get("/api/admin/conversas", requireAdmin, async (_req, res) => {
  const { data, error } = await supabase.from("conversas").select("*").order("lastMessageAt", { ascending: false }).limit(200);
  if (error) return isMissing(error) ? res.status(503).json({ error: MIGRATION_MSG }) : res.status(500).json({ error: "Erro ao buscar conversas." });
  const tIds = [...new Set((data || []).map((c: any) => c.turistaId))];
  const gIds = [...new Set((data || []).map((c: any) => c.guideId))];
  const [{ data: ts }, { data: gs }] = await Promise.all([
    tIds.length ? supabase.from("turistas").select("id, name, email").in("id", tIds) : Promise.resolve({ data: [] as any[] }),
    gIds.length ? supabase.from("guides").select("id, name").in("id", gIds) : Promise.resolve({ data: [] as any[] }),
  ]);
  const tMap = new Map((ts || []).map((t: any) => [t.id, t]));
  const gMap = new Map((gs || []).map((g: any) => [g.id, g]));
  res.json((data || []).map((c: any) => ({ ...c, turista: tMap.get(c.turistaId) || null, guia: gMap.get(c.guideId) || null })));
});

app.get("/api/admin/conversas/:id", requireAdmin, async (req, res) => {
  const { data: msgs, error } = await supabase.from("mensagens").select("*").eq("conversaId", req.params.id).order("createdAt", { ascending: true });
  if (error) return res.status(500).json({ error: "Erro ao buscar mensagens." });
  res.json(msgs || []);
});
}

async function notifyGuide(email: string, guideName: string, conversaId: string, preview: string, turistaId: string) {
  const { data: t } = await supabase.from("turistas").select("name").eq("id", turistaId).maybeSingle();
  await sendEmail({
    to: email,
    subject: `Nova pergunta de ${t?.name || "um turista"} — Ipantanal`,
    preheader: preview.slice(0, 90),
    html: `
      <h1 style="margin:0 0 12px;font-size:22px;color:#0B1412">Nova mensagem para você</h1>
      <p style="margin:0 0 14px">Olá, ${escapeHtml(guideName.split(" ")[0] || "")}! <strong>${escapeHtml(t?.name || "Um turista")}</strong> mandou uma pergunta pelo Ipantanal:</p>
      <blockquote style="margin:0 0 16px;padding:12px 16px;background:#F4F6F5;border-radius:12px">${escapeHtml(preview.slice(0, 500))}</blockquote>
      <p style="margin:0 0 14px;font-size:13px;color:#4F5D58">Responda pelo portal. Responder rápido aumenta suas chances de reserva — e o tempo de resposta aparece no seu perfil.</p>
      <p style="margin:24px 0"><a href="${SITE_URL}/parceiro?mensagens=${encodeURIComponent(conversaId)}" style="display:inline-block;background:#0B1412;color:#FFFFFF;padding:12px 22px;border-radius:999px;text-decoration:none;font-weight:600;font-size:14px">Responder</a></p>
    `,
  });
}
