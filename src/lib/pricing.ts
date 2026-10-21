// Preço por temporada: a pousada pode definir a diária de cada mês
// (precosPorMes = {"7": 600, ...}); mês sem valor usa a diária padrão.
// O total de uma estadia é somado noite a noite pelo mês de cada noite.

export type PrecosPorMes = Record<string, number> | null | undefined;

interface Priced { pricePerNight: number; precosPorMes?: PrecosPorMes }

export function normalizePrecosPorMes(input: unknown): Record<string, number> | null {
  if (!input || typeof input !== "object") return null;
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    const m = Number(k);
    const price = Math.round(Number(v) * 100) / 100;
    if (Number.isInteger(m) && m >= 1 && m <= 12 && Number.isFinite(price) && price > 0) out[String(m)] = price;
  }
  return Object.keys(out).length ? out : null;
}

export function nightlyPrice(p: Priced, month: number): number {
  const v = p.precosPorMes?.[String(month)];
  return typeof v === "number" && v > 0 ? v : p.pricePerNight;
}

// Soma das diárias entre check-in (inclusive) e check-out (exclusive).
export function lodgingTotal(p: Priced, checkIn: string, checkOut: string): number {
  const start = Date.parse(`${checkIn.slice(0, 10)}T12:00:00Z`);
  const end = Date.parse(`${checkOut.slice(0, 10)}T12:00:00Z`);
  const nights = Math.max(1, Math.round((end - start) / 86400000));
  let total = 0;
  for (let i = 0; i < nights; i++) total += nightlyPrice(p, new Date(start + i * 86400000).getUTCMonth() + 1);
  return Math.round(total * 100) / 100;
}

// "A partir de": a menor diária do ano.
export function minNightlyPrice(p: Priced): number {
  const values = [p.pricePerNight, ...Object.values(p.precosPorMes || {})].filter(v => typeof v === "number" && v > 0);
  return values.length ? Math.min(...values) : p.pricePerNight;
}

export const hasSeasonalPricing = (p: Priced) => !!p.precosPorMes && Object.keys(p.precosPorMes).length > 0;
