import { describe, it, expect } from "vitest";
import { filterAndSortPousadas } from "./catalogFilters";
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

describe("filterAndSortPousadas", () => {
  const pousadas = [
    makePousada({ id: "a", name: "Vagalume Lodge", location: "Mato Grosso - Pantanal", pricePerNight: 800, rating: 4.5, features: ["Piscina"] }),
    makePousada({ id: "b", name: "Jaguar Camp", location: "Mato Grosso - Cerrado", pricePerNight: 500, rating: 4.9, activities: ["Trilha guiada"] }),
    makePousada({ id: "c", name: "Rio Claro Pousada", location: "Amazonas", pricePerNight: 1200, rating: 4.0 }),
  ];

  it("returns everything unfiltered by default", () => {
    expect(filterAndSortPousadas(pousadas)).toHaveLength(3);
  });

  it("filters by location substring", () => {
    const result = filterAndSortPousadas(pousadas, { location: "Mato Grosso" });
    expect(result.map(p => p.id)).toEqual(["a", "b"]);
  });

  it("matches free-text search against name, location, features and activities", () => {
    expect(filterAndSortPousadas(pousadas, { search: "jaguar" }).map(p => p.id)).toEqual(["b"]);
    expect(filterAndSortPousadas(pousadas, { search: "piscina" }).map(p => p.id)).toEqual(["a"]);
    expect(filterAndSortPousadas(pousadas, { search: "trilha" }).map(p => p.id)).toEqual(["b"]);
    expect(filterAndSortPousadas(pousadas, { search: "amazonas" }).map(p => p.id)).toEqual(["c"]);
  });

  it("search is case-insensitive and trims whitespace", () => {
    expect(filterAndSortPousadas(pousadas, { search: "  JAGUAR  " }).map(p => p.id)).toEqual(["b"]);
  });

  it("filters by price range", () => {
    expect(filterAndSortPousadas(pousadas, { priceMin: 600 }).map(p => p.id)).toEqual(["a", "c"]);
    expect(filterAndSortPousadas(pousadas, { priceMax: 600 }).map(p => p.id)).toEqual(["b"]);
    expect(filterAndSortPousadas(pousadas, { priceMin: 600, priceMax: 1000 }).map(p => p.id)).toEqual(["a"]);
  });

  it("sorts by price ascending/descending", () => {
    expect(filterAndSortPousadas(pousadas, { sortBy: "price-asc" }).map(p => p.id)).toEqual(["b", "a", "c"]);
    expect(filterAndSortPousadas(pousadas, { sortBy: "price-desc" }).map(p => p.id)).toEqual(["c", "a", "b"]);
  });

  it("sorts by rating descending", () => {
    expect(filterAndSortPousadas(pousadas, { sortBy: "rating-desc" }).map(p => p.id)).toEqual(["b", "a", "c"]);
  });

  it("relevance keeps the original order untouched", () => {
    expect(filterAndSortPousadas(pousadas, { sortBy: "relevance" }).map(p => p.id)).toEqual(["a", "b", "c"]);
  });

  it("combines filters and sort together", () => {
    const result = filterAndSortPousadas(pousadas, { location: "Mato Grosso", sortBy: "price-desc" });
    expect(result.map(p => p.id)).toEqual(["a", "b"]);
  });
});
