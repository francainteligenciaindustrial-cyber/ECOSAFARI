import { describe, expect, it } from "vitest";
import { normalizeWhatsAppNumber } from "./whatsapp";

describe("número de WhatsApp", () => {
  it("adiciona 55 a número brasileiro sem DDI", () => {
    expect(normalizeWhatsAppNumber("(65) 99999-8888")).toBe("5565999998888");
    expect(normalizeWhatsAppNumber("+55 65 99999-8888")).toBe("5565999998888");
  });
  it("mantém DDI estrangeiro e recusa número curto", () => {
    expect(normalizeWhatsAppNumber("+1 415 555 0100")).toBe("14155550100");
    expect(normalizeWhatsAppNumber("12345")).toBeNull();
  });
});
