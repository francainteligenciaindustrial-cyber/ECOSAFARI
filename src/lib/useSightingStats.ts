import { useEffect, useState } from "react";
import { mergeSpeciesStats, type SightingStats, type SpeciesSightingStats } from "./sightingStats";
import { findWildSpecies } from "../data/wildSpecies";

// Uma busca por visita (o servidor já guarda 1h de cache).
let pending: Promise<SightingStats | null> | null = null;

export function useSightingStats(): SightingStats | null {
  const [stats, setStats] = useState<SightingStats | null>(null);
  useEffect(() => {
    if (!pending) {
      pending = fetch("/api/avistamentos/estatisticas")
        .then(res => (res.ok ? res.json() : null))
        .then(data => (data && Array.isArray(data.species) ? data : null))
        .catch(() => null);
    }
    let cancelled = false;
    pending.then(s => { if (!cancelled) setStats(s); });
    return () => { cancelled = true; };
  }, []);
  return stats;
}

const normalize = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

type SpeciesRef = { id: string; name: string; scientificName?: string };

// A espécie do app é a mesma exibida no site? Pelo nome científico, pelo
// id/apelidos conhecidos (src/data/wildSpecies.ts) ou pelo nome comum.
function isSameSpecies(s: SpeciesSightingStats, species: SpeciesRef): boolean {
  const wild = findWildSpecies(species.id) || findWildSpecies(species.name);
  const sci = normalize(species.scientificName || wild?.scientificName || "");
  if (sci && s.scientificName && normalize(s.scientificName) === sci) return true;
  const sWild = findWildSpecies(s.name);
  if (wild && sWild && sWild.id === wild.id) return true;
  return normalize(s.name) === normalize(species.name);
}

// Todos os registros do app desta espécie, somados.
export function matchSpeciesStats(stats: SightingStats | null, species: SpeciesRef): SpeciesSightingStats | undefined {
  if (!stats) return undefined;
  return mergeSpeciesStats(stats.species.filter(s => isSameSpecies(s, species)));
}

// Chave = UUID quando o avistamento usa uma espécie do catálogo do app; texto
// livre digitado pelo hóspede vira chave de texto.
const isCatalogKey = (key: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(key);

// A espécie pode aparecer no site sozinha? Só se for do catálogo do app —
// texto livre (que pode ser teste ou erro de digitação) só soma quando casa
// com uma espécie que o site já conhece.
export const isPublishableAppSpecies = (s: { key: string }) => s.key.split("+").every(isCatalogKey);

// Espécies do catálogo do app que ainda não têm linha no site — viram linhas
// extras no calendário (nomes iguais com/sem acento são unificados).
export function unmatchedSpeciesStats(stats: SightingStats | null, shown: SpeciesRef[]): SpeciesSightingStats[] {
  if (!stats) return [];
  const leftovers = stats.species.filter(s => isPublishableAppSpecies(s) && !shown.some(sp => isSameSpecies(s, sp)));
  const byName = new Map<string, SpeciesSightingStats[]>();
  for (const s of leftovers) {
    const key = normalize(s.name);
    byName.set(key, [...(byName.get(key) || []), s]);
  }
  return [...byName.values()].map(list => mergeSpeciesStats(list)!).sort((a, b) => b.total - a.total);
}

// Pontos do mapa: só espécies do catálogo do app ou que casam com uma
// espécie exibida no site.
export function publishablePoints(stats: SightingStats | null, shown: SpeciesRef[]) {
  if (!stats) return [];
  const ok = new Set(stats.species.filter(s => isPublishableAppSpecies(s) || shown.some(sp => isSameSpecies(s, sp))).map(s => s.key));
  return stats.points.filter(p => ok.has(p.speciesKey));
}
