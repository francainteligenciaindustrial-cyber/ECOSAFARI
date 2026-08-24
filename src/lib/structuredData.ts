import { useEffect } from "react";

// Injeta/remove um <script type="application/ld+json"> no <head> enquanto o
// componente estiver montado — dados estruturados (schema.org) pras páginas
// de pousada/atração/guia e pro catálogo, pro Google conseguir mostrar
// estrelas, preço e localização direto no resultado de busca (rich
// snippets), do jeito que Booking/Airbnb fazem. O site é uma SPA sem SSR,
// mas o Googlebot executa JS antes de indexar — injetar via useEffect é
// suficiente, só não deve ser usado pra dado que precisa aparecer sem JS.
export function useStructuredData(data: Record<string, unknown> | null) {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!data) return;
    const script = document.createElement("script");
    script.type = "application/ld+json";
    script.text = JSON.stringify(data);
    document.head.appendChild(script);
    return () => {
      document.head.removeChild(script);
    };
  }, [JSON.stringify(data)]);
}
