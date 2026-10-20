import React, { useEffect, useState } from "react";
import { Smartphone } from "lucide-react";
import { adminFetch } from "../lib/adminFetch";

interface AppLodge { id: string; name: string; slug: string }

// Vínculo pousada do site ↔ pousada do app EcoSafari Go, pelo ID do app
// (a lista vem do próprio app; nomes parecidos não confundem). Mostra o slug
// para diferenciar pousadas de nome igual.
export default function AppLodgeSelect({ value, onChange }: { value: string; onChange: (id: string) => void }) {
  const [lodges, setLodges] = useState<AppLodge[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    adminFetch("/api/admin/app-lodges")
      .then(async res => {
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body.error || "Não foi possível consultar o app.");
        setLodges(body);
      })
      .catch(err => setError(err.message));
  }, []);

  return (
    <div className="text-xs space-y-1">
      <label htmlFor="app-lodge" className="block text-zinc-700 font-semibold flex items-center gap-1.5"><Smartphone className="h-3.5 w-3.5" /> Pousada no app EcoSafari Go</label>
      {error ? (
        <p className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded px-2 py-1.5">{error}</p>
      ) : (
        <select id="app-lodge" value={value} disabled={!lodges} onChange={e => onChange(e.target.value)} className="w-full bg-zinc-50 border border-zinc-200 rounded-lg p-2.5 focus:outline-none focus:border-emerald-500">
          <option value="">{lodges ? "Sem vínculo" : "Carregando pousadas do app..."}</option>
          {(lodges || []).map(l => <option key={l.id} value={l.id}>{l.name} ({l.slug})</option>)}
          {value && lodges && !lodges.some(l => l.id === value) && <option value={value}>Pousada removida do app ({value.slice(0, 8)}…)</option>}
        </select>
      )}
      <p className="text-[11px] text-zinc-500">Com o vínculo, os avistamentos aprovados desta pousada no app alimentam o calendário de melhor época e o mapa do site.</p>
    </div>
  );
}
