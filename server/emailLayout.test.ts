import { describe, expect, it } from "vitest";
import { htmlToText, isFullDocument, wrapEmail } from "./emailLayout";
import { unsubscribeToken, unsubscribeUrl, verifyUnsubscribeToken } from "./emailTokens";

describe("wrapEmail", () => {
  it("embrulha o conteúdo com a marca e o rodapé", () => {
    const html = wrapEmail("<p>Olá</p>", { preheader: "Bem-vindo", siteUrl: "https://www.ipantanal.com.br" });
    expect(isFullDocument(html)).toBe(true);
    expect(html).toContain("<p>Olá</p>");
    expect(html).toContain("PANTANAL");
    expect(html).toContain("Bem-vindo");
    expect(html).not.toContain("Descadastrar");
  });

  it("só mostra o descadastro quando há link (e-mails de novidades)", () => {
    const html = wrapEmail("<p>Novidade</p>", { unsubscribeUrl: "https://x.com/descadastrar?e=a&t=b" });
    expect(html).toContain("Descadastrar");
    expect(html).toContain("https://x.com/descadastrar?e=a&amp;t=b");
  });

  it("não embrulha duas vezes", () => {
    const once = wrapEmail("<p>x</p>");
    expect(wrapEmail(once)).toBe(once);
  });
});

describe("htmlToText", () => {
  it("vira texto legível com os links", () => {
    const text = htmlToText('<h2>Oi</h2><p>Clique <a href="https://a.com/x">aqui</a></p><p>Fim &amp; tchau</p>');
    expect(text).toContain("Oi");
    expect(text).toContain("aqui (https://a.com/x)");
    expect(text).toContain("Fim & tchau");
    expect(text).not.toContain("<");
  });
});

describe("token de descadastro", () => {
  const secret = "segredo-de-teste";
  it("valida o token do próprio e-mail (sem diferenciar maiúsculas)", () => {
    const t = unsubscribeToken("Ana@Email.com", secret);
    expect(verifyUnsubscribeToken("ana@email.com", t, secret)).toBe(true);
  });
  it("recusa token de outro e-mail ou adulterado", () => {
    const t = unsubscribeToken("ana@email.com", secret);
    expect(verifyUnsubscribeToken("bia@email.com", t, secret)).toBe(false);
    expect(verifyUnsubscribeToken("ana@email.com", t.slice(0, -1) + "x", secret)).toBe(false);
    expect(verifyUnsubscribeToken("ana@email.com", t, "outro")).toBe(false);
  });
  it("monta o link de descadastro", () => {
    expect(unsubscribeUrl("https://www.ipantanal.com.br/", "a@b.com", secret)).toMatch(/^https:\/\/www\.ipantanal\.com\.br\/descadastrar\?e=a%40b\.com&t=/);
  });
});
