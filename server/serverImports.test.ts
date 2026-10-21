import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "fs";
import { join } from "path";

// Arquivos de src/ usados pelo servidor rodam na Vercel como ESM puro, onde
// um import relativo sem extensão ("./outro") derruba a função inteira
// (FUNCTION_INVOCATION_FAILED — o site fica sem pousadas). O build local não
// pega isso porque o esbuild resolve o caminho sozinho. Este teste trava o
// problema antes de chegar em produção: arquivo de src/ importado pelo
// servidor não pode ter import relativo de valor (só "import type", que some
// na compilação).

const root = join(__dirname, "..");
const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap(name => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : p.endsWith(".ts") ? [p] : [];
  });

describe("arquivos de src/ usados pelo servidor", () => {
  const serverFiles = [join(root, "server.ts"), join(root, "api", "index.ts"), ...walk(join(root, "server"))];
  const srcUsed = new Set<string>();
  for (const f of serverFiles) {
    for (const m of readFileSync(f, "utf8").matchAll(/from\s+["'](?:\.\.\/)+src\/([^"']+)\.js["']/g)) {
      srcUsed.add(join(root, "src", `${m[1]}.ts`));
    }
  }

  it("existe ao menos um (sanidade do teste)", () => {
    expect(srcUsed.size).toBeGreaterThan(0);
  });

  for (const file of srcUsed) {
    it(`${file.slice(root.length + 1)} não tem import relativo de valor`, () => {
      const code = readFileSync(file, "utf8");
      const bad = [...code.matchAll(/^\s*import\s+(?!type\b)[^;]*?from\s+["'](\.[^"']*)["']/gm)].map(m => m[1]);
      const reexports = [...code.matchAll(/^\s*export\s+(?!type\b)[^;]*?from\s+["'](\.[^"']*)["']/gm)].map(m => m[1]);
      expect([...bad, ...reexports]).toEqual([]);
    });
  }
});
