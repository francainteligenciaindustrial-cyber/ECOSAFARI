import React from "react";

// Placeholder no formato exato do conteúdo que vai aparecer, em vez de só um
// spinner girando — reduz a sensação de espera mesmo com o mesmo tempo real
// de carregamento (o mesmo padrão que Instagram/LinkedIn/Booking usam pra
// listas). Usado só na primeira carga; refazer uma busca com resultado já
// na tela usa um dim sutil em vez de trocar tudo por skeleton de novo.
export function SkeletonPousadaCard() {
  return (
    <div className="bg-white border border-editorial-border overflow-hidden flex flex-col h-full animate-pulse">
      <div className="h-64 bg-editorial-secondary" />
      <div className="p-6 flex-1 space-y-3">
        <div className="h-5 w-2/3 bg-editorial-secondary rounded" />
        <div className="h-3 w-full bg-editorial-secondary rounded" />
        <div className="h-3 w-5/6 bg-editorial-secondary rounded" />
        <div className="flex gap-2 pt-1">
          <div className="h-5 w-16 bg-editorial-secondary rounded" />
          <div className="h-5 w-20 bg-editorial-secondary rounded" />
        </div>
        <div className="flex items-center justify-between pt-4 mt-auto border-t border-editorial-border">
          <div className="h-6 w-20 bg-editorial-secondary rounded" />
          <div className="h-9 w-24 bg-editorial-secondary rounded" />
        </div>
      </div>
    </div>
  );
}

export function SkeletonPousadaGrid({ count = 6 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonPousadaCard key={i} />
      ))}
    </div>
  );
}
