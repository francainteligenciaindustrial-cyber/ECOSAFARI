import { describe, it, expect } from "vitest";
import { renderContrato, hashContrato } from "./contratoParceria";

const base = {
  pousadaNome: "Pousada Vagalume", razaoSocial: "Vagalume Turismo LTDA", documento: "11222333000181", endereco: "Barra do Bugres/MT",
  responsavelNome: "Maria Silva", responsavelCpf: "52998224725", responsavelCargo: "Sócia", responsavelEmail: "maria@vagalume.com.br",
  pixTipo: "cnpj", pixChave: "11222333000181", comissaoPct: 15, comLancamento: true, dataISO: "2026-11-07T12:00:00Z",
};

describe("contrato de parceria", () => {
  it("traz partes, comissão de lançamento, Pix e a política de cancelamento", () => {
    const t = renderContrato(base);
    expect(t).toContain("Vagalume Turismo LTDA");
    expect(t).toContain("CNPJ 11.222.333/0001-81");
    expect(t).toContain("CPF 529.982.247-25");
    expect(t).toContain("comissão de 15%");
    expect(t).toContain("será de 10% (condição de lançamento)");
    expect(t).toContain("Chave Pix (cnpj): 11222333000181");
    expect(t).toContain("reembolso de 90%");
    expect(t).toContain("reembolso de 70%");
    expect(t).toContain("70% cabe à PARCEIRA");
    expect(t).toContain("07/11/2026");
  });
  it("sem lançamento não promete 10%", () => {
    expect(renderContrato({ ...base, comLancamento: false })).not.toContain("condição de lançamento");
  });
  it("hash muda se o texto mudar", () => {
    const a = renderContrato(base);
    expect(hashContrato(a)).toBe(hashContrato(a));
    expect(hashContrato(a)).not.toBe(hashContrato(renderContrato({ ...base, comissaoPct: 14 })));
  });
});
