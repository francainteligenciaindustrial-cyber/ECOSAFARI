import React, { useEffect, useState } from "react";
import { X, ChevronLeft, ChevronRight } from "lucide-react";

// Fotos enviadas pelo hóspede junto da avaliação: miniaturas que abrem em
// tela cheia (setas e Esc), como nos comentários de lojas online.
export default function ReviewPhotos({ images, alt }: { images?: string[]; alt: string }) {
  const [aberta, setAberta] = useState<number | null>(null);
  const lista = (images || []).filter(Boolean);

  useEffect(() => {
    if (aberta === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setAberta(null);
      if (e.key === "ArrowRight") setAberta(i => (i === null ? i : (i + 1) % lista.length));
      if (e.key === "ArrowLeft") setAberta(i => (i === null ? i : (i - 1 + lista.length) % lista.length));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [aberta, lista.length]);

  if (lista.length === 0) return null;
  return (
    <>
      <div className="flex flex-wrap gap-2 mt-3">
        {lista.map((url, i) => (
          <button key={url} type="button" onClick={() => setAberta(i)} aria-label={`Ver foto ${i + 1} de ${lista.length}`} className="w-16 h-16 rounded-xl overflow-hidden border border-editorial-border cursor-zoom-in">
            <img src={url} alt="" loading="lazy" className="w-full h-full object-cover hover:scale-105 transition" />
          </button>
        ))}
      </div>
      {aberta !== null && (
        <div role="dialog" aria-modal="true" aria-label={alt} className="fixed inset-0 z-[100] bg-black/90 flex items-center justify-center p-4" onClick={() => setAberta(null)}>
          <img src={lista[aberta]} alt={alt} className="max-h-[85vh] max-w-full rounded-xl object-contain" onClick={e => e.stopPropagation()} />
          <button type="button" onClick={() => setAberta(null)} aria-label="Fechar" className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/15 text-white flex items-center justify-center cursor-pointer"><X className="h-5 w-5" /></button>
          {lista.length > 1 && (
            <>
              <button type="button" onClick={e => { e.stopPropagation(); setAberta((aberta - 1 + lista.length) % lista.length); }} aria-label="Foto anterior" className="absolute left-3 w-10 h-10 rounded-full bg-white/15 text-white flex items-center justify-center cursor-pointer"><ChevronLeft className="h-5 w-5" /></button>
              <button type="button" onClick={e => { e.stopPropagation(); setAberta((aberta + 1) % lista.length); }} aria-label="Próxima foto" className="absolute right-3 w-10 h-10 rounded-full bg-white/15 text-white flex items-center justify-center cursor-pointer"><ChevronRight className="h-5 w-5" /></button>
              <span className="absolute bottom-5 text-white/80 text-xs">{aberta + 1} / {lista.length}</span>
            </>
          )}
        </div>
      )}
    </>
  );
}
