import React from "react";
import { Plus, Trash2 } from "lucide-react";

export interface ExperienceDraft {
  title: string;
  price: number;
  description?: string;
}

// Replaces the old "Safári Onça:400, Trilha:200" comma/colon-separated text
// field for a pousada's paid experiences — a structured row-per-experience
// editor is much less error-prone (no risk of a title containing a colon or
// comma silently corrupting the parsed list) and reads as more deliberate in
// the admin UI.
interface Props {
  value: ExperienceDraft[];
  onChange: (items: ExperienceDraft[]) => void;
  addLabel?: string;
  namePlaceholder?: string;
  // Cardápio: nome do prato + descrição da composição embaixo.
  withDescription?: boolean;
  descriptionPlaceholder?: string;
}

export default function ExperienceListEditor({
  value,
  onChange,
  addLabel = "Adicionar experiência",
  namePlaceholder = "Nome da experiência",
  withDescription = false,
  descriptionPlaceholder = "Descrição",
}: Props) {
  const update = (idx: number, patch: Partial<ExperienceDraft>) => {
    onChange(value.map((item, i) => (i === idx ? { ...item, ...patch } : item)));
  };

  return (
    <div className="space-y-2">
      {value.map((item, idx) => (
        <div key={idx} className={withDescription ? "border border-zinc-200 rounded p-2 space-y-2 bg-white" : ""}>
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={item.title}
            onChange={e => update(idx, { title: e.target.value })}
            placeholder={namePlaceholder}
            aria-label={namePlaceholder}
            className="flex-1 bg-zinc-50 border border-zinc-200 rounded p-2 text-xs focus:outline-none focus:border-emerald-500"
          />
          <span className="text-zinc-400 text-[11px] font-semibold">R$</span>
          <input
            type="number"
            min={0}
            value={item.price}
            onChange={e => update(idx, { price: Number(e.target.value) })}
            aria-label="Preço em reais"
            className="w-24 bg-zinc-50 border border-zinc-200 rounded p-2 text-xs focus:outline-none focus:border-emerald-500"
          />
          <button
            type="button"
            onClick={() => onChange(value.filter((_, i) => i !== idx))}
            className="text-zinc-400 hover:text-red-600 transition cursor-pointer flex-shrink-0"
            title="Remover"
            aria-label="Remover"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
        {withDescription && (
          <textarea
            rows={2}
            value={item.description || ""}
            onChange={e => update(idx, { description: e.target.value })}
            placeholder={descriptionPlaceholder}
            aria-label={descriptionPlaceholder}
            className="w-full bg-zinc-50 border border-zinc-200 rounded p-2 text-xs focus:outline-none focus:border-emerald-500 resize-none"
          />
        )}
        </div>
      ))}
      <button
        type="button"
        onClick={() => onChange([...value, withDescription ? { title: "", price: 0, description: "" } : { title: "", price: 0 }])}
        className="flex items-center gap-1 text-emerald-700 font-semibold text-[11px] hover:text-emerald-800 transition cursor-pointer"
      >
        <Plus className="h-3.5 w-3.5" /> {addLabel}
      </button>
    </div>
  );
}
