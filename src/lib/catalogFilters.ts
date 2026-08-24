import { Pousada } from "../types";

export type SortOption = "relevance" | "price-asc" | "price-desc" | "rating-desc";

export interface CatalogFilterOptions {
  location?: string; // "all" or a substring of Pousada.location
  search?: string; // free-text, matched against name/location/features/activities
  priceMin?: number;
  priceMax?: number;
  sortBy?: SortOption;
}

// Busca e filtros do catálogo público — separado da UI (PousadaCatalog.tsx)
// pra poder testar a lógica de "o que aparece e em que ordem" sem precisar
// renderizar o componente inteiro. "relevance" preserva a ordem recebida
// (que já reflete o critério de destaque do backend) em vez de reordenar.
export function filterAndSortPousadas(pousadas: Pousada[], options: CatalogFilterOptions = {}): Pousada[] {
  const { location = "all", search = "", priceMin, priceMax, sortBy = "relevance" } = options;
  const searchTerm = search.trim().toLowerCase();

  const filtered = pousadas.filter(p => {
    if (location !== "all" && !(typeof p.location === "string" && p.location.includes(location))) return false;

    if (searchTerm) {
      const haystack = [p.name, p.location, ...(p.features || []), ...(p.activities || [])]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      if (!haystack.includes(searchTerm)) return false;
    }

    if (typeof priceMin === "number" && !Number.isNaN(priceMin) && p.pricePerNight < priceMin) return false;
    if (typeof priceMax === "number" && !Number.isNaN(priceMax) && p.pricePerNight > priceMax) return false;

    return true;
  });

  if (sortBy === "relevance") return filtered;

  const sorted = [...filtered];
  sorted.sort((a, b) => {
    if (sortBy === "price-asc") return a.pricePerNight - b.pricePerNight;
    if (sortBy === "price-desc") return b.pricePerNight - a.pricePerNight;
    if (sortBy === "rating-desc") return (b.rating || 0) - (a.rating || 0);
    return 0;
  });
  return sorted;
}
