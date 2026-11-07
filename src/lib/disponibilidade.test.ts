import { describe, it, expect } from "vitest";
import { cabeNaData, datasLivresMaisProximas, shiftISO, noites } from "./disponibilidade";

const pousada = { capacity: 10, rooms: [{ type: "Suíte", capacity: 4, quantity: 1 }], unavailableDates: ["2027-07-20"] };
const now = Date.parse("2027-01-01T00:00:00Z");

describe("disponibilidade", () => {
  it("datas utilitárias", () => {
    expect(shiftISO("2027-02-28", 1)).toBe("2027-03-01");
    expect(noites("2027-07-10", "2027-07-13")).toBe(3);
  });

  it("quarto ocupado, livre e data bloqueada", () => {
    const ocup = [{ checkIn: "2027-07-10", checkOut: "2027-07-13", roomType: "Suíte", status: "pago" }];
    expect(cabeNaData(pousada, ocup, "2027-07-11", "2027-07-12", 2, "Suíte", now)).toBe(false);
    expect(cabeNaData(pousada, ocup, "2027-07-13", "2027-07-15", 2, "Suíte", now)).toBe(true);
    expect(cabeNaData(pousada, [], "2027-07-19", "2027-07-21", 2, "Suíte", now)).toBe(false);
    expect(cabeNaData(pousada, [{ ...ocup[0], status: "cancelado" }], "2027-07-11", "2027-07-12", 2, "Suíte", now)).toBe(true);
  });

  it("vaga segurada vencida não ocupa", () => {
    const ocup = [{ checkIn: "2027-07-10", checkOut: "2027-07-13", roomType: "Suíte", status: "pendente_pagamento", holdUntil: "2026-12-31T00:00:00Z" }];
    expect(cabeNaData(pousada, ocup, "2027-07-10", "2027-07-13", 2, "Suíte", now)).toBe(true);
  });

  it("acha as datas livres mais próximas com as mesmas noites", () => {
    const ocup = [{ checkIn: "2027-07-10", checkOut: "2027-07-14", roomType: "Suíte", status: "pago" }];
    // Pedido 11→13 (2 noites). Livre: 08→10 (−3) ou 14→16 (+3): empate prefere depois.
    expect(datasLivresMaisProximas(pousada, ocup, "2027-07-11", "2027-07-13", 2, "Suíte", { primeiroDia: "2027-01-02", now }))
      .toEqual({ checkIn: "2027-07-14", checkOut: "2027-07-16", diferencaDias: 3 });
    // Sem poder voltar no tempo: só para frente.
    expect(datasLivresMaisProximas(pousada, ocup, "2027-07-10", "2027-07-12", 2, "Suíte", { primeiroDia: "2027-07-10", now })?.checkIn).toBe("2027-07-14");
  });

  it("grupo maior que o quarto não tem sugestão", () => {
    expect(datasLivresMaisProximas(pousada, [], "2027-07-11", "2027-07-13", 6, "Suíte", { primeiroDia: "2027-01-02", now })).toBeNull();
  });

  it("capacidade total (sem tipos de quarto)", () => {
    const p = { capacity: 6 };
    const ocup = [{ checkIn: "2027-07-10", checkOut: "2027-07-12", adults: 4, status: "pago" }];
    expect(cabeNaData(p, ocup, "2027-07-11", "2027-07-12", 3, undefined, now)).toBe(false);
    expect(cabeNaData(p, ocup, "2027-07-11", "2027-07-12", 2, undefined, now)).toBe(true);
  });
});
