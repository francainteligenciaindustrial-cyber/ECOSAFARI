import { describe, it, expect } from "vitest";
import { isCompletePousadaProfile } from "./pousadaCompleteness";
import { Pousada } from "../types";

function makePousada(overrides: Partial<Pousada> = {}): Pousada {
  return {
    id: "id",
    name: "Pousada",
    description: "Uma bela pousada",
    location: "Mato Grosso",
    rating: 0,
    pricePerNight: 500,
    images: ["/pousadas/foo.png"],
    features: [],
    activities: [],
    experiences: [],
    capacity: 4,
    ...overrides,
  } as Pousada;
}

describe("isCompletePousadaProfile", () => {
  it("is complete when every required field is filled", () => {
    expect(isCompletePousadaProfile(makePousada())).toBe(true);
  });

  it("is incomplete without a description", () => {
    expect(isCompletePousadaProfile(makePousada({ description: "" }))).toBe(false);
    expect(isCompletePousadaProfile(makePousada({ description: "   " }))).toBe(false);
  });

  it("is incomplete without a location", () => {
    expect(isCompletePousadaProfile(makePousada({ location: "" }))).toBe(false);
  });

  it("is incomplete without at least one image", () => {
    expect(isCompletePousadaProfile(makePousada({ images: [] }))).toBe(false);
  });

  it("is incomplete with a zero or negative price", () => {
    expect(isCompletePousadaProfile(makePousada({ pricePerNight: 0 }))).toBe(false);
    expect(isCompletePousadaProfile(makePousada({ pricePerNight: -10 }))).toBe(false);
  });

  it("is incomplete with a zero or negative capacity", () => {
    expect(isCompletePousadaProfile(makePousada({ capacity: 0 }))).toBe(false);
  });

  it("rejects a freshly-created empty pousada (the real incident this guards against)", () => {
    const emptyPousada = makePousada({
      description: "",
      location: "",
      images: [],
      pricePerNight: 0,
      capacity: 0,
    });
    expect(isCompletePousadaProfile(emptyPousada)).toBe(false);
  });
});
