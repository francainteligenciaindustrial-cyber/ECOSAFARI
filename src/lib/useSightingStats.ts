import { useEffect, useState } from "react";
import type { SightingStats, SpeciesSightingStats } from "./sightingStats";
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

// Casa a espécie do app com a espécie exibida no site: pelo nome científico,
// pelo id/apelidos conhecidos (src/data/wildSpecies.ts) ou pelo nome comum.
export function matchSpeciesStats(stats: SightingStats | null, species: { id: string; name: string; scientificName?: string }): SpeciesSightingStats | undefined {
  if (!stats) return undefined;
  const wild = findWildSpecies(species.id) || findWildSpecies(species.name);
  const sci = normalize(species.scientificName || wild?.scientificName || "");
  return stats.species.find(s => {
    if (sci && s.scientificName && normalize(s.scientificName) === sci) return true;
    const sWild = findWildSpecies(s.name);
    if (wild && sWild && sWild.id === wild.id) return true;
    return normalize(s.name) === normalize(species.name);
  });
}
