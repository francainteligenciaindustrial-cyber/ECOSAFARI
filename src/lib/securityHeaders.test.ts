import { describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";
import { SECURITY_HEADERS } from "./securityHeaders";

// O vercel.json não consegue importar o módulo TypeScript, então guarda uma
// cópia dos cabeçalhos. Este teste garante que a cópia nunca fique
// desatualizada em relação ao que o Express aplica.
describe("vercel.json security headers", () => {
  const vercel = JSON.parse(fs.readFileSync(path.resolve(__dirname, "../../vercel.json"), "utf8"));
  const globalBlock = vercel.headers.find((h: any) => h.source === "/(.*)");
  const vercelHeaders: Record<string, string> = Object.fromEntries(
    globalBlock.headers.map((h: { key: string; value: string }) => [h.key, h.value])
  );

  it("declara exatamente os mesmos cabeçalhos que o Express", () => {
    expect(vercelHeaders).toEqual(SECURITY_HEADERS);
  });
});
