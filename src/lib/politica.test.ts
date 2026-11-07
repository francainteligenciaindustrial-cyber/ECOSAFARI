import { describe, it, expect } from "vitest";
import { calcularCancelamento, comissaoVigente, fimDoLancamento, checkInMomento, repasseLiberaEm, reservaGarantidaEm, COMISSAO_PADRAO_PCT, COMISSAO_LANCAMENTO_PCT } from "./politica";
import { cpfValido, cnpjValido, pixChaveValida, formatarDocumento } from "./documentos";

const H = 3600000;

describe("comissão", () => {
  it("acordo da Gestão > lançamento > padrão", () => {
    expect(comissaoVigente({ commissionPct: 12 }, "2027-01-01")).toBe(12);
    expect(comissaoVigente({ comissaoLancamentoAte: "2027-05-01" }, "2027-01-01")).toBe(COMISSAO_LANCAMENTO_PCT);
    expect(comissaoVigente({ comissaoLancamentoAte: "2027-05-01" }, "2027-05-02")).toBe(COMISSAO_PADRAO_PCT);
    expect(comissaoVigente({}, "2027-01-01")).toBe(COMISSAO_PADRAO_PCT);
  });
  it("lançamento dura 6 meses", () => {
    expect(fimDoLancamento("2026-11-07T10:00:00Z")).toBe("2027-05-07");
  });
});

describe("cancelamento", () => {
  const ci = "2027-07-20";
  const m = checkInMomento(ci);
  it("até 7 dias: 90% de volta; retido dividido 70/30", () => {
    const c = calcularCancelamento(1000, ci, m - 8 * 24 * H);
    expect([c.faixa, c.reembolso, c.retido, c.retidoPousada, c.retidoIpantanal]).toEqual([0, 900, 100, 70, 30]);
  });
  it("de 7 dias a 48 h: 70% de volta", () => {
    const c = calcularCancelamento(1000, ci, m - 3 * 24 * H);
    expect([c.faixa, c.reembolso, c.retido, c.retidoPousada]).toEqual([1, 700, 300, 210]);
  });
  it("menos de 48 h: sem reembolso", () => {
    const c = calcularCancelamento(1000, ci, m - 47 * H);
    expect([c.faixa, c.reembolso, c.retido]).toEqual([2, 0, 1000]);
  });
  it("exatamente no limite de 7 dias ainda é a faixa melhor", () => {
    expect(calcularCancelamento(500, ci, m - 7 * 24 * H).faixa).toBe(0);
  });
  it("custódia: garantida 48 h antes, liberada 24 h depois do check-in", () => {
    expect(m - reservaGarantidaEm(ci)).toBe(48 * H);
    expect(repasseLiberaEm(ci) - m).toBe(24 * H);
  });
});

describe("documentos e Pix", () => {
  it("CPF e CNPJ", () => {
    expect(cpfValido("529.982.247-25")).toBe(true);
    expect(cpfValido("111.111.111-11")).toBe(false);
    expect(cpfValido("529.982.247-24")).toBe(false);
    expect(cnpjValido("11.222.333/0001-81")).toBe(true);
    expect(cnpjValido("11.222.333/0001-80")).toBe(false);
    expect(formatarDocumento("11222333000181")).toBe("11.222.333/0001-81");
  });
  it("chaves Pix", () => {
    expect(pixChaveValida("email", "financeiro@pousada.com.br")).toBe(true);
    expect(pixChaveValida("telefone", "+55 (65) 99999-8888")).toBe(true);
    expect(pixChaveValida("aleatoria", "123e4567-e89b-12d3-a456-426614174000")).toBe(true);
    expect(pixChaveValida("cnpj", "11.222.333/0001-80")).toBe(false);
  });
});
