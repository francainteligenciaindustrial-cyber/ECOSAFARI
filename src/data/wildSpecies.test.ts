import { describe, expect, it } from "vitest";
import { WILD_SPECIES, findWildSpecies, nextBestMonth } from "./wildSpecies";

describe("wildSpecies", () => {
  it("toda espécie tem 12 meses e ao menos uma área", () => {
    for (const s of WILD_SPECIES) {
      expect(s.season).toHaveLength(12);
      expect(s.areas.length).toBeGreaterThan(0);
    }
  });

  it("casa nomes do banco ignorando acento e caixa", () => {
    expect(findWildSpecies("Onça-Pintada")?.id).toBe("onca");
    expect(findWildSpecies("jaguar")?.id).toBe("onca");
    expect(findWildSpecies("Jacaré-do-Pantanal")?.id).toBe("jacare");
    expect(findWildSpecies("Tamanduá")).toBeUndefined();
  });

  it("acha o próximo mês de pico a partir de hoje", () => {
    const onca = findWildSpecies("onca")!;
    expect(nextBestMonth(onca.season, new Date(2026, 0, 15))).toEqual({ year: 2026, month: 7 });
    expect(nextBestMonth(onca.season, new Date(2026, 10, 15))).toEqual({ year: 2027, month: 7 });
    expect(nextBestMonth(onca.season, new Date(2026, 7, 15))).toEqual({ year: 2026, month: 8 });
  });
});
