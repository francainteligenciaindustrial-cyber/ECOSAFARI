// Links de navegação da seção "Localização e como chegar" da pousada.
// Não embutimos o mapa do Google (cookies de rastreamento → exigiria
// consentimento pela LGPD): o mini-mapa é OpenStreetMap e os botões abrem o
// Google Maps / Waze no app do celular ou numa nova aba.
// Sem imports: este arquivo também roda no servidor (server/routes/catalogo.ts),
// onde o Node exige caminho com extensão — um import relativo derrubaria a
// função inteira na Vercel.

export function distanceKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(bLat - aLat);
  const dLng = rad(bLng - aLng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(aLat)) * Math.cos(rad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.min(1, Math.sqrt(h)));
}

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
// Aeroportos com voo comercial perto dos destinos do catálogo — a seção
// mostra o mais próximo da pousada.
export const REFERENCE_POINTS = [
  { id: "cgb", name: "Aeroporto de Cuiabá (CGB)", lat: -15.6529, lng: -56.1167 },
  { id: "cgr", name: "Aeroporto de Campo Grande (CGR)", lat: -20.4687, lng: -54.6725 },
  { id: "afl", name: "Aeroporto de Alta Floresta (AFL)", lat: -9.8664, lng: -56.105 },
  { id: "mao", name: "Aeroporto de Manaus (MAO)", lat: -3.0386, lng: -60.0497 },
  { id: "pmw", name: "Aeroporto de Palmas (PMW)", lat: -10.2915, lng: -48.357 },
  { id: "lec", name: "Aeroporto de Lençóis (LEC)", lat: -12.4823, lng: -41.277 },
  { id: "bsb", name: "Aeroporto de Brasília (BSB)", lat: -15.8711, lng: -47.9186 },
];

export function referenceDistances(lat: number, lng: number) {
  return REFERENCE_POINTS.map(r => ({ ...r, km: Math.round(distanceKm(lat, lng, r.lat, r.lng)) }));
}

export function nearestReference(lat: number, lng: number) {
  return referenceDistances(lat, lng).sort((a, b) => a.km - b.km)[0];
}

// Sem coordenada exata: Google Maps / Waze procuram a pousada pelo nome e
// cidade — o Google acha o estabelecimento certo, melhor que um ponto chutado.
export const searchUrl = (query: string) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
export const directionsQueryUrl = (query: string) => `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(query)}`;
export const wazeQueryUrl = (query: string) => `https://waze.com/ul?q=${encodeURIComponent(query)}&navigate=yes`;

export const hasCoordinates = (p: { latitude?: number; longitude?: number }): p is { latitude: number; longitude: number } =>
  typeof p.latitude === "number" && typeof p.longitude === "number" && Number.isFinite(p.latitude) && Number.isFinite(p.longitude);
