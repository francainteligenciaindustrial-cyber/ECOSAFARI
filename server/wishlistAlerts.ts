// Regras puras dos alertas da lista de desejos.
import { WILD_SPECIES } from "../src/data/wildSpecies.js";
import { approximatePosition } from "../src/data/places.js";
import { distanceKm } from "../src/lib/mapsLinks.js";

// Espécies cuja época de PICO começa neste mês (mês anterior não era pico).
// month: 0 = janeiro.
export function speciesSeasonStarting(month: number) {
  const prev = (month + 11) % 12;
  return WILD_SPECIES.filter(s => s.season[month] === 2 && s.season[prev] !== 2);
}

// A pousada fica perto (≤ km) de alguma área onde a espécie é vista?
export function pousadaNearSpecies(p: { latitude?: number; longitude?: number; location?: string }, species: { areas: { lat: number; lng: number }[] }, km = 150): boolean {
  const pos = typeof p.latitude === "number" && typeof p.longitude === "number"
    ? { lat: p.latitude, lng: p.longitude }
    : approximatePosition(p.location);
  if (!pos) return false;
  return species.areas.some(a => distanceKm(pos.lat, pos.lng, a.lat, a.lng) <= km);
}

// Datas da lista ainda no futuro (alerta de vaga só faz sentido assim).
export function listDatesUpcoming(checkIn: string | null | undefined, checkOut: string | null | undefined, today: string): boolean {
  return !!checkIn && !!checkOut && checkIn > today && checkOut > checkIn;
}
