// Coordenadas aproximadas de cidades/localidades da região — usadas pelo
// mapa só quando o parceiro ainda não marcou a posição exata da pousada
// (latitude/longitude no portal). O pin aparece como "aproximado".
const PLACES: { match: RegExp; lat: number; lng: number }[] = [
  { match: /porto jofre/i, lat: -17.36, lng: -56.77 },
  { match: /transpantaneira/i, lat: -16.5, lng: -56.74 },
  { match: /pocon[eé]/i, lat: -16.257, lng: -56.624 },
  { match: /bar[aã]o de melga[cç]o/i, lat: -16.194, lng: -55.968 },
  { match: /santo ant[oô]nio de leverger/i, lat: -15.866, lng: -56.079 },
  { match: /chapada dos guimar[aã]es/i, lat: -15.461, lng: -55.75 },
  { match: /v[aá]rzea grande/i, lat: -15.646, lng: -56.132 },
  { match: /cuiab[aá]/i, lat: -15.601, lng: -56.097 },
  { match: /c[aá]ceres/i, lat: -16.071, lng: -57.679 },
  { match: /nobres/i, lat: -14.721, lng: -56.328 },
  { match: /rondon[oó]polis/i, lat: -16.467, lng: -54.637 },
  { match: /corumb[aá]/i, lat: -19.008, lng: -57.651 },
  { match: /miranda/i, lat: -20.241, lng: -56.378 },
  { match: /aquidauana/i, lat: -20.467, lng: -55.787 },
  { match: /bonito/i, lat: -21.126, lng: -56.484 },
  { match: /campo grande/i, lat: -20.47, lng: -54.62 },
  { match: /pantanal norte|pantanal mato-grossense/i, lat: -16.8, lng: -56.7 },
  { match: /pantanal sul|pantanal sul-mato-grossense/i, lat: -19.6, lng: -56.9 },
];

export function approximatePosition(location: string | undefined): { lat: number; lng: number } | null {
  if (!location) return null;
  const hit = PLACES.find(p => p.match.test(location));
  return hit ? { lat: hit.lat, lng: hit.lng } : null;
}

// Pinos diferentes na mesma cidade não podem cair exatamente no mesmo ponto
// (um esconderia o outro): espalha em espiral, ~1,5 km por pino.
export function spread(lat: number, lng: number, index: number): { lat: number; lng: number } {
  if (index === 0) return { lat, lng };
  const angle = index * 2.399; // ângulo áureo
  const r = 0.014 * Math.sqrt(index);
  return { lat: lat + r * Math.sin(angle), lng: lng + r * Math.cos(angle) };
}
