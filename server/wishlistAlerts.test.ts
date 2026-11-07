import { describe, expect, it } from "vitest";
import { listDatesUpcoming, pousadaNearSpecies, speciesSeasonStarting } from "./wishlistAlerts";
import { WILD_SPECIES } from "../src/data/wildSpecies";

describe("alertas da lista de desejos", () => {
  const onca = WILD_SPECIES.find(s => s.id === "onca")!;

  it("a época da onça começa uma vez por ano (no primeiro mês de pico)", () => {
    const meses = Array.from({ length: 12 }, (_, m) => m).filter(m => speciesSeasonStarting(m).some(s => s.id === "onca"));
    expect(meses).toHaveLength(1);
    expect(onca.season[meses[0]]).toBe(2);
  });

  it("pousada no Pantanal fica perto das áreas da onça; na Bahia não", () => {
    expect(pousadaNearSpecies({ latitude: -17.2, longitude: -56.9 }, onca)).toBe(true);
    expect(pousadaNearSpecies({ location: "Lençóis, Chapada Diamantina, Bahia" }, onca)).toBe(false);
    expect(pousadaNearSpecies({ location: "lugar desconhecido" }, onca)).toBe(false);
  });

  it("alerta de vaga só para datas futuras e válidas", () => {
    expect(listDatesUpcoming("2027-07-10", "2027-07-14", "2026-11-07")).toBe(true);
    expect(listDatesUpcoming("2026-11-01", "2026-11-04", "2026-11-07")).toBe(false);
    expect(listDatesUpcoming(null, null, "2026-11-07")).toBe(false);
  });
});
