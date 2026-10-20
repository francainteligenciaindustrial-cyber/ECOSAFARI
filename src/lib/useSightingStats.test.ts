import { describe, expect, it } from "vitest";
import { matchSpeciesStats, publishablePoints, unmatchedSpeciesStats } from "./useSightingStats";
import type { SightingStats } from "./sightingStats";

const UUID = "22c848dc-2cf7-4351-af74-6e2e6f034edb";
const sp = (key: string, name: string, total = 1, scientificName?: string) => ({
  key, name, scientificName, monthly: [0, 0, 0, 0, 0, 0, total, 0, 0, 0, 0, 0], total, pousadaCounts: {},
});
const stats: SightingStats = {
  species: [
    sp("arara", "Arara", 2),
    sp("caninde", "Canindé", 1),
    sp(UUID, "Tuiuiú", 3, "Jabiru mycteria"),
    sp("wdwesdesddd", "Wdwesdesddd"),
  ],
  points: [
    { speciesKey: "arara", speciesName: "Arara", lat: -16, lng: -56, count: 2 },
    { speciesKey: UUID, speciesName: "Tuiuiú", lat: -16.1, lng: -56.1, count: 3 },
    { speciesKey: "wdwesdesddd", speciesName: "Wdwesdesddd", lat: -16.2, lng: -56.2, count: 1 },
  ],
  totalSightings: 7,
  updatedAt: "",
};
const shown = [{ id: "arara", name: "Arara-Canindé", scientificName: "Ara ararauna" }];

describe("avistamentos do app no site", () => {
  it("soma os nomes do app que são a mesma espécie do site", () => {
    expect(matchSpeciesStats(stats, shown[0])!.total).toBe(3);
  });
  it("espécie nova só entra se for do catálogo do app (sem testes de texto livre)", () => {
    expect(unmatchedSpeciesStats(stats, shown).map(s => s.name)).toEqual(["Tuiuiú"]);
  });
  it("mapa não mostra texto livre desconhecido", () => {
    expect(publishablePoints(stats, shown).map(p => p.speciesName)).toEqual(["Arara", "Tuiuiú"]);
  });
});
