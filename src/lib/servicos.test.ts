import { describe, it, expect } from "vitest";
import { servicoKey, prestaServico, datasCruzam, temDataBloqueada, isServicoGuia } from "./servicos";

describe("servicos", () => {
  it("passeio e cadastro do prestador viram a mesma chave", () => {
    expect(servicoKey("Guia turístico")).toBe("guia");
    expect(servicoKey("Guia local")).toBe("guia");
    expect(servicoKey("Piloteiro")).toBe("piloteiro");
    expect(servicoKey("Piloteiro(a)")).toBe("piloteiro");
    expect(servicoKey("Cozinheiro(a)")).toBe("cozinheiro");
    expect(servicoKey("Músico/Cantor")).toBe("artista");
    expect(servicoKey("Artista (música, dança, artesanato)")).toBe("artista");
    expect(servicoKey("Motorista/Transfer")).toBe("motorista");
    expect(servicoKey("Fotógrafo(a)")).toBe("fotografo");
    expect(isServicoGuia("Guia turístico")).toBe(true);
  });

  it("prestador só recebe o serviço que faz", () => {
    expect(prestaServico(["Piloteiro(a)", "Cozinheiro(a)"], "Piloteiro")).toBe(true);
    expect(prestaServico(["Cozinheiro(a)"], "Piloteiro")).toBe(false);
    expect(prestaServico(["Artista (música, dança, artesanato)"], "Músico/Cantor")).toBe(true);
    expect(prestaServico(["Benzedeira"], "Outro")).toBe(false);
    expect(prestaServico(["Outro"], "Outro")).toBe(true);
  });

  it("conflito de datas e datas bloqueadas", () => {
    expect(datasCruzam("2027-07-10", "2027-07-13", "2027-07-12", "2027-07-14")).toBe(true);
    expect(datasCruzam("2027-07-10", "2027-07-13", "2027-07-13", "2027-07-15")).toBe(false);
    expect(temDataBloqueada(["2027-07-11"], "2027-07-10", "2027-07-13")).toBe(true);
    expect(temDataBloqueada(["2027-07-13"], "2027-07-10", "2027-07-13")).toBe(false);
  });
});
