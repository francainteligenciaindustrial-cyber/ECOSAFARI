import { describe, expect, it } from "vitest";
import { aprovarVersao, pedirAjustes, podeMudarStatus } from "./pedidoSite";
import type { LogoVersao } from "../types";

const v = (id: string, status: LogoVersao["status"] = "pendente"): LogoVersao => ({ id, pedidoId: "p", imageUrl: `https://x/${id}.png`, status, createdAt: "2026-10-20" });
const AGORA = "2026-10-21T10:00:00Z";

describe("pedido de logo/site", () => {
  it("aprovar uma versão rejeita as outras pendentes e guarda o comentário", () => {
    const out = aprovarVersao([v("a"), v("b"), v("c"), v("old", "rejeitada")], "b", "Amei, só aumentar a fonte", AGORA);
    expect(out.map(x => x.status)).toEqual(["rejeitada", "aprovada", "rejeitada", "rejeitada"]);
    expect(out[1].clienteComentario).toBe("Amei, só aumentar a fonte");
    expect(out[3].decidedAt).toBeUndefined();
  });

  it("não aprova versão já decidida", () => {
    expect(() => aprovarVersao([v("a", "rejeitada")], "a", "", AGORA)).toThrow();
  });

  it("pedir ajustes rejeita as pendentes com o comentário", () => {
    const out = pedirAjustes([v("a"), v("b")], "Quero tons mais verdes", AGORA);
    expect(out.every(x => x.status === "rejeitada" && x.clienteComentario === "Quero tons mais verdes")).toBe(true);
    expect(() => pedirAjustes(out, "", AGORA)).toThrow();
  });

  it("site só entra em produção depois da logo aprovada", () => {
    expect(podeMudarStatus({ servico: "logo_site", logoStatus: "aguardando_aprovacao" }, "em_producao")).not.toBeNull();
    expect(podeMudarStatus({ servico: "logo_site", logoStatus: "aprovada" }, "em_producao")).toBeNull();
    expect(podeMudarStatus({ servico: "site", logoStatus: null }, "em_producao")).toBeNull();
    expect(podeMudarStatus({ servico: "logo", logoStatus: "aprovada" }, "em_producao")).not.toBeNull();
    expect(podeMudarStatus({ servico: "logo", logoStatus: "aprovada" }, "entregue")).toBeNull();
  });
});
