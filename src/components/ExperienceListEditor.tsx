import React, { useState } from "react";
import { Plus, Trash2, Pencil, Check, UserCog } from "lucide-react";

export interface ExperienceDraft {
  title: string;
  price: number;
  description?: string;
  // Passeio/atividade que depende de contratar alguém (guia, piloteiro...).
  requiresProvider?: boolean;
  providerType?: string;
}

export const PROVIDER_TYPES = ["Guia turístico", "Piloteiro", "Cozinheiro(a)", "Fotógrafo(a)", "Músico/Cantor", "Camareira", "Motorista/Transfer", "Outro"];

// Replaces the old "Safári Onça:400, Trilha:200" comma/colon-separated text
// field for a pousada's paid experiences — a structured row-per-experience
// editor is much less error-prone (no risk of a title containing a colon or
// comma silently corrupting the parsed list) and reads as more deliberate in
// the admin UI.
// Itens já preenchidos aparecem travados (só leitura) com botão de editar;
// item novo abre em edição até clicar em "Concluir" (reunião de 20/10/2026).
interface Props {
  value: ExperienceDraft[];
  onChange: (items: ExperienceDraft[]) => void;
  addLabel?: string;
  namePlaceholder?: string;
  // Cardápio: nome do prato + descrição da composição embaixo.
  withDescription?: boolean;
  descriptionPlaceholder?: string;
  // Passeios: marca se precisa contratar um prestador de serviço.
  withProvider?: boolean;
}

const fieldClass = "bg-zinc-50 border border-zinc-200 rounded p-2 text-xs focus:outline-none focus:border-emerald-500";
const brl = (n: number) => (Number(n) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export default function ExperienceListEditor({
  value,
  onChange,
  addLabel = "Adicionar",
  namePlaceholder = "Nome da experiência",
  withDescription = false,
  descriptionPlaceholder = "Descrição",
  withProvider = false,
}: Props) {
  // Índices em edição. Itens sem nome (recém-adicionados) contam como em edição.
  const [editing, setEditing] = useState<Set<number>>(() => new Set());
  const isEditing = (idx: number) => editing.has(idx) || !value[idx]?.title?.trim();

  const update = (idx: number, patch: Partial<ExperienceDraft>) => {
    onChange(value.map((item, i) => (i === idx ? { ...item, ...patch } : item)));
  };
  const setEdit = (idx: number, on: boolean) => {
    setEditing(prev => {
      const next = new Set(prev);
      if (on) next.add(idx);
      else next.delete(idx);
      return next;
    });
  };
  const remove = (idx: number) => {
    onChange(value.filter((_, i) => i !== idx));
    // Reindexa quem estava em edição depois do item removido.
    setEditing(prev => new Set([...prev].filter(i => i !== idx).map(i => (i > idx ? i - 1 : i))));
  };

  return (
    <div className="space-y-2">
      {value.map((item, idx) => {
        const boxed = withDescription || withProvider;
        if (!isEditing(idx)) {
          return (
            <div key={idx} className="border border-zinc-200 rounded p-2.5 bg-white flex items-start gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="font-semibold text-xs text-zinc-800 truncate">{item.title}</span>
                  <span className="text-xs font-semibold text-emerald-800 whitespace-nowrap">{brl(item.price)}</span>
                </div>
                {withDescription && item.description && <p className="text-[11px] text-zinc-500 mt-0.5 whitespace-pre-line">{item.description}</p>}
                {withProvider && item.requiresProvider && (
                  <span className="inline-flex items-center gap-1 mt-1 text-[10px] font-semibold text-amber-800 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5">
                    <UserCog className="h-3 w-3" /> Precisa de prestador{item.providerType ? `: ${item.providerType}` : ""}
                  </span>
                )}
              </div>
              <button type="button" onClick={() => setEdit(idx, true)} className="text-zinc-400 hover:text-emerald-700 transition cursor-pointer flex-shrink-0" title="Editar" aria-label={`Editar ${item.title}`}>
                <Pencil className="h-4 w-4" />
              </button>
              <button type="button" onClick={() => remove(idx)} className="text-zinc-400 hover:text-red-600 transition cursor-pointer flex-shrink-0" title="Remover" aria-label={`Remover ${item.title}`}>
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          );
        }
        return (
          <div key={idx} className={boxed ? "border border-emerald-300 rounded p-2 space-y-2 bg-white" : ""}>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={item.title}
                onChange={e => update(idx, { title: e.target.value })}
                placeholder={namePlaceholder}
                aria-label={namePlaceholder}
                className={`flex-1 min-w-0 ${fieldClass}`}
              />
              <span className="text-zinc-400 text-[11px] font-semibold">R$</span>
              <input
                type="number"
                min={0}
                value={item.price}
                onChange={e => update(idx, { price: Number(e.target.value) })}
                aria-label="Preço em reais"
                className={`w-24 ${fieldClass}`}
              />
              <button
                type="button"
                onClick={() => setEdit(idx, false)}
                disabled={!item.title.trim()}
                className="text-emerald-700 hover:text-emerald-900 transition cursor-pointer flex-shrink-0 disabled:opacity-30 disabled:cursor-not-allowed"
                title="Concluir"
                aria-label="Concluir edição"
              >
                <Check className="h-4 w-4" />
              </button>
              <button type="button" onClick={() => remove(idx)} className="text-zinc-400 hover:text-red-600 transition cursor-pointer flex-shrink-0" title="Remover" aria-label="Remover">
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
                className={`w-full resize-none ${fieldClass}`}
              />
            )}
            {withProvider && (
              <div className="flex flex-wrap items-center gap-3 text-[11px]">
                <label className="flex items-center gap-1.5 cursor-pointer text-zinc-700">
                  <input
                    type="checkbox"
                    checked={!!item.requiresProvider}
                    onChange={e => update(idx, { requiresProvider: e.target.checked, providerType: e.target.checked ? item.providerType || PROVIDER_TYPES[0] : undefined })}
                  />
                  Precisa contratar prestador de serviço
                </label>
                {item.requiresProvider && (
                  <select value={item.providerType || PROVIDER_TYPES[0]} onChange={e => update(idx, { providerType: e.target.value })} aria-label="Tipo de prestador" className={fieldClass}>
                    {PROVIDER_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                )}
              </div>
            )}
          </div>
        );
      })}
      <button
        type="button"
        onClick={() => {
          setEdit(value.length, true);
          onChange([...value, withDescription ? { title: "", price: 0, description: "" } : { title: "", price: 0 }]);
        }}
        className="flex items-center gap-1 text-emerald-700 font-semibold text-[11px] hover:text-emerald-800 transition cursor-pointer"
      >
        <Plus className="h-3.5 w-3.5" /> {addLabel}
      </button>
    </div>
  );
}
