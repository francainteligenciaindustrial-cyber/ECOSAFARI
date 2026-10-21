// Divisão de cada reserva. A comissão da EcoSafari sai do total; dela saem
// a comissão do afiliado (quem indicou) e a parte da conservação — a
// pousada recebe sempre total − comissão, sem desconto extra.

export interface Split {
  commissionPct: number;
  commission: number; // EcoSafari (bruto)
  affiliate: number; // dentro da comissão
  conservation: number; // dentro da comissão
  platformNet: number; // comissão − afiliado − conservação
  repasse: number; // o que vai para a pousada
}

const r2 = (n: number) => Math.round(n * 100) / 100;

export function splitBooking(total: number, commissionPct: number, affiliatePct = 0, conservationPct = 0): Split {
  const t = Math.max(0, Number(total) || 0);
  const cPct = Math.min(50, Math.max(0, Number(commissionPct) || 0));
  const commission = r2((t * cPct) / 100);
  // Afiliado e conservação nunca passam da comissão (a pousada não paga por eles).
  const affiliate = Math.min(commission, r2((t * Math.max(0, affiliatePct)) / 100));
  const conservation = Math.min(commission - affiliate, r2((t * Math.max(0, conservationPct)) / 100));
  return {
    commissionPct: cPct,
    commission,
    affiliate,
    conservation: r2(conservation),
    platformNet: r2(commission - affiliate - conservation),
    repasse: r2(t - commission),
  };
}
