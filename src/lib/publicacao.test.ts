import { describe, it, expect } from "vitest";
import { checklistPublicacao, prontaParaEnviar } from "./publicacao";

const completa = {
  images: ["a", "b", "c", "d", "e"],
  description: "Pousada à beira do rio no coração do Pantanal, com passeios de barco, focagem noturna e culinária pantaneira.",
  pricePerNight: 450, rooms: [{}], capacity: 8, latitude: -15.1, longitude: -57.2,
  whatsappContato: "(65) 99999-8888", contratoId: "ct_1",
};

describe("checklist de publicação", () => {
  it("pousada completa pode enviar", () => {
    expect(prontaParaEnviar(completa)).toBe(true);
  });
  it("aponta o que falta", () => {
    const faltando = checklistPublicacao({ ...completa, images: ["a", "b"], contratoId: null, latitude: undefined })
      .filter(i => !i.ok).map(i => i.id);
    expect(faltando).toEqual(["fotos", "localizacao", "contrato"]);
  });
  it("capacidade sozinha vale no lugar de quartos", () => {
    expect(checklistPublicacao({ ...completa, rooms: [], capacity: 6 }).find(i => i.id === "quartos")?.ok).toBe(true);
  });
});
