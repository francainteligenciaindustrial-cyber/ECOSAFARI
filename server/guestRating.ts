// Regras da avaliação de turistas pelos prestadores (puras, sem banco).

// Reservas que de fato aconteceram (pagas/confirmadas — não pendentes nem
// canceladas).
const HAPPENED = new Set(["pago", "confirmado_pousada", "confirmado_guia", "confirmado_total"]);

// Prazo para avaliar depois do check-out.
export const RATING_WINDOW_DAYS = 30;

export interface RatableBooking {
  status: string;
  checkOut: string; // YYYY-MM-DD
}

const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86400000);

// Pode avaliar? Estadia concluída (check-out até hoje) e dentro do prazo.
export function ratingWindow(b: RatableBooking, today: string): { ok: true } | { ok: false; motivo: string } {
  if (!HAPPENED.has(b.status)) return { ok: false, motivo: "Só dá para avaliar reservas pagas ou confirmadas." };
  if (!/^\d{4}-\d{2}-\d{2}/.test(b.checkOut)) return { ok: false, motivo: "Reserva sem data de check-out." };
  const since = daysBetween(b.checkOut.slice(0, 10), today);
  if (since < 0) return { ok: false, motivo: "A avaliação abre depois do check-out." };
  if (since > RATING_WINDOW_DAYS) return { ok: false, motivo: `O prazo para avaliar (${RATING_WINDOW_DAYS} dias após o check-out) terminou.` };
  return { ok: true };
}

export const clampScore = (v: unknown): number | null => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) && n >= 1 && n <= 5 ? n : null;
};

export interface GuestRatingRow {
  notaComunicacao: number;
  notaRegras: number;
  notaCuidado: number;
  nota: number;
  comentario?: string | null;
  autorTipo: string;
  autorNome?: string | null;
  createdAt: string;
}

export function summarizeGuestRatings(rows: GuestRatingRow[]) {
  const total = rows.length;
  const avg = (pick: (r: GuestRatingRow) => number) => (total ? Math.round((rows.reduce((a, r) => a + Number(pick(r) || 0), 0) / total) * 10) / 10 : null);
  return {
    total,
    media: avg(r => r.nota),
    comunicacao: avg(r => r.notaComunicacao),
    regras: avg(r => r.notaRegras),
    cuidado: avg(r => r.notaCuidado),
    comentarios: rows
      .filter(r => r.comentario && r.comentario.trim())
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, 5)
      .map(r => ({ nota: Number(r.nota), comentario: String(r.comentario), autorTipo: r.autorTipo, autorNome: r.autorNome || null, createdAt: r.createdAt })),
  };
}
