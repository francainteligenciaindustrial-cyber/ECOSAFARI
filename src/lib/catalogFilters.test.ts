import { describe, it, expect } from "vitest";
import { extractLocationRegions } from "./catalogFilters";
import { Pousada } from "../types";

function makePousada(overrides: Partial<Pousada>): Pousada {
  return {
    id: "id",
    name: "Pousada",
    description: "",
    location: "Mato Grosso",
    rating: 0,
    pricePerNight: 100,
    images: [],
    features: [],
    activities: [],
    experiences: [],
    ...overrides,
  } as Pousada;
}

describe("extractLocationRegions", () => {
  it("splits comma/dash-separated location text into individual regions", () => {
    const pousadas = [
      makePousada({ location: "Pantanal Norte, Mato Grosso" }),
      makePousada({ location: "Mato Grosso - Cerrado" }),
      makePousada({ location: "Amazonas" }),
    ];
    expect(extractLocationRegions(pousadas)).toEqual(["Amazonas", "Cerrado", "Mato Grosso", "Pantanal Norte"]);
  });

  it("deduplicates repeated regions across pousadas", () => {
    const pousadas = [
      makePousada({ location: "Mato Grosso" }),
      makePousada({ location: "Mato Grosso" }),
    ];
    expect(extractLocationRegions(pousadas)).toEqual(["Mato Grosso"]);
  });

  it("ignores empty/whitespace-only location", () => {
    const pousadas = [makePousada({ location: "" }), makePousada({ location: "   " })];
    expect(extractLocationRegions(pousadas)).toEqual([]);
  });

  it("returns an empty list for no pousadas", () => {
    expect(extractLocationRegions([])).toEqual([]);
  });
});
