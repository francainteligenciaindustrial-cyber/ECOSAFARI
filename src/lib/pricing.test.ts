import { describe, expect, it } from "vitest";
import { lodgingTotal, minNightlyPrice, nightlyPrice, normalizePrecosPorMes } from "./pricing";
import { splitBooking } from "./finance";

const p = { pricePerNight: 400, precosPorMes: { "7": 600, "8": 650 } };

describe("preço por temporada", () => {
  it("usa a diária do mês ou a padrão", () => {
    expect(nightlyPrice(p, 7)).toBe(600);
    expect(nightlyPrice(p, 2)).toBe(400);
  });
  it("soma noite a noite atravessando meses", () => {
    // 30/jun, 1/jul, 2/jul → 400 + 600 + 600
    expect(lodgingTotal(p, "2026-06-30", "2026-07-03")).toBe(1600);
    expect(lodgingTotal({ pricePerNight: 300 }, "2026-01-10", "2026-01-12")).toBe(600);
  });
  it("a partir de = menor diária do ano", () => {
    expect(minNightlyPrice({ pricePerNight: 400, precosPorMes: { "2": 320 } })).toBe(320);
  });
  it("limpa valores inválidos", () => {
    expect(normalizePrecosPorMes({ "7": "600", "13": 10, "2": -5, x: 3 })).toEqual({ "7": 600 });
    expect(normalizePrecosPorMes({})).toBeNull();
  });
});

describe("divisão da reserva", () => {
  it("pousada recebe total − comissão; afiliado e conservação saem da comissão", () => {
    const s = splitBooking(2000, 12, 5, 2);
    expect(s.commission).toBe(240);
    expect(s.affiliate).toBe(100);
    expect(s.conservation).toBe(40);
    expect(s.platformNet).toBe(100);
    expect(s.repasse).toBe(1760);
  });
  it("afiliado + conservação nunca passam da comissão", () => {
    const s = splitBooking(1000, 5, 10, 10);
    expect(s.affiliate).toBe(50);
    expect(s.conservation).toBe(0);
    expect(s.repasse).toBe(950);
  });
});
