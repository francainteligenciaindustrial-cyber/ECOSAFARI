import React, { useRef, useState } from "react";
import { Upload, LoaderCircle } from "lucide-react";
import { adminFetch } from "../lib/adminFetch";

// Uploads a file to POST /api/upload-image (Supabase Storage) and hands the
// resulting public URL back to the caller, so admin image fields can be
// filled by picking a file instead of having to already have the photo
// hosted somewhere and pasting its URL.
interface Props {
  onUploaded: (url: string) => void;
  label?: string;
  // Ícone customizado (padrão: Upload) — usado por chamadas que querem um
  // ícone mais específico ao contexto (ex: câmera pra trocar foto, "+" pra
  // anexar foto num post) sem precisar de um componente próprio.
  icon?: React.ReactNode;
  // Botão circular só com ícone, sem texto — usado sobre um avatar/capa
  // (estética "editar foto" de rede social), em vez do botão-pílula com label.
  compact?: boolean;
}

export default function ImageUploadButton({ onUploaded, label = "Enviar imagem", icon, compact = false }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");

  const handleFile = async (file: File) => {
    setUploading(true);
    setError("");
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await adminFetch("/api/upload-image", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Falha no upload");
      onUploaded(data.url);
    } catch (err: any) {
      setError(err.message || "Falha no upload");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <div className="inline-flex items-center gap-2">
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
      />
      <button
        type="button"
        disabled={uploading}
        onClick={() => inputRef.current?.click()}
        title={compact ? label || "Trocar foto" : undefined}
        className={
          compact
            ? "flex items-center justify-center w-8 h-8 rounded-full bg-editorial-primary text-white border-2 border-editorial-bg shadow hover:opacity-90 disabled:opacity-60 transition cursor-pointer flex-shrink-0"
            : "flex items-center gap-1.5 text-[11px] font-semibold text-emerald-700 border border-emerald-600/40 hover:bg-emerald-50 disabled:opacity-60 px-2.5 py-1.5 rounded-md transition cursor-pointer flex-shrink-0"
        }
      >
        {uploading ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : (icon ?? <Upload className="h-3.5 w-3.5" />)}
        {!compact && (uploading ? "Enviando..." : label)}
      </button>
      {error && <span className="text-[10px] text-red-600">{error}</span>}
    </div>
  );
}
