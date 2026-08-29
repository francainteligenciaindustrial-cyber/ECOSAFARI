import React, { useState, useEffect } from "react";
import { Trash2, RotateCcw, LoaderCircle, AlertTriangle } from "lucide-react";
import { adminFetch } from "../lib/adminFetch";
import { useToast } from "../lib/ToastProvider";

interface LixeiraEntry {
  id: string;
  entityType: "pousada" | "guide" | "atracao" | "turista" | "species";
  entityId: string;
  entityLabel: string;
  deletedBy: string;
  deletedAt: string;
  expiresAt: string;
}

const ENTITY_LABELS: Record<LixeiraEntry["entityType"], string> = {
  pousada: "Pousada",
  guide: "Guia",
  atracao: "Atração",
  turista: "Turista",
  species: "Espécie",
};

function diasRestantes(expiresAt: string): number {
  return Math.max(0, Math.ceil((new Date(expiresAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24)));
}

// Backup de exclusão: pousada/guia/atração/turista/espécie apagados pelo
// admin ficam aqui por 30 dias (o registro completo, não só o nome) antes de
// sumir de vez — dá pra restaurar em um clique caso alguém exclua algo por
// engano. Ver moverParaLixeira em server.ts e scripts/add-lixeira.sql.
export default function AdminLixeiraPanel() {
  const { showToast } = useToast();
  const [entries, setEntries] = useState<LixeiraEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [actingOn, setActingOn] = useState<string | null>(null);

  const fetchEntries = () => {
    setLoading(true);
    adminFetch("/api/lixeira")
      .then(res => (res.ok ? res.json() : []))
      .then(setEntries)
      .catch(() => setEntries([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchEntries(); }, []);

  const handleRestore = async (entry: LixeiraEntry) => {
    if (!confirm(`Restaurar "${entry.entityLabel}"? Volta a aparecer normalmente no sistema.`)) return;
    setActingOn(entry.id);
    try {
      const res = await adminFetch(`/api/lixeira/${entry.id}/restaurar`, { method: "POST" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        showToast(body.error || "Erro ao restaurar.", "error");
        return;
      }
      showToast("Restaurado com sucesso.", "success");
      fetchEntries();
    } finally {
      setActingOn(null);
    }
  };

  const handlePurge = async (entry: LixeiraEntry) => {
    if (!confirm(`Apagar "${entry.entityLabel}" definitivamente? Essa ação NÃO pode ser desfeita — nem pela lixeira.`)) return;
    setActingOn(entry.id);
    try {
      const res = await adminFetch(`/api/lixeira/${entry.id}`, { method: "DELETE" });
      if (res.ok) {
        showToast("Apagado definitivamente.", "success");
        fetchEntries();
      } else {
        showToast("Erro ao apagar definitivamente.", "error");
      }
    } finally {
      setActingOn(null);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <LoaderCircle className="h-6 w-6 text-editorial-primary animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="bg-amber-50 border border-amber-200 text-amber-900 text-xs px-4 py-3 rounded-lg flex items-start gap-2">
        <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" />
        Pousadas, guias, atrações, turistas e espécies excluídos pelo admin ficam aqui por 30 dias antes de serem apagados de vez — dá pra restaurar a qualquer momento nesse prazo.
      </div>

      {entries.length === 0 ? (
        <p className="text-zinc-400 text-sm italic py-8 text-center">Lixeira vazia.</p>
      ) : (
        <div className="divide-y divide-zinc-100 bg-white border border-zinc-200 rounded-xl overflow-hidden">
          {entries.map(entry => {
            const dias = diasRestantes(entry.expiresAt);
            return (
              <div key={entry.id} className="flex items-center justify-between gap-3 px-5 py-3.5">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-zinc-900 truncate">{entry.entityLabel}</p>
                  <p className="text-[11px] text-zinc-400">
                    <span className="inline-block bg-zinc-100 text-zinc-600 rounded-full px-2 py-0.5 font-bold uppercase tracking-wider text-[9px] mr-1.5">
                      {ENTITY_LABELS[entry.entityType]}
                    </span>
                    excluído por {entry.deletedBy || "admin"} · {dias > 0 ? `expira em ${dias} dia${dias > 1 ? "s" : ""}` : "expira hoje"}
                  </p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button
                    onClick={() => handleRestore(entry)}
                    disabled={actingOn === entry.id}
                    className="flex items-center gap-1 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-800 font-bold px-3 py-1.5 rounded-lg text-xs disabled:opacity-60 cursor-pointer"
                  >
                    <RotateCcw className="h-3.5 w-3.5" /> Restaurar
                  </button>
                  <button
                    onClick={() => handlePurge(entry)}
                    disabled={actingOn === entry.id}
                    className="flex items-center gap-1 text-red-500 hover:text-red-700 hover:bg-red-50 p-1.5 rounded-lg transition disabled:opacity-60 cursor-pointer"
                    title="Apagar definitivamente"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
