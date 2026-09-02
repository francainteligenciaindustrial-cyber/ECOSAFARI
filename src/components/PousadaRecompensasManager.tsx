import React, { useState, useEffect } from "react";
import { Coins, Plus, Trash2, LoaderCircle, ToggleLeft, ToggleRight, KeyRound, Check, X } from "lucide-react";
import { Recompensa } from "../types";
import { adminFetch } from "../lib/adminFetch";

interface Props {
  pousadaId: string;
}

// Autoatendimento do parceiro: cadastra os brindes trocáveis por Jaguars e
// confirma presencialmente o código que um turista mostrar no check-in/balcão.
export default function PousadaRecompensasManager({ pousadaId }: Props) {
  const [recompensas, setRecompensas] = useState<Recompensa[]>([]);
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [coinCost, setCoinCost] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");

  const [code, setCode] = useState("");
  const [validating, setValidating] = useState(false);
  const [validateResult, setValidateResult] = useState<{ ok: boolean; message: string } | null>(null);

  const fetchRecompensas = () => {
    setLoading(true);
    adminFetch(`/api/pousadas/${pousadaId}/recompensas/manage`)
      .then(res => (res.ok ? res.json() : []))
      .then(setRecompensas)
      .catch(() => setRecompensas([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchRecompensas(); }, [pousadaId]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    const cost = Number(coinCost);
    if (!title.trim() || !Number.isFinite(cost) || cost <= 0) {
      setError("Informe um título e um custo em Jaguars válido.");
      return;
    }
    setCreating(true);
    try {
      const res = await adminFetch(`/api/pousadas/${pousadaId}/recompensas`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: title.trim(), description: description.trim() || undefined, coinCost: cost }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Erro ao criar recompensa.");
        return;
      }
      setTitle(""); setDescription(""); setCoinCost("");
      fetchRecompensas();
    } finally {
      setCreating(false);
    }
  };

  const handleToggleActive = async (r: Recompensa) => {
    await adminFetch(`/api/pousadas/${pousadaId}/recompensas/${r.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: !r.active }),
    });
    fetchRecompensas();
  };

  const handleDelete = async (r: Recompensa) => {
    if (!confirm(`Excluir a recompensa "${r.title}"?`)) return;
    await adminFetch(`/api/pousadas/${pousadaId}/recompensas/${r.id}`, { method: "DELETE" });
    fetchRecompensas();
  };

  const handleValidateCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim()) return;
    setValidating(true);
    setValidateResult(null);
    try {
      const res = await adminFetch(`/api/pousadas/${pousadaId}/resgates/${code.trim().toUpperCase()}/usar`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setValidateResult({ ok: false, message: data.error || "Código inválido." });
        return;
      }
      setValidateResult({ ok: true, message: `Resgate confirmado! ${data.coinCost} Jaguars.` });
      setCode("");
    } finally {
      setValidating(false);
    }
  };

  return (
    <div className="bg-white border border-editorial-border rounded-lg p-6 space-y-6">
      <div>
        <h3 className="font-bold text-sm text-editorial-text flex items-center gap-2 mb-1">
          <Coins className="h-4 w-4 text-editorial-primary" /> Recompensas em Jaguars
        </h3>
        <p className="text-editorial-muted text-xs">Brindes ou descontos que um turista pode trocar pelos Jaguars que ganhou no aplicativo EcoSafari.</p>
      </div>

      {/* Validar código de resgate */}
      <form onSubmit={handleValidateCode} className="bg-editorial-secondary/40 border border-editorial-border rounded-lg p-4 space-y-2">
        <label className="block text-editorial-text font-semibold text-xs flex items-center gap-1.5"><KeyRound className="h-3.5 w-3.5" /> Confirmar código de resgate</label>
        <div className="flex gap-2">
          <input
            type="text" value={code} onChange={e => setCode(e.target.value.toUpperCase())}
            placeholder="Código mostrado pelo turista"
            className="flex-1 border border-editorial-border rounded-md p-2 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-editorial-primary"
          />
          <button type="submit" disabled={validating} className="bg-editorial-primary text-white text-xs font-bold uppercase tracking-widest px-4 py-2 rounded-md disabled:opacity-60 cursor-pointer">
            {validating ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : "Confirmar"}
          </button>
        </div>
        {validateResult && (
          <p className={`text-xs font-medium flex items-center gap-1 ${validateResult.ok ? "text-emerald-700" : "text-red-600"}`}>
            {validateResult.ok ? <Check className="h-3.5 w-3.5" /> : <X className="h-3.5 w-3.5" />} {validateResult.message}
          </p>
        )}
      </form>

      {/* Lista de recompensas */}
      {loading ? (
        <div className="flex justify-center py-6"><LoaderCircle className="h-5 w-5 text-editorial-primary animate-spin" /></div>
      ) : (
        <div className="space-y-2">
          {recompensas.map(r => (
            <div key={r.id} className="flex items-center justify-between gap-3 border border-editorial-border rounded-md p-3">
              <div className="min-w-0">
                <p className="text-xs font-semibold text-editorial-text truncate">{r.title} — <span className="text-editorial-primary">{r.coinCost} coins</span></p>
                {r.description && <p className="text-editorial-muted text-[11px] truncate">{r.description}</p>}
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <button onClick={() => handleToggleActive(r)} className="text-editorial-muted hover:text-editorial-primary transition cursor-pointer" title={r.active ? "Desativar" : "Ativar"}>
                  {r.active ? <ToggleRight className="h-5 w-5 text-emerald-600" /> : <ToggleLeft className="h-5 w-5" />}
                </button>
                <button onClick={() => handleDelete(r)} className="text-editorial-muted hover:text-red-600 transition cursor-pointer" title="Excluir">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ))}
          {recompensas.length === 0 && <p className="text-editorial-muted text-xs italic">Nenhuma recompensa cadastrada ainda.</p>}
        </div>
      )}

      {/* Criar nova */}
      <form onSubmit={handleCreate} className="border-t border-editorial-border pt-4 space-y-2">
        <label className="block text-editorial-text font-semibold text-xs">Nova recompensa</label>
        <input
          type="text" value={title} onChange={e => setTitle(e.target.value)} placeholder="Título (ex: 10% de desconto na diária)"
          className="w-full border border-editorial-border rounded-md p-2 text-xs focus:outline-none focus:ring-1 focus:ring-editorial-primary"
        />
        <input
          type="text" value={description} onChange={e => setDescription(e.target.value)} placeholder="Descrição (opcional)"
          className="w-full border border-editorial-border rounded-md p-2 text-xs focus:outline-none focus:ring-1 focus:ring-editorial-primary"
        />
        <div className="flex gap-2">
          <input
            type="number" min={1} value={coinCost} onChange={e => setCoinCost(e.target.value)} placeholder="Custo em Jaguars"
            className="flex-1 border border-editorial-border rounded-md p-2 text-xs focus:outline-none focus:ring-1 focus:ring-editorial-primary"
          />
          <button type="submit" disabled={creating} className="bg-editorial-primary text-white text-xs font-bold uppercase tracking-widest px-4 py-2 rounded-md disabled:opacity-60 cursor-pointer flex items-center gap-1.5">
            {creating ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />} Criar
          </button>
        </div>
        {error && <p className="text-red-600 text-xs font-medium">{error}</p>}
      </form>
    </div>
  );
}
