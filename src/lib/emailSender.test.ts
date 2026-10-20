import { describe, expect, it } from "vitest";
import { buildPousadaSender, parseFromHeader, pickReplyTo } from "./emailSender";

const PLATFORM = "EcoSafari Brasil <reservas@ecosafaribrasil.com.br>";

describe("remetente dos e-mails de reserva", () => {
  it("separa nome e endereço do EMAIL_FROM", () => {
    expect(parseFromHeader(PLATFORM)).toEqual({ name: "EcoSafari Brasil", address: "reservas@ecosafaribrasil.com.br" });
    expect(parseFromHeader("contato@x.com")).toEqual({ name: "", address: "contato@x.com" });
  });

  it("padrão: nome da pousada via EcoSafari, no domínio da plataforma", () => {
    expect(buildPousadaSender({ pousadaName: "Pesqueiro Vagalume", platformFrom: PLATFORM }))
      .toBe('"Pesqueiro Vagalume via EcoSafari Brasil" <reservas@ecosafaribrasil.com.br>');
  });

  it("usa o domínio próprio quando o admin configurou um endereço válido", () => {
    expect(buildPousadaSender({ pousadaName: "Pesqueiro Vagalume", platformFrom: PLATFORM, ownAddress: "reservas@pousadavagalume.com" }))
      .toBe('"Pesqueiro Vagalume" <reservas@pousadavagalume.com>');
    expect(buildPousadaSender({ pousadaName: "X", platformFrom: PLATFORM, ownAddress: "inválido" }))
      .toBe('"X via EcoSafari Brasil" <reservas@ecosafaribrasil.com.br>');
  });

  it("nome com caracteres perigosos não quebra o cabeçalho", () => {
    expect(buildPousadaSender({ pousadaName: 'Pousada "Sol" <hack>\r\nBcc: a@b.c', platformFrom: PLATFORM }))
      .toBe('"Pousada Sol hack Bcc: a@b.c via EcoSafari Brasil" <reservas@ecosafaribrasil.com.br>');
  });

  it("responder-para pega o primeiro e-mail válido", () => {
    expect(pickReplyTo("", "nao-e-email", "contato@pousada.com", "outro@x.com")).toBe("contato@pousada.com");
    expect(pickReplyTo(undefined, null)).toBeUndefined();
  });
});
