import { Pousada } from "../types";

// Mantido em sincronia com o que GET /api/pousadas?sortBy= aceita
// (server.ts) — a busca/filtro/ordenação do catálogo público passaram a
// rodar no servidor (ver PousadaCatalog.tsx), esse tipo só documenta as
// opções válidas no dropdown de ordenação.
export type SortOption = "relevance" | "price-asc" | "price-desc" | "rating-desc";

// Pousada.location é um texto livre digitado pelo admin (ex: "Pantanal
// Norte, Mato Grosso") — sem colunas separadas de estado/cidade no banco.
// Em vez de manter uma lista de biomas fixa no código (só "Mato Grosso"
// existia até então), extrai as regiões reais a partir do que os parceiros
// já cadastraram, pra virar um filtro dinâmico de estado/cidade/região que
// cresce junto com o catálogo sem precisar de migração de banco nem de
// mexer no formulário do admin.
export function extractLocationRegions(pousadas: Pousada[]): string[] {
  const regions = new Set<string>();
  for (const p of pousadas) {
    if (typeof p.location !== "string") continue;
    p.location
      .split(/[,\-–—/]/)
      .map(part => part.trim())
      .filter(Boolean)
      .forEach(part => regions.add(part));
  }
  return Array.from(regions).sort((a, b) => a.localeCompare(b, "pt-BR"));
}
