import { describe, expect, it } from "vitest";
import { cleanGoogleMapsUrl, directionsUrl, isGoogleMapsUrl, referenceDistances, wazeUrl } from "./mapsLinks";

describe("links do Google Maps", () => {
  const ficha = "https://www.google.com.br/maps/place/Pousada+VAGALUME/@-15.0464096,-57.1416577,5957m/data=!3m1!1e3!4m9!3m8!1s0x939947b79044f84b:0x95297dffb3b69b92?entry=ttu&g_ep=EgoyMDI2MTAxOS4wIKXMDSoASAFQAw%3D%3D";

  it("aceita fichas e links curtos do Google Maps", () => {
    expect(isGoogleMapsUrl(ficha)).toBe(true);
    expect(isGoogleMapsUrl("https://maps.app.goo.gl/AbC123")).toBe(true);
    expect(isGoogleMapsUrl("https://maps.google.com/?cid=123")).toBe(true);
  });

  it("recusa qualquer outro endereço", () => {
    expect(isGoogleMapsUrl("https://www.google.com/search?q=x")).toBe(false);
    expect(isGoogleMapsUrl("https://evil.com/maps/place")).toBe(false);
    expect(isGoogleMapsUrl("http://www.google.com/maps/place/x")).toBe(false);
    expect(isGoogleMapsUrl("javascript:alert(1)")).toBe(false);
  });

  it("remove os parâmetros de rastreio", () => {
    const clean = cleanGoogleMapsUrl(ficha);
    expect(clean).not.toContain("entry=");
    expect(clean).not.toContain("g_ep=");
    expect(clean).toContain("/maps/place/Pousada+VAGALUME/");
  });

  it("monta rota e Waze pela coordenada", () => {
    expect(directionsUrl(-15.05, -57.14)).toBe("https://www.google.com/maps/dir/?api=1&destination=-15.05,-57.14");
    expect(wazeUrl(-15.05, -57.14)).toBe("https://waze.com/ul?ll=-15.05,-57.14&navigate=yes");
  });

  it("distância em linha reta até o aeroporto de Cuiabá", () => {
    const [cgb] = referenceDistances(-15.050644, -57.145955);
    expect(cgb.km).toBeGreaterThan(120);
    expect(cgb.km).toBeLessThan(135);
  });
});
