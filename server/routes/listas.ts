// Lista de desejos: listas com nome e datas, com pousadas, guias, atrações
// e pacotes; compartilhamento por link; "Montar roteiro" pela IA; alertas
// diários por email (vaga nas datas, começo da época de avistamento).
import type { Express } from "express";
import { randomUUID, randomBytes } from "crypto";
import {
  supabase,
  requireTourist,
  publicFormLimiter,
  authLimiter,
  chatLimiter,
  sendEmail,
  escapeHtml,
  clip,
  log,
  SITE_URL,
  ai,
  GEMINI_MODEL,
  mapPousadaRow,
  mapGuideRow,
  toPublicGuide,
  mapAtracaoRow,
  mapPacoteRow,
  toPacotePublico,
  checkPousadaAvailability,
} from "../core.js";
import { listDatesUpcoming, pousadaNearSpecies, speciesSeasonStarting } from "../wishlistAlerts.js";

type Tipo = "pousada" | "guia" | "atracao" | "pacote";
const TIPOS: Tipo[] = ["pousada", "guia", "atracao", "pacote"];
const MIGRATION_MSG = "A lista de desejos precisa da migração scripts/add-mensagens-e-listas.sql rodada no Supabase.";
const isMissing = (e: any) => e && (e.code === "42P01" || e.code === "PGRST205" || /listas_desejos|lista_itens/.test(e.message || ""));
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const today = () => new Date().toISOString().slice(0, 10);

export interface ItemResumo {
  id: string;
  tipo: Tipo;
  refId: string;
  nome: string;
  imagem?: string;
  local?: string;
  preco?: string;
  url: string;
}

const brl = (n: number) => `R$ ${Math.round(n).toLocaleString("pt-BR")}`;

// Busca os dados de exibição de cada item (em lote por tipo).
async function resolveItems(items: { id: string; tipo: Tipo; refId: string }[]): Promise<ItemResumo[]> {
  const ids = (t: Tipo) => [...new Set(items.filter(i => i.tipo === t).map(i => i.refId))];
  const [pq, gq, aq, kq] = await Promise.all([
    ids("pousada").length ? supabase.from("pousadas").select("*").in("id", ids("pousada")) : Promise.resolve({ data: [] as any[] }),
    ids("guia").length ? supabase.from("guides").select("*").in("id", ids("guia")) : Promise.resolve({ data: [] as any[] }),
    ids("atracao").length ? supabase.from("atracoes").select("*").in("id", ids("atracao")) : Promise.resolve({ data: [] as any[] }),
    ids("pacote").length ? supabase.from("pacotes").select("*").in("id", ids("pacote")) : Promise.resolve({ data: [] as any[] }),
  ]);
  const map = new Map<string, Omit<ItemResumo, "id" | "tipo" | "refId">>();
  for (const row of (pq.data || []) as any[]) {
    const p = mapPousadaRow(row);
    map.set(`pousada:${p.id}`, { nome: p.name, imagem: p.images?.[0], local: p.location, preco: p.pricePerNight ? `${brl(p.pricePerNight)}/noite` : undefined, url: `/pousadas/${p.id}` });
  }
  for (const row of (gq.data || []) as any[]) {
    const g = toPublicGuide(mapGuideRow(row)) as any;
    map.set(`guia:${g.id}`, { nome: g.name, imagem: g.photoUrl || g.images?.[0], local: g.languages ? String(g.languages) : undefined, url: `/guias/${g.id}` });
  }
  for (const row of (aq.data || []) as any[]) {
    const a = mapAtracaoRow(row);
    map.set(`atracao:${a.id}`, { nome: a.name, imagem: a.images?.[0], local: a.location, url: `/atracoes/${a.id}` });
  }
  const pacotes = await toPacotePublico(((kq.data || []) as any[]).map(mapPacoteRow));
  for (const k of pacotes) {
    map.set(`pacote:${k.id}`, { nome: k.name, imagem: k.imageUrl, local: k.pousadaName, preco: `${brl(k.pricePerPerson)}/pessoa · ${k.nights} noites`, url: `/reservar/${k.pousadaId}?pacote=${k.id}` });
  }
  return items
    .map(i => {
      const info = map.get(`${i.tipo}:${i.refId}`);
      return info ? { id: i.id, tipo: i.tipo, refId: i.refId, ...info } : null;
    })
    .filter((x): x is ItemResumo => !!x);
}

async function ownList(turistaId: string, id: string) {
  const { data, error } = await supabase.from("listas_desejos").select("*").eq("id", id).eq("turistaId", turistaId).maybeSingle();
  return { lista: data, error };
}

async function listsWithItems(turistaId: string) {
  const { data: listas, error } = await supabase.from("listas_desejos").select("*").eq("turistaId", turistaId).order("createdAt", { ascending: true });
  if (error) return { error };
  const ids = (listas || []).map((l: any) => l.id);
  const { data: itens } = ids.length ? await supabase.from("lista_itens").select("*").in("listaId", ids).order("createdAt", { ascending: false }) : { data: [] as any[] };
  const resolved = await resolveItems((itens || []) as any[]);
  const byId = new Map(resolved.map(r => [r.id, r]));
  return {
    listas: (listas || []).map((l: any) => ({
      ...l,
      itens: (itens || []).filter((i: any) => i.listaId === l.id).map((i: any) => byId.get(i.id)).filter(Boolean),
    })),
  };
}

export function registerListasRoutes(app: Express) {

app.get("/api/turista/listas", requireTourist, async (_req, res) => {
  const user = res.locals.touristUser as { id: string };
  const r = await listsWithItems(user.id);
  if (r.error) return isMissing(r.error) ? res.status(503).json({ error: MIGRATION_MSG }) : res.status(500).json({ error: "Erro ao buscar suas listas." });
  res.json(r.listas);
});

app.post("/api/turista/listas", requireTourist, async (req, res) => {
  const user = res.locals.touristUser as { id: string };
  const nome = clip(req.body.nome, 80) || "Minha viagem";
  const checkIn = ISO.test(String(req.body.checkIn || "")) ? req.body.checkIn : null;
  const checkOut = ISO.test(String(req.body.checkOut || "")) ? req.body.checkOut : null;
  const { count } = await supabase.from("listas_desejos").select("id", { count: "exact", head: true }).eq("turistaId", user.id);
  if ((count || 0) >= 30) return res.status(400).json({ error: "Você já tem 30 listas. Apague alguma para criar outra." });
  const row = { id: `ld_${randomUUID()}`, turistaId: user.id, nome, checkIn, checkOut, alertas: true, createdAt: new Date().toISOString() };
  const { data, error } = await supabase.from("listas_desejos").insert(row).select().single();
  if (error) return isMissing(error) ? res.status(503).json({ error: MIGRATION_MSG }) : res.status(500).json({ error: "Erro ao criar a lista." });
  res.status(201).json({ ...data, itens: [] });
});

app.put("/api/turista/listas/:id", requireTourist, async (req, res) => {
  const user = res.locals.touristUser as { id: string };
  const { lista } = await ownList(user.id, req.params.id);
  if (!lista) return res.status(404).json({ error: "Lista não encontrada." });
  const updates: Record<string, unknown> = {};
  if (typeof req.body.nome === "string") updates.nome = clip(req.body.nome, 80) || lista.nome;
  for (const k of ["checkIn", "checkOut"] as const) {
    if (k in req.body) updates[k] = ISO.test(String(req.body[k] || "")) ? req.body[k] : null;
  }
  if (typeof req.body.alertas === "boolean") updates.alertas = req.body.alertas;
  // Datas novas: o alerta de vaga pode avisar de novo.
  if ("checkIn" in updates || "checkOut" in updates) await supabase.from("lista_itens").update({ alertaVagaEnviadoEm: null }).eq("listaId", lista.id);
  const { data, error } = await supabase.from("listas_desejos").update(updates).eq("id", lista.id).select().single();
  if (error) return res.status(500).json({ error: "Erro ao salvar a lista." });
  res.json(data);
});

app.delete("/api/turista/listas/:id", requireTourist, async (req, res) => {
  const user = res.locals.touristUser as { id: string };
  const { error } = await supabase.from("listas_desejos").delete().eq("id", req.params.id).eq("turistaId", user.id);
  if (error) return res.status(500).json({ error: "Erro ao apagar a lista." });
  res.json({ success: true });
});

// Em quais listas este item está (para o coração "salvo").
app.get("/api/turista/salvos", requireTourist, async (req, res) => {
  const user = res.locals.touristUser as { id: string };
  const tipo = String(req.query.tipo || "") as Tipo;
  const refId = clip(req.query.refId, 100);
  if (!TIPOS.includes(tipo) || !refId) return res.json({ listas: [] });
  const { data: listas, error } = await supabase.from("listas_desejos").select("id").eq("turistaId", user.id);
  if (error) return isMissing(error) ? res.status(503).json({ error: MIGRATION_MSG }) : res.json({ listas: [] });
  const ids = (listas || []).map((l: any) => l.id);
  const { data } = ids.length ? await supabase.from("lista_itens").select("listaId").in("listaId", ids).eq("tipo", tipo).eq("refId", refId) : { data: [] as any[] };
  res.json({ listas: (data || []).map((r: any) => r.listaId) });
});

app.post("/api/turista/listas/:id/itens", requireTourist, async (req, res) => {
  const user = res.locals.touristUser as { id: string };
  const tipo = String(req.body.tipo || "") as Tipo;
  const refId = clip(req.body.refId, 100);
  if (!TIPOS.includes(tipo) || !refId) return res.status(400).json({ error: "Item inválido." });
  const { lista } = await ownList(user.id, req.params.id);
  if (!lista) return res.status(404).json({ error: "Lista não encontrada." });
  const { count } = await supabase.from("lista_itens").select("id", { count: "exact", head: true }).eq("listaId", lista.id);
  if ((count || 0) >= 100) return res.status(400).json({ error: "Esta lista já tem 100 itens." });
  const { error } = await supabase.from("lista_itens").insert({ id: `li_${randomUUID()}`, listaId: lista.id, tipo, refId, createdAt: new Date().toISOString() });
  if (error && error.code !== "23505") return res.status(500).json({ error: "Erro ao salvar o item." });
  res.status(201).json({ success: true });
});

app.delete("/api/turista/listas/:id/itens", requireTourist, async (req, res) => {
  const user = res.locals.touristUser as { id: string };
  const { lista } = await ownList(user.id, req.params.id);
  if (!lista) return res.status(404).json({ error: "Lista não encontrada." });
  const tipo = String(req.query.tipo || "");
  const refId = clip(req.query.refId, 100);
  await supabase.from("lista_itens").delete().eq("listaId", lista.id).eq("tipo", tipo).eq("refId", refId);
  res.json({ success: true });
});

// Compartilhar: cria (ou revoga) o link público só de leitura.
app.post("/api/turista/listas/:id/compartilhar", requireTourist, async (req, res) => {
  const user = res.locals.touristUser as { id: string };
  const { lista } = await ownList(user.id, req.params.id);
  if (!lista) return res.status(404).json({ error: "Lista não encontrada." });
  const token = lista.shareToken || randomBytes(12).toString("base64url");
  if (!lista.shareToken) await supabase.from("listas_desejos").update({ shareToken: token }).eq("id", lista.id);
  res.json({ url: `${SITE_URL}/lista/${token}` });
});
app.delete("/api/turista/listas/:id/compartilhar", requireTourist, async (req, res) => {
  const user = res.locals.touristUser as { id: string };
  await supabase.from("listas_desejos").update({ shareToken: null }).eq("id", req.params.id).eq("turistaId", user.id);
  res.json({ success: true });
});

// Lista compartilhada (só leitura, sem dados pessoais além do primeiro nome).
app.get("/api/listas/compartilhada/:token", authLimiter, async (req, res) => {
  const token = clip(req.params.token, 40);
  const { data: lista, error } = await supabase.from("listas_desejos").select("*").eq("shareToken", token).maybeSingle();
  if (error && isMissing(error)) return res.status(503).json({ error: MIGRATION_MSG });
  if (!lista || !token) return res.status(404).json({ error: "Lista não encontrada ou não está mais compartilhada." });
  const [{ data: itens }, { data: t }] = await Promise.all([
    supabase.from("lista_itens").select("*").eq("listaId", lista.id).order("createdAt", { ascending: false }),
    supabase.from("turistas").select("name").eq("id", lista.turistaId).maybeSingle(),
  ]);
  res.json({
    nome: lista.nome,
    checkIn: lista.checkIn,
    checkOut: lista.checkOut,
    dono: String(t?.name || "").split(" ")[0] || null,
    itens: await resolveItems((itens || []) as any[]),
  });
});

// "Montar roteiro com estes itens" — a IA sugere um roteiro dia a dia.
app.post("/api/turista/listas/:id/roteiro", chatLimiter, requireTourist, async (req, res) => {
  const user = res.locals.touristUser as { id: string };
  const { lista } = await ownList(user.id, req.params.id);
  if (!lista) return res.status(404).json({ error: "Lista não encontrada." });
  if (!ai) return res.status(503).json({ error: "A assistente de IA não está configurada no momento." });
  const { data: itens } = await supabase.from("lista_itens").select("*").eq("listaId", lista.id);
  const resolved = await resolveItems((itens || []) as any[]);
  if (!resolved.length) return res.status(400).json({ error: "Adicione pousadas, guias, atrações ou pacotes à lista primeiro." });
  const linhas = resolved.map(i => `- [${i.tipo}] ${i.nome}${i.local ? ` (${i.local})` : ""}${i.preco ? ` — ${i.preco}` : ""}`).join("\n");
  const datas = lista.checkIn && lista.checkOut ? `de ${lista.checkIn} a ${lista.checkOut}` : "em datas ainda não definidas";
  const prompt = `Você é a assistente de viagens do Ipantanal (turismo ecológico no Pantanal e outros destinos de natureza no Brasil).
Monte um roteiro dia a dia, em português, para uma viagem ${datas}, usando SOMENTE os itens da lista abaixo (não invente outras pousadas, guias ou preços).
Considere distâncias e deslocamentos realistas entre os lugares, a melhor época de avistamento de fauna e o tempo de descanso.
Se os itens forem de regiões muito distantes, diga isso e sugira dividir em duas viagens.
Formato: título curto; depois "Dia 1", "Dia 2"... com manhã/tarde/noite em tópicos; no fim, 3 dicas práticas. No máximo 350 palavras. Sem markdown de tabela.

Itens da lista:
${linhas}`;
  try {
    const response = await ai.models.generateContent({ model: GEMINI_MODEL, contents: [{ role: "user", parts: [{ text: prompt }] }], config: { temperature: 0.6 } });
    const texto = (response.text || "").trim();
    if (!texto) return res.status(502).json({ error: "A assistente não conseguiu montar o roteiro agora. Tente de novo." });
    res.json({ roteiro: texto });
  } catch (err: any) {
    log.warn("Erro ao montar roteiro da lista:", err?.message);
    res.status(502).json({ error: "A assistente não conseguiu montar o roteiro agora. Tente de novo." });
  }
});
}

// Alertas diários (chamado pelo cron): vaga nas datas da lista e começo da
// época de avistamento perto das pousadas salvas. Cada aviso sai uma vez.
export async function enviarAlertasListas(): Promise<{ vagas: number; epocas: number }> {
  const result = { vagas: 0, epocas: 0 };
  const { data: listas, error } = await supabase.from("listas_desejos").select("*").eq("alertas", true);
  if (error || !listas?.length) return result;
  const hoje = today();
  const mes = new Date().getUTCMonth();
  const mesKey = hoje.slice(0, 7);
  const especies = speciesSeasonStarting(mes);

  for (const lista of listas as any[]) {
    const { data: itens } = await supabase.from("lista_itens").select("*").eq("listaId", lista.id).eq("tipo", "pousada");
    if (!itens?.length) continue;
    const { data: pousadasRows } = await supabase.from("pousadas").select("*").in("id", itens.map((i: any) => i.refId));
    const pousadas = (pousadasRows || []).map(mapPousadaRow);
    const { data: t } = await supabase.from("turistas").select("email, name").eq("id", lista.turistaId).maybeSingle();
    if (!t?.email) continue;

    // 1) Vaga nas datas da lista
    if (listDatesUpcoming(lista.checkIn, lista.checkOut, hoje)) {
      const livres: { item: any; nome: string; id: string }[] = [];
      for (const item of itens as any[]) {
        if (item.alertaVagaEnviadoEm) continue;
        const p = pousadas.find(x => x.id === item.refId);
        if (!p) continue;
        const av = await checkPousadaAvailability(p, lista.checkIn, lista.checkOut, 2).catch(() => ({ ok: false }));
        if ((av as any).ok) livres.push({ item, nome: p.name, id: p.id });
      }
      if (livres.length) {
        const r = await sendEmail({
          to: t.email,
          subject: `Tem vaga nas suas datas — lista "${lista.nome}"`,
          preheader: `${livres.map(l => l.nome).join(", ")} com disponibilidade.`,
          html: `
            <h1 style="margin:0 0 12px;font-size:22px;color:#0B1412">Boa notícia: tem vaga!</h1>
            <p style="margin:0 0 14px">Para as datas da sua lista <strong>${escapeHtml(lista.nome)}</strong> (${escapeHtml(lista.checkIn)} a ${escapeHtml(lista.checkOut)}), estas pousadas estão com disponibilidade agora:</p>
            <ul style="margin:0 0 16px;padding-left:20px">${livres.map(l => `<li style="margin-bottom:6px"><a href="${SITE_URL}/reservar/${encodeURIComponent(l.id)}?checkin=${lista.checkIn}&checkout=${lista.checkOut}" style="color:#087A55;font-weight:600">${escapeHtml(l.nome)}</a></li>`).join("")}</ul>
            <p style="margin:0 0 14px;font-size:13px;color:#4F5D58">A disponibilidade pode mudar rápido na alta temporada.</p>
            <p style="margin:0;font-size:12px;color:#4F5D58">Não quer mais estes avisos? Desligue os alertas da lista no seu perfil.</p>
          `,
        });
        if (r.ok) {
          result.vagas++;
          await supabase.from("lista_itens").update({ alertaVagaEnviadoEm: new Date().toISOString() }).in("id", livres.map(l => l.item.id));
        }
      }
    }

    // 2) Começou a época de alguma espécie perto das pousadas salvas
    if (especies.length && lista.alertaEpocaEnviadoEm !== mesKey) {
      const pares = especies
        .map(s => ({ s, perto: pousadas.filter(p => pousadaNearSpecies(p, s)) }))
        .filter(x => x.perto.length);
      if (pares.length) {
        const r = await sendEmail({
          to: t.email,
          subject: `Começou a época da ${pares[0].s.text.pt.name.toLowerCase()} perto das pousadas da sua lista`,
          preheader: "É a melhor fase do ano para avistar — veja as pousadas que você salvou.",
          html: `
            <h1 style="margin:0 0 12px;font-size:22px;color:#0B1412">A melhor época começou 🐆</h1>
            ${pares.map(({ s, perto }) => `<p style="margin:0 0 14px">É pico de avistamento de <strong>${escapeHtml(s.text.pt.name)}</strong> perto de: ${perto.map(p => `<a href="${SITE_URL}/pousadas/${encodeURIComponent(p.id)}" style="color:#087A55;font-weight:600">${escapeHtml(p.name)}</a>`).join(", ")}.</p>`).join("")}
            <p style="margin:24px 0"><a href="${SITE_URL}/turista/listas" style="display:inline-block;background:#0B1412;color:#FFFFFF;padding:12px 22px;border-radius:999px;text-decoration:none;font-weight:600;font-size:14px">Ver minha lista</a></p>
            <p style="margin:0;font-size:12px;color:#4F5D58">Não quer mais estes avisos? Desligue os alertas da lista no seu perfil.</p>
          `,
        });
        if (r.ok) {
          result.epocas++;
          await supabase.from("listas_desejos").update({ alertaEpocaEnviadoEm: mesKey }).eq("id", lista.id);
        }
      }
    }
  }
  return result;
}
