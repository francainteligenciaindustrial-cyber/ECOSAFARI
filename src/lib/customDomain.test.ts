import { describe, expect, it } from "vitest";
import { isPlatformHost, isValidCustomDomain, normalizeHost } from "./customDomain";

describe("domínio próprio de pousada", () => {
  it("normaliza o que o admin digita", () => {
    expect(normalizeHost("https://www.PousadaVagalume.com/")).toBe("pousadavagalume.com");
    expect(normalizeHost("pousadavagalume.com:443")).toBe("pousadavagalume.com");
  });
  it("reconhece os hosts da plataforma", () => {
    expect(isPlatformHost("ecosafari.vercel.app")).toBe(true);
    // Domínio oficial (com e sem www) nunca é tratado como site de pousada.
    expect(isPlatformHost("ipantanal.com.br")).toBe(true);
    expect(isPlatformHost("www.ipantanal.com.br")).toBe(true);
    expect(isPlatformHost("ipantanal.com")).toBe(true);
    expect(isValidCustomDomain("ipantanal.com.br")).toBe(false);
    expect(isPlatformHost("localhost")).toBe(true);
    expect(isPlatformHost("www.ecosafaribrasil.com.br")).toBe(true);
    expect(isPlatformHost("app.outro.com", "app.outro.com")).toBe(true);
    expect(isPlatformHost("pousadavagalume.com")).toBe(false);
  });
  it("só aceita domínio válido que não seja da plataforma", () => {
    expect(isValidCustomDomain("pousadavagalume.com")).toBe(true);
    expect(isValidCustomDomain("http://pousadavagalume.com")).toBe(true);
    expect(isValidCustomDomain("ecosafari.vercel.app")).toBe(false);
    expect(isValidCustomDomain("não é domínio")).toBe(false);
  });
});
