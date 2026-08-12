import React from "react";
import { Plus, Trash2 } from "lucide-react";
import { GuideLanguage, LanguageLevel } from "../types";
import { getLanguageFlag } from "../lib/languageFlags";

export const LEVEL_LABELS: Record<LanguageLevel, string> = {
  basico: "Básico",
  intermediario: "Intermediário",
  avancado: "Avançado",
};

// Row-per-language editor — each language now carries a proficiency level
// instead of being a flat tag, so a guide's profile can actually say "fala
// inglês avançado" instead of just "fala inglês".
export default function LanguagesEditor({ value, onChange }: { value: GuideLanguage[]; onChange: (languages: GuideLanguage[]) => void }) {
  const update = (idx: number, patch: Partial<GuideLanguage>) => {
    onChange(value.map((item, i) => (i === idx ? { ...item, ...patch } : item)));
  };

  return (
    <div className="space-y-2">
      {value.map((item, idx) => (
        <div key={idx} className="flex items-center gap-2">
          <span className="w-5 text-center flex-shrink-0 text-base" aria-hidden="true">{getLanguageFlag(item.language) || ""}</span>
          <input
            type="text"
            value={item.language}
            onChange={e => update(idx, { language: e.target.value })}
            placeholder="Idioma (ex: Inglês)"
            className="flex-1 bg-zinc-50 border border-zinc-200 rounded p-2 text-xs focus:outline-none focus:border-emerald-500"
          />
          <select
            value={item.level}
            onChange={e => update(idx, { level: e.target.value as LanguageLevel })}
            className="bg-zinc-50 border border-zinc-200 rounded p-2 text-xs focus:outline-none focus:border-emerald-500"
          >
            {(Object.keys(LEVEL_LABELS) as LanguageLevel[]).map(level => (
              <option key={level} value={level}>{LEVEL_LABELS[level]}</option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => onChange(value.filter((_, i) => i !== idx))}
            className="text-zinc-400 hover:text-red-600 transition cursor-pointer flex-shrink-0"
            title="Remover idioma"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() => onChange([...value, { language: "", level: "intermediario" }])}
        className="flex items-center gap-1 text-emerald-700 font-semibold text-[11px] hover:text-emerald-800 transition cursor-pointer"
      >
        <Plus className="h-3.5 w-3.5" /> Adicionar idioma
      </button>
    </div>
  );
}
