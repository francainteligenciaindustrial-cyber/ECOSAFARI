import React from "react";
import { Plus, Trash2 } from "lucide-react";

export interface ExperienceDraft {
  title: string;
  price: number;
}

// Replaces the old "Safári Onça:400, Trilha:200" comma/colon-separated text
// field for a pousada's paid experiences — a structured row-per-experience
// editor is much less error-prone (no risk of a title containing a colon or
// comma silently corrupting the parsed list) and reads as more deliberate in
// the admin UI.
export default function ExperienceListEditor({ value, onChange }: { value: ExperienceDraft[]; onChange: (items: ExperienceDraft[]) => void }) {
  const update = (idx: number, patch: Partial<ExperienceDraft>) => {
    onChange(value.map((item, i) => (i === idx ? { ...item, ...patch } : item)));
  };

  return (
    <div className="space-y-2">
      {value.map((item, idx) => (
        <div key={idx} className="flex items-center gap-2">
          <input
            type="text"
            value={item.title}
            onChange={e => update(idx, { title: e.target.value })}
            placeholder="Nome da experiência"
            className="flex-1 bg-zinc-50 border border-zinc-200 rounded p-2 text-xs focus:outline-none focus:border-emerald-500"
          />
          <span className="text-zinc-400 text-[11px] font-semibold">R$</span>
          <input
            type="number"
            min={0}
            value={item.price}
            onChange={e => update(idx, { price: Number(e.target.value) })}
            className="w-24 bg-zinc-50 border border-zinc-200 rounded p-2 text-xs focus:outline-none focus:border-emerald-500"
          />
          <button
            type="button"
            onClick={() => onChange(value.filter((_, i) => i !== idx))}
            className="text-zinc-400 hover:text-red-600 transition cursor-pointer flex-shrink-0"
            title="Remover experiência"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() => onChange([...value, { title: "", price: 0 }])}
        className="flex items-center gap-1 text-emerald-700 font-semibold text-[11px] hover:text-emerald-800 transition cursor-pointer"
      >
        <Plus className="h-3.5 w-3.5" /> Adicionar experiência
      </button>
    </div>
  );
}
