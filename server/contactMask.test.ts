import { describe, expect, it } from "vitest";
import { HIDDEN, maskContact } from "./contactMask";

describe("maskContact", () => {
  it("oculta telefones em vários formatos", () => {
    for (const t of ["me chama no 65 99919-1602", "(65) 9 9919 1602", "+55 65999191602", "65.99919.1602"]) {
      const r = maskContact(t);
      expect(r.masked, t).toBe(true);
      expect(r.text).toContain(HIDDEN);
      expect(r.text).not.toMatch(/\d{4}/);
    }
  });

  it("oculta emails, links e @ de rede social", () => {
    expect(maskContact("meu email é guia@gmail.com").text).not.toContain("gmail");
    expect(maskContact("guia arroba gmail ponto com").masked).toBe(true);
    expect(maskContact("veja wa.me/5565999").masked).toBe(true);
    expect(maskContact("site www.meuguia.com.br").masked).toBe(true);
    expect(maskContact("me segue no @guiapantanal").text).toBe(`me segue no ${HIDDEN}`);
  });

  it("oculta número escrito por extenso", () => {
    expect(maskContact("nove nove nove um nove um seis zero dois").masked).toBe(true);
  });

  it("não mexe em conversa normal (datas, preços, quantidades)", () => {
    for (const t of ["Somos 4 pessoas, chegamos dia 12/07", "O passeio custa R$ 350 por pessoa", "Saída às 6h30, volta 17h", "Vocês falam inglês?"]) {
      expect(maskContact(t)).toEqual({ text: t, masked: false });
    }
  });
});
