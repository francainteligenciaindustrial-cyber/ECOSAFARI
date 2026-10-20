// Avistamentos reais do app EcoSafari Go (agregados, sem dado pessoal) →
// formato usado pelo calendário de melhor época e pelo mapa do site.
// Ver scripts/app-ecosafari-go/estatisticas-publicas.sql (lado do app).
import type { SeasonLevel } from "../data/wildSpecies";

// Linha devolvida por ecosafari_sighting_stats() no banco do app.
export interface AppStatRow {
  species_key: string;
  species_name: string;
  scientific_name: string | null;
  lodge_id: string | null;
  year: number;
  month: number; // 1–12
  sightings: number;
  lat: number | null;
  lng: number | null;
}

export interface SpeciesSightingStats {
  key: string;
  name: string;
  scientificName?: string;
  monthly: number[]; // Jan..Dez, todos os anos somados
  total: number;
  topPousadaId?: string; // pousada do site com mais avistamentos aprovados
  pousadaCounts: Record<string, number>; // id da pousada no site → avistamentos
}

export interface SightingPoint {
  speciesKey: string;
  speciesName: string;
  lat: number;
  lng: number;
  count: number;
}

export interface SightingStats {
  species: SpeciesSightingStats[];
  points: SightingPoint[];
  totalSightings: number;
  updatedAt: string;
}

// Com um único avistamento o calendário da espécie já passa a refletir os
// dados reais do app (decisão do produto: mostrar o que está acontecendo,
// registro a registro). Espécie sem nenhum registro usa a época de referência.
export const MIN_SIGHTINGS_FOR_SEASON = 1;

// appLodgeId (UUID da pousada no app) → id da pousada no site. O vínculo é
// feito pelo admin, pelo ID — nunca pelo nome.
export function aggregateStats(rows: AppStatRow[], lodgeToPousada: Map<string, string>, now = new Date()): SightingStats {
  const bySpecies = new Map<string, SpeciesSightingStats & { perPousada: Map<string, number> }>();
  const byPoint = new Map<string, SightingPoint>();
  let totalSightings = 0;

  for (const r of rows) {
    const n = Number(r.sightings) || 0;
    if (n <= 0 || !r.species_key || r.month < 1 || r.month > 12) continue;
    totalSightings += n;
    let s = bySpecies.get(r.species_key);
    if (!s) {
      s = { key: r.species_key, name: r.species_name, scientificName: r.scientific_name || undefined, monthly: Array(12).fill(0), total: 0, pousadaCounts: {}, perPousada: new Map() };
      bySpecies.set(r.species_key, s);
    }
    s.monthly[r.month - 1] += n;
    s.total += n;
    const pousadaId = r.lodge_id ? lodgeToPousada.get(r.lodge_id) : undefined;
    if (pousadaId) s.perPousada.set(pousadaId, (s.perPousada.get(pousadaId) || 0) + n);

    if (r.lat != null && r.lng != null && Number.isFinite(Number(r.lat)) && Number.isFinite(Number(r.lng))) {
      const key = `${r.species_key}|${r.lat}|${r.lng}`;
      const p = byPoint.get(key) || { speciesKey: r.species_key, speciesName: r.species_name, lat: Number(r.lat), lng: Number(r.lng), count: 0 };
      p.count += n;
      byPoint.set(key, p);
    }
  }

  const species = [...bySpecies.values()]
    .map(({ perPousada, ...s }) => {
      const top = [...perPousada.entries()].sort((a, b) => b[1] - a[1])[0];
      return { ...s, topPousadaId: top?.[0], pousadaCounts: Object.fromEntries(perPousada) };
    })
    .sort((a, b) => b.total - a.total);

  return { species, points: [...byPoint.values()], totalSightings, updatedAt: now.toISOString() };
}

// Pico = meses com ≥ 60% do mês mais forte; boa = qualquer outro mês com
// registro (≥ 20% do mais forte); sem registro, baixa.
export function seasonFromMonthly(monthly: number[], total: number): SeasonLevel[] | null {
  if (total < MIN_SIGHTINGS_FOR_SEASON) return null;
  const max = Math.max(...monthly);
  if (max <= 0) return null;
  return monthly.map(n => (n <= 0 ? 0 : n >= max * 0.6 ? 2 : n >= max * 0.2 ? 1 : 0)) as SeasonLevel[];
}

// Várias espécies do app podem ser a mesma do site (ex.: "Arara" e
// "Canindé" → Arara-Canindé): soma tudo e recalcula a pousada que mais
// registrou.
export function mergeSpeciesStats(list: SpeciesSightingStats[]): SpeciesSightingStats | undefined {
  if (list.length === 0) return undefined;
  if (list.length === 1) return list[0];
  const monthly = Array(12).fill(0);
  const pousadaCounts: Record<string, number> = {};
  for (const s of list) {
    s.monthly.forEach((n, i) => { monthly[i] += n; });
    for (const [id, n] of Object.entries(s.pousadaCounts || {})) pousadaCounts[id] = (pousadaCounts[id] || 0) + n;
  }
  const top = Object.entries(pousadaCounts).sort((a, b) => b[1] - a[1])[0];
  return {
    key: list.map(s => s.key).join("+"),
    name: list[0].name,
    scientificName: list.find(s => s.scientificName)?.scientificName,
    monthly,
    total: monthly.reduce((a, b) => a + b, 0),
    topPousadaId: top?.[0],
    pousadaCounts,
  };
}
