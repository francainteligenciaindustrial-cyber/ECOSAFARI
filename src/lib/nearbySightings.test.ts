import { describe, expect, it } from "vitest";
import { distanceKm, speciesNearPousadas } from "./nearbySightings";

const pt = (speciesName: string, lat: number, lng: number, count: number) => ({ speciesKey: speciesName, speciesName, lat, lng, count });

describe("speciesNearPousadas", () => {
  const porto = { id: "a", lat: -17.35, lng: -56.76, exact: true }; // Porto Jofre
  const cuiaba = { id: "b", lat: -15.6, lng: -56.1, exact: true };

  it("conta só os pontos dentro do raio de cada pousada", () => {
    const r = speciesNearPousadas([porto, cuiaba], [pt("Onça-pintada", -17.4, -56.8, 5), pt("Tuiuiú", -15.62, -56.12, 2)], []);
    expect(r.a).toEqual([{ name: "Onça-pintada", count: 5 }]);
    expect(r.b).toEqual([{ name: "Tuiuiú", count: 2 }]);
  });

  it("usa o vínculo pelo ID e não soma duas vezes o mesmo avistamento", () => {
    const r = speciesNearPousadas([porto], [pt("Onça-pintada", -17.4, -56.8, 3)], [{ name: "Onca pintada", pousadaCounts: { a: 4 } }]);
    expect(r.a).toEqual([{ name: "Onça-pintada", count: 4 }]);
  });

  it("posição aproximada (só a cidade) não usa o raio, só o vínculo", () => {
    const r = speciesNearPousadas([{ ...porto, exact: false }], [pt("Onça-pintada", -17.4, -56.8, 3)], [{ name: "Capivara", pousadaCounts: { a: 1 } }]);
    expect(r.a).toEqual([{ name: "Capivara", count: 1 }]);
  });

  it("distância aproximada correta", () => {
    expect(Math.round(distanceKm(-15.6, -56.1, -17.35, -56.76))).toBe(207);
  });
});
