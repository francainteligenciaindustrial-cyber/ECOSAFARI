import { describe, expect, it } from "vitest";
import { parseCoordinates } from "./CoordinatesInput";

describe("parseCoordinates", () => {
  it("aceita o formato copiado do Google Maps", () => {
    expect(parseCoordinates("-16.50123, -56.74321")).toEqual({ lat: -16.50123, lng: -56.74321 });
  });
  it("aceita vírgula decimal separada por ponto-e-vírgula", () => {
    expect(parseCoordinates("-16,5; -56,7")).toEqual({ lat: -16.5, lng: -56.7 });
  });
  it("recusa texto e valores fora do globo", () => {
    expect(parseCoordinates("Poconé")).toBeNull();
    expect(parseCoordinates("-95, 10")).toBeNull();
  });
});
