// "Quais animais são mais vistos perto de cada pousada" — base do mapa do
// site. Junta duas fontes de avistamentos aprovados do app EcoSafari Go:
//  1. registros vinculados à pousada pelo ID (appLodgeId → pousadaCounts);
//  2. pontos com coordenadas a até RADIUS_KM da pousada (só quando a
//     posição da pousada é exata — posição aproximada pela cidade não serve
//     para dizer "perto").
// Para não contar o mesmo avistamento duas vezes (ele pode estar vinculado à
// pousada E ter coordenada perto dela), fica o maior dos dois números.
import type { SightingPoint } from "./sightingStats";
import { distanceKm } from "./mapsLinks";

export const NEARBY_RADIUS_KM = 40;

export interface PlacedPousada {
  id: string;
  lat: number;
  lng: number;
  exact: boolean;
}

export interface LinkedSpecies {
  name: string;
  pousadaCounts: Record<string, number>;
}

export interface NearbySpecies {
  name: string;
  count: number;
}

const normalize = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

export { distanceKm };

export function speciesNearPousadas(
  pousadas: PlacedPousada[],
  points: SightingPoint[],
  linked: LinkedSpecies[],
  radiusKm = NEARBY_RADIUS_KM
): Record<string, NearbySpecies[]> {
  const result: Record<string, NearbySpecies[]> = {};
  for (const p of pousadas) {
    // nome normalizado → { nome exibido, por raio, por vínculo }
    const acc = new Map<string, { name: string; near: number; linked: number }>();
    const entry = (name: string) => {
      const key = normalize(name);
      let e = acc.get(key);
      if (!e) {
        e = { name, near: 0, linked: 0 };
        acc.set(key, e);
      }
      return e;
    };
    if (p.exact) {
      for (const pt of points) {
        if (distanceKm(p.lat, p.lng, pt.lat, pt.lng) <= radiusKm) entry(pt.speciesName).near += pt.count;
      }
    }
    for (const s of linked) {
      const n = s.pousadaCounts?.[p.id] || 0;
      if (n > 0) entry(s.name).linked += n;
    }
    result[p.id] = [...acc.values()]
      .map(e => ({ name: e.name, count: Math.max(e.near, e.linked) }))
      .filter(e => e.count > 0)
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  }
  return result;
}

// Quantas vezes a espécie (pelo nome) foi vista perto da pousada.
export function countFor(list: NearbySpecies[] | undefined, speciesName: string, sameSpecies: (a: string, b: string) => boolean): number {
  return (list || []).filter(s => sameSpecies(s.name, speciesName)).reduce((acc, s) => acc + s.count, 0);
}
