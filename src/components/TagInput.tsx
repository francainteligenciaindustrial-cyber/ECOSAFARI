import React, { useState } from "react";
import { X } from "lucide-react";

interface TagInputProps {
  value: string[];
  onChange: (tags: string[]) => void;
  placeholder?: string;
}

// Replaces the old "type a comma-separated string" fields (features,
// activities) in the admin pousada forms — typing a tag and pressing
// Enter/comma turns it into a removable pill instead of relying on the
// admin to type commas correctly, which silently broke the stored list if
// they didn't (e.g. a feature name that itself contained a comma).
export default function TagInput({ value, onChange, placeholder }: TagInputProps) {
  const [draft, setDraft] = useState("");

  const commitDraft = () => {
    const trimmed = draft.trim();
    if (trimmed && !value.includes(trimmed)) {
      onChange([...value, trimmed]);
    }
    setDraft("");
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      commitDraft();
    } else if (e.key === "Backspace" && !draft && value.length > 0) {
      onChange(value.slice(0, -1));
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-1.5 w-full bg-zinc-50 border border-zinc-200 rounded-lg p-2 focus-within:border-emerald-500 transition">
      {value.map((tag, idx) => (
        <span key={`${tag}-${idx}`} className="flex items-center gap-1 bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-full pl-2.5 pr-1.5 py-1 text-[11px] font-semibold">
          {tag}
          <button
            type="button"
            onClick={() => onChange(value.filter((_, i) => i !== idx))}
            className="hover:text-red-600 transition cursor-pointer"
            aria-label={`Remover ${tag}`}
          >
            <X className="h-3 w-3" />
          </button>
        </span>
      ))}
      <input
        type="text"
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={commitDraft}
        placeholder={value.length === 0 ? placeholder : "Adicionar..."}
        className="flex-1 min-w-[120px] bg-transparent border-none outline-none text-xs py-1"
      />
    </div>
  );
}
