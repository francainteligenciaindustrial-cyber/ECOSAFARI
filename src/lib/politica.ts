// Política comercial do Ipantanal num lugar só: comissão, cancelamento do
// hóspede e liberação do repasse. Usada pelo servidor (cálculo de verdade),
// pelo contrato de parceria e pelas telas (o que o cliente vê antes de
// pagar). Sem imports: também é usado pelo servidor.

// ---------------------------------------------------------------- comissão
export const COMISSAO_PADRAO_PCT = 15;
export const COMISSAO_LANCAMENTO_PCT = 10;
export const MESES_LANCAMENTO = 6;

// Comissão de uma pousada hoje: a definida pela Gestão (acordo especial)
// > a de lançamento (6 primeiros meses de contrato) > a padrão.
export function comissaoVigente(p: { commissionPct?: number | null; comissaoLancamentoAte?: string | null }, hojeISO: string, padrao = COMISSAO_PADRAO_PCT): number {
  if (typeof p.commissionPct === "number" && Number.isFinite(p.commissionPct)) return p.commissionPct;
  if (p.comissaoLancamentoAte && hojeISO <= p.comissaoLancamentoAte) return COMISSAO_LANCAMENTO_PCT;
  return padrao;
}

export function fimDoLancamento(aceiteISO: string): string {
  const d = new Date(`${aceiteISO.slice(0, 10)}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + MESES_LANCAMENTO);
  return d.toISOString().slice(0, 10);
}

// ------------------------------------------------------------ cancelamento
// Hora de referência do check-in: 12h em Mato Grosso (UTC−4) = 16h UTC.
export const checkInMomento = (checkIn: string) => Date.parse(`${String(checkIn).slice(0, 10)}T16:00:00Z`);

export const FAIXAS_CANCELAMENTO = [
  { minHoras: 7 * 24, reembolsoPct: 90, rotulo: "Até 7 dias antes do check-in" },
  { minHoras: 48, reembolsoPct: 70, rotulo: "De 7 dias a 48 horas antes" },
  { minHoras: -Infinity, reembolsoPct: 0, rotulo: "Menos de 48 horas antes ou não comparecimento" },
] as const;

// Do valor retido no cancelamento, a maior parte compensa a pousada (vaga
// segurada, preparação); o resto cobre a taxa do cartão que o Stripe não
// devolve no reembolso.
export const RETIDO_POUSADA_PCT = 70;

const r2 = (n: number) => Math.round(n * 100) / 100;

export interface Cancelamento {
  faixa: 0 | 1 | 2;
  rotulo: string;
  horasAntes: number;
  reembolsoPct: number;
  reembolso: number;
  retido: number;
  retidoPousada: number;
  retidoIpantanal: number;
}

export function calcularCancelamento(total: number, checkIn: string, agora = Date.now()): Cancelamento {
  const t = Math.max(0, Number(total) || 0);
  const horasAntes = (checkInMomento(checkIn) - agora) / 3600000;
  const faixa = FAIXAS_CANCELAMENTO.findIndex(f => horasAntes >= f.minHoras) as 0 | 1 | 2;
  const { reembolsoPct, rotulo } = FAIXAS_CANCELAMENTO[faixa];
  const reembolso = r2((t * reembolsoPct) / 100);
  const retido = r2(t - reembolso);
  const retidoPousada = r2((retido * RETIDO_POUSADA_PCT) / 100);
  return { faixa, rotulo, horasAntes, reembolsoPct, reembolso, retido, retidoPousada, retidoIpantanal: r2(retido - retidoPousada) };
}

// Texto curto da política (checkout, voucher, e-mail).
export const RESUMO_CANCELAMENTO =
  "Cancelamento: até 7 dias antes do check-in, reembolso de 90%; de 7 dias a 48 horas antes, 70%; com menos de 48 horas ou não comparecimento, sem reembolso.";

// ---------------------------------------------------------------- repasse
// A parte da pousada fica em custódia até o check-in acontecer: libera 1
// dia depois do check-in (como o Airbnb, ~24 h depois).
export const repasseLiberaEm = (checkIn: string) => checkInMomento(checkIn) + 24 * 3600000;
// Depois disso o hóspede não consegue mais reembolso: a reserva está garantida.
export const reservaGarantidaEm = (checkIn: string) => checkInMomento(checkIn) - 48 * 3600000;
