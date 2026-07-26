import React from "react";
import { Image as ImageIcon, Plus, Trash2 } from "lucide-react";
import ImageUploadButton from "./ImageUploadButton";

interface ImageListEditorProps {
  label: string;
  value: string[];
  onChange: (urls: string[]) => void;
  emptyHint?: string;
}

// One row per photo (URL field + live thumbnail + upload button + remove),
// used for every admin-managed image gallery on a pousada (catalog images,
// and the official-site-only gallery). Extracted so both share the exact
// same editing UX instead of drifting apart over time.
export default function ImageListEditor({ label, value, onChange, emptyHint = "Nenhuma imagem adicionada ainda." }: ImageListEditorProps) {
  const update = (idx: number, url: string) => {
    onChange(value.map((v, i) => (i === idx ? url : v)));
  };
  const remove = (idx: number) => onChange(value.filter((_, i) => i !== idx));
  const add = () => onChange([...value, ""]);

  return (
    <div className="text-xs">
      <div className="flex items-center justify-between mb-2">
        <label className="text-zinc-700 font-semibold flex items-center gap-1.5">
          <ImageIcon className="h-3.5 w-3.5" /> {label}
        </label>
        <div className="flex items-center gap-3">
          <ImageUploadButton label="Enviar nova imagem" onUploaded={url => onChange([...value, url])} />
          <button
            type="button"
            onClick={add}
            className="flex items-center gap-1 text-emerald-700 font-semibold hover:text-emerald-800 transition cursor-pointer"
          >
            <Plus className="h-3.5 w-3.5" /> Adicionar link
          </button>
        </div>
      </div>
      <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
        {value.length === 0 && (
          <p className="text-zinc-400 italic py-2">{emptyHint}</p>
        )}
        {value.map((line, idx) => (
          <div key={idx} className="flex items-center gap-3 bg-zinc-50 border border-zinc-200 rounded-lg p-2">
            <div className="w-14 h-14 flex-shrink-0 rounded-md overflow-hidden bg-zinc-200 border border-zinc-300 flex items-center justify-center">
              {line.trim() ? (
                <img
                  src={line.trim()}
                  alt={`Imagem ${idx + 1}`}
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover"
                  onError={e => { (e.target as HTMLImageElement).style.display = "none"; }}
                />
              ) : (
                <ImageIcon className="h-5 w-5 text-zinc-400" />
              )}
            </div>
            <input
              type="text"
              value={line}
              onChange={e => update(idx, e.target.value)}
              placeholder="https://... ou /pousadas/foto.png"
              className="flex-1 bg-white border border-zinc-200 rounded p-2 focus:outline-none focus:border-emerald-500 font-mono"
            />
            <ImageUploadButton label="Enviar" onUploaded={url => update(idx, url)} />
            <button
              type="button"
              onClick={() => remove(idx)}
              className="text-zinc-400 hover:text-red-600 transition cursor-pointer flex-shrink-0"
              title="Remover imagem"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
