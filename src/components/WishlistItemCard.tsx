import React from "react";
import { X, Building2, Compass, MapPin, Package } from "lucide-react";
import { navigate } from "../lib/router";
import PictureImg from "./PictureImg";

export interface WishItem {
  id: string;
  tipo: "pousada" | "guia" | "atracao" | "pacote";
  refId: string;
  nome: string;
  imagem?: string;
  local?: string;
  preco?: string;
  url: string;
}

const TIPO = {
  pousada: { label: "Pousada", Icon: Building2 },
  guia: { label: "Guia", Icon: Compass },
  atracao: { label: "Atração", Icon: MapPin },
  pacote: { label: "Pacote", Icon: Package },
};

export default function WishlistItemCard({ item, onRemove }: { item: WishItem; onRemove?: () => void }) {
  const { label, Icon } = TIPO[item.tipo];
  return (
    <div className="relative bg-white border border-editorial-border rounded-2xl overflow-hidden group">
      <a href={item.url} onClick={e => { e.preventDefault(); navigate(item.url); }} className="block cursor-pointer">
        <div className="aspect-[4/3] bg-editorial-secondary overflow-hidden">
          {item.imagem ? (
            <PictureImg src={item.imagem} alt="" className="w-full h-full object-cover group-hover:scale-105 transition duration-500" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-editorial-muted"><Icon className="h-8 w-8" /></div>
          )}
        </div>
        <div className="p-3">
          <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-widest font-bold text-editorial-accent"><Icon className="h-3 w-3" /> {label}</span>
          <p className="font-serif font-semibold text-editorial-text leading-snug mt-0.5">{item.nome}</p>
          {item.local && <p className="text-xs text-editorial-muted truncate">{item.local}</p>}
          {item.preco && <p className="text-xs font-semibold text-editorial-text mt-1">{item.preco}</p>}
        </div>
      </a>
      {onRemove && (
        <button type="button" onClick={onRemove} aria-label={`Remover ${item.nome} da lista`} className="absolute top-2 right-2 w-8 h-8 rounded-full bg-white/90 shadow flex items-center justify-center hover:text-red-600 cursor-pointer">
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}
