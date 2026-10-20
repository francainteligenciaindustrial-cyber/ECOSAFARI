import { describe, expect, it } from "vitest";
import { aggregateStats, mergeSpeciesStats, seasonFromMonthly, type AppStatRow } from "./sightingStats";

const row = (p: Partial<AppStatRow>): AppStatRow => ({
  species_key: "onca", species_name: "Onça-pintada", scientific_name: "Panthera onca",
  lodge_id: "lodge-a", year: 2026, month: 8, sightings: 1, lat: -17.36, lng: -56.77, ...p,
});

describe("estatísticas do app", () => {
  it("soma por mês e por ponto, e liga a pousada pelo ID", () => {
    const stats = aggregateStats([
      row({ sightings: 5 }),
      row({ sightings: 3, year: 2025 }),
      row({ month: 9, sightings: 2, lodge_id: "lodge-b" }),
      row({ species_key: "capivara", species_name: "Capivara", sightings: 1, lat: null, lng: null }),
    ], new Map([["lodge-a", "p_vagalume"], ["lodge-b", "p_outra"]]));
    const onca = stats.species.find(s => s.key === "onca")!;
    expect(onca.monthly[7]).toBe(8);
    expect(onca.monthly[8]).toBe(2);
    expect(onca.total).toBe(10);
    expect(onca.topPousadaId).toBe("p_vagalume");
    expect(stats.totalSightings).toBe(11);
    expect(stats.points.find(p => p.speciesKey === "onca" && p.lat === -17.36)!.count).toBe(10);
    expect(stats.points.some(p => p.speciesKey === "capivara")).toBe(false);
  });

  it("pousada do app sem vínculo no site não vira pousada indicada", () => {
    const stats = aggregateStats([row({ lodge_id: "sem-vinculo", sightings: 9 })], new Map());
    expect(stats.species[0].topPousadaId).toBeUndefined();
  });

  it("calendário reflete os dados desde o primeiro registro", () => {
    expect(seasonFromMonthly([0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0], 1)).toEqual([0, 0, 0, 0, 0, 0, 2, 0, 0, 0, 0, 0]);
    expect(seasonFromMonthly([0, 0, 0, 0, 0, 1, 4, 10, 9, 6, 2, 0], 32)).toEqual([0, 0, 0, 0, 0, 0, 1, 2, 2, 2, 1, 0]);
    expect(seasonFromMonthly(Array(12).fill(0), 0)).toBeNull();
  });

  it("junta espécies do app que são a mesma do site", () => {
    const stats = aggregateStats([
      row({ species_key: "arara", species_name: "Arara", month: 7, sightings: 2, lodge_id: "lodge-a" }),
      row({ species_key: "caninde", species_name: "Canindé", month: 8, sightings: 3, lodge_id: "lodge-b" }),
    ], new Map([["lodge-a", "p1"], ["lodge-b", "p2"]]));
    const merged = mergeSpeciesStats(stats.species)!;
    expect(merged.total).toBe(5);
    expect(merged.monthly[6]).toBe(2);
    expect(merged.monthly[7]).toBe(3);
    expect(merged.topPousadaId).toBe("p2");
  });
});
