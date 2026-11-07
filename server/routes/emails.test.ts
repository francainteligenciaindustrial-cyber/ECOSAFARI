import { describe, expect, it } from "vitest";
import { comunicadoToHtml } from "./emails";

describe("comunicadoToHtml", () => {
  it("separa parágrafos, mantém quebras e transforma links em clicáveis", () => {
    const html = comunicadoToHtml("Temporada", "Primeiro parágrafo.\nLinha 2.\n\nVeja https://www.ipantanal.com.br/mapa agora.");
    expect(html).toContain("<h1");
    expect(html).toContain("Primeiro parágrafo.<br>Linha 2.");
    expect((html.match(/<p /g) || []).length).toBe(2);
    expect(html).toContain('href="https://www.ipantanal.com.br/mapa"');
  });

  it("escapa HTML digitado no texto", () => {
    const html = comunicadoToHtml("<b>x</b>", "<script>alert(1)</script>");
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("<b>x</b>");
  });

  it("só põe o botão com link https", () => {
    expect(comunicadoToHtml("t", "b", { label: "Ver", url: "https://a.com" })).toContain("Ver</a>");
    expect(comunicadoToHtml("t", "b", { label: "Ver", url: "javascript:alert(1)" })).not.toContain("Ver</a>");
  });
});
