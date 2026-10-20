// Avistamentos reais do app EcoSafari Go (banco Supabase separado) para o
// calendário de melhor época e o mapa. O site só lê números agregados pelas
// funções de scripts/app-ecosafari-go/estatisticas-publicas.sql, com a chave
// pública do app — nenhum dado pessoal atravessa.
import type { Express } from "express";
import { aggregateStats, type AppStatRow, type SightingStats } from "../../src/lib/sightingStats.js";
import { log, requireAdmin, supabase } from "../core.js";

const APP_URL = (process.env.APP_SUPABASE_URL || "").replace(/\/$/, "");
const APP_KEY = process.env.APP_SUPABASE_ANON_KEY || "";
const CACHE_MS = 60 * 60 * 1000;

let cache: { at: number; data: SightingStats } | null = null;

async function appRpc<T>(fn: string, body: Record<string, unknown> = {}): Promise<T> {
  const res = await fetch(`${APP_URL}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: { apikey: APP_KEY, Authorization: `Bearer ${APP_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`App respondeu ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res.json() as Promise<T>;
}

export function registerAvistamentosRoutes(app: Express) {

// Público: agregado por espécie/mês e pontos (~1 km). Sem o app configurado,
// responde vazio e o site usa a sazonalidade conhecida de cada espécie.
app.get("/api/avistamentos/estatisticas", async (req, res) => {
  if (!APP_URL || !APP_KEY) return res.json({ species: [], points: [], totalSightings: 0, updatedAt: null, source: "none" });
  try {
    if (!cache || Date.now() - cache.at > CACHE_MS) {
      const [rows, { data: links }] = await Promise.all([
        appRpc<AppStatRow[]>("ecosafari_sighting_stats"),
        supabase.from("pousadas").select("id, appLodgeId").not("appLodgeId", "is", null),
      ]);
      const lodgeToPousada = new Map<string, string>(((links || []) as any[]).filter(l => l.appLodgeId).map(l => [String(l.appLodgeId), String(l.id)]));
      cache = { at: Date.now(), data: aggregateStats(rows || [], lodgeToPousada) };
    }
    res.setHeader("Cache-Control", "public, max-age=900");
    res.json({ ...cache.data, source: "app" });
  } catch (err: any) {
    log.warn("Falha ao buscar estatísticas do app:", err?.message);
    // Serve o último resultado bom, se houver; senão, vazio.
    res.json(cache ? { ...cache.data, source: "app-cache" } : { species: [], points: [], totalSightings: 0, updatedAt: null, source: "none" });
  }
});

// Lista de pousadas do app para o admin vincular cada pousada do site.
app.get("/api/admin/app-lodges", requireAdmin, async (req, res) => {
  if (!APP_URL || !APP_KEY) return res.status(503).json({ error: "Configure APP_SUPABASE_URL e APP_SUPABASE_ANON_KEY (projeto do app) na Vercel." });
  try {
    res.json(await appRpc<{ id: string; name: string; slug: string }[]>("ecosafari_public_lodges"));
  } catch (err: any) {
    log.warn("Falha ao listar pousadas do app:", err?.message);
    res.status(502).json({ error: "Não foi possível consultar o app. Rodou scripts/app-ecosafari-go/estatisticas-publicas.sql no Supabase do app?" });
  }
});

// Limpa o cache quando o admin muda um vínculo (próxima consulta recalcula).
app.post("/api/admin/app-stats/refresh", requireAdmin, (req, res) => {
  cache = null;
  res.json({ success: true });
});
}
