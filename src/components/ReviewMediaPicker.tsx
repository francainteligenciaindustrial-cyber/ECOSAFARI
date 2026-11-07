import React, { useRef, useState } from "react";
import { Camera, X, LoaderCircle, Plus } from "lucide-react";
import { adminFetch } from "../lib/adminFetch";

export const MAX_REVIEW_PHOTOS = 5;

// Fotos da avaliação, como nos comentários do Mercado Livre/Shopee: escolhe
// do celular ou do computador (várias de uma vez), vê as miniaturas e tira
// a que não quiser. Cada foto sobe para o nosso armazenamento
// (POST /api/upload-image, que também passa pela moderação de imagem).
export default function ReviewMediaPicker({
  value, onChange, onUploadingChange, labels,
}: {
  value: string[];
  onChange: (urls: string[]) => void;
  onUploadingChange?: (uploading: boolean) => void;
  labels: { add: string; hint: string; limit: string; remove: string };
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [pendentes, setPendentes] = useState<{ id: string; preview: string }[]>([]);
  const [erro, setErro] = useState("");
  const restantes = MAX_REVIEW_PHOTOS - value.length - pendentes.length;

  const enviar = async (files: File[]) => {
    setErro("");
    const lote = files.slice(0, Math.max(0, restantes));
    if (files.length > lote.length) setErro(labels.limit);
    if (lote.length === 0) return;
    const itens = lote.map(f => ({ id: Math.random().toString(36).slice(2), preview: URL.createObjectURL(f), file: f }));
    setPendentes(p => [...p, ...itens.map(({ id, preview }) => ({ id, preview }))]);
    onUploadingChange?.(true);
    const novas: string[] = [];
    for (const it of itens) {
      try {
        const fd = new FormData();
        fd.append("file", it.file);
        const res = await adminFetch("/api/upload-image", { method: "POST", body: fd });
        const body = await res.json().catch(() => ({}));
        if (!res.ok || !body.url) throw new Error(body.error || "Falha no envio");
        novas.push(body.url);
      } catch (err: any) {
        setErro(err.message || "Falha no envio da foto.");
      } finally {
        URL.revokeObjectURL(it.preview);
        setPendentes(p => p.filter(x => x.id !== it.id));
      }
    }
    onChange([...value, ...novas].slice(0, MAX_REVIEW_PHOTOS));
    onUploadingChange?.(false);
  };

  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        multiple
        className="hidden"
        onChange={e => { const fs = Array.from(e.target.files || []); e.target.value = ""; if (fs.length) enviar(fs); }}
      />
      <div className="flex flex-wrap gap-2">
        {value.map((url, i) => (
          <div key={url} className="relative w-16 h-16 rounded-xl overflow-hidden border border-editorial-border bg-editorial-secondary">
            <img src={url} alt="" className="w-full h-full object-cover" />
            <button type="button" onClick={() => onChange(value.filter((_, j) => j !== i))} aria-label={labels.remove} className="absolute top-0.5 right-0.5 w-5 h-5 rounded-full bg-black/60 text-white flex items-center justify-center cursor-pointer">
              <X className="h-3 w-3" />
            </button>
          </div>
        ))}
        {pendentes.map(p => (
          <div key={p.id} className="relative w-16 h-16 rounded-xl overflow-hidden border border-editorial-border">
            <img src={p.preview} alt="" className="w-full h-full object-cover opacity-50" />
            <LoaderCircle className="absolute inset-0 m-auto h-5 w-5 animate-spin text-editorial-primary" />
          </div>
        ))}
        {restantes > 0 && (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className={`${value.length + pendentes.length === 0 ? "w-full h-20 flex-row gap-2" : "w-16 h-16 flex-col gap-0.5"} rounded-xl border-2 border-dashed border-editorial-border hover:border-editorial-primary text-editorial-muted hover:text-editorial-primary flex items-center justify-center text-[10px] font-bold uppercase tracking-wider cursor-pointer transition`}
          >
            {value.length + pendentes.length === 0 ? <><Camera className="h-5 w-5" /> {labels.add}</> : <Plus className="h-5 w-5" />}
          </button>
        )}
      </div>
      <p className="text-editorial-muted text-[9px] mt-1">{labels.hint}</p>
      {erro && <p className="text-red-600 text-[11px] mt-1">{erro}</p>}
    </div>
  );
}
