// Links de navegação da seção "Localização e como chegar" da pousada.
// Não embutimos o mapa do Google (cookies de rastreamento → exigiria
// consentimento pela LGPD): o mini-mapa é OpenStreetMap e os botões abrem o
// Google Maps / Waze no app do celular ou numa nova aba.
import { distanceKm } from "./nearbySightings";

// Ficha da pousada no Google (fotos, avaliações de lá). Só aceita endereços
// do próprio Google Maps — nada de link arbitrário num botão do site.
export function isGoogleMapsUrl(raw: string): boolean {
  try {
    const u = new URL(raw.trim());
    if (u.protocol !== "https:") return false;
    const host = u.hostname.toLowerCase();
    if (host === "maps.app.goo.gl" || host === "goo.gl" || host === "g.co") return u.pathname.length > 1;
    if (/^(www\.|maps\.)?google\.[a-z.]{2,6}$/.test(host)) return host.startsWith("maps.") || u.pathname.startsWith("/maps");
    return false;
  } catch {
    return false;
  }
}

// Tira o rastro de sessão que o Google cola no fim do link copiado
// (?entry=ttu&g_ep=...) — a ficha abre igual sem ele.
export function cleanGoogleMapsUrl(raw: string): string {
  const u = new URL(raw.trim());
  for (const p of ["entry", "g_ep", "g_st", "utm_source", "utm_medium", "utm_campaign"]) u.searchParams.delete(p);
  return u.toString();
}

const coords = (lat: number, lng: number) => `${lat},${lng}`;

export const directionsUrl = (lat: number, lng: number) =>
  `https://www.google.com/maps/dir/?api=1&destination=${coords(lat, lng)}`;

export const wazeUrl = (lat: number, lng: number) =>
  `https://waze.com/ul?ll=${coords(lat, lng)}&navigate=yes`;

// Sem ficha do Google cadastrada, "Ver no Google Maps" abre o ponto exato.
export const placeUrl = (lat: number, lng: number) =>
  `https://www.google.com/maps/search/?api=1&query=${coords(lat, lng)}`;

// Referências de chegada para quem vem de fora (aeroporto onde o turista
// pousa). Distância em linha reta — a de estrada é maior, e o texto diz isso.
export const REFERENCE_POINTS = [
  { id: "cgb", name: "Aeroporto de Cuiabá (CGB)", lat: -15.6529, lng: -56.1167 },
];

export function referenceDistances(lat: number, lng: number) {
  return REFERENCE_POINTS.map(r => ({ ...r, km: Math.round(distanceKm(lat, lng, r.lat, r.lng)) }));
}

export const hasCoordinates = (p: { latitude?: number; longitude?: number }): p is { latitude: number; longitude: number } =>
  typeof p.latitude === "number" && typeof p.longitude === "number" && Number.isFinite(p.latitude) && Number.isFinite(p.longitude);
