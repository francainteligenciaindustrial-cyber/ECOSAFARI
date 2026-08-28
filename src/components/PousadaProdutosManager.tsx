import React, { useState, useEffect } from "react";
import { Package, Plus, Trash2, LoaderCircle, ToggleLeft, ToggleRight, QrCode, X } from "lucide-react";
import { Produto } from "../types";
import { adminFetch } from "../lib/adminFetch";

interface Props {
  pousadaId: string;
}

const CATEGORY_LABELS: Record<Produto["category"], string> = {
  frigobar: "Frigobar",
  vestuario: "Vestuário",
  brinde: "Brinde",
  outro: "Outro",
};

// Autoatendimento do parceiro: cadastra os produtos vendáveis (frigobar,
// vestuário, brindes) — cada um ganha um QR code fixo que a recepção
// escaneia pra lançar consumo na conta do hóspede (ver
// PousadaConsumoManager.tsx).
export default function PousadaProdutosManager({ pousadaId }: Props) {
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<Produto["category"]>("frigobar");
  const [price, setPrice] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const [qrFor, setQrFor] = useState<Produto | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [loadingQr, setLoadingQr] = useState(false);

  const fetchProdutos = () => {
    setLoading(true);
    adminFetch(`/api/pousadas/${pousadaId}/produtos`)
      .then(res => (res.ok ? res.json() : []))
      .then(setProdutos)
      .catch(() => setProdutos([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchProdutos(); }, [pousadaId]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    const p = Number(price);
    if (!name.trim() || !Number.isFinite(p) || p <= 0) {
      setError("Informe um nome e um preço válido.");
      return;
    }
    setCreating(true);
    try {
      const res = await adminFetch(`/api/pousadas/${pousadaId}/produtos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), description: description.trim() || undefined, category, price: p }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Erro ao criar produto.");
        return;
      }
      setName(""); setDescription(""); setPrice("");
      fetchProdutos();
    } finally {
      setCreating(false);
    }
  };

  const handleToggleActive = async (p: Produto) => {
    await adminFetch(`/api/pousadas/${pousadaId}/produtos/${p.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: !p.active }),
    });
    fetchProdutos();
  };

  const handleDelete = async (p: Produto) => {
    if (!confirm(`Excluir o produto "${p.name}"?`)) return;
    await adminFetch(`/api/pousadas/${pousadaId}/produtos/${p.id}`, { method: "DELETE" });
    fetchProdutos();
  };

  const handleShowQr = async (p: Produto) => {
    setQrFor(p);
    setQrDataUrl(null);
    setLoadingQr(true);
    try {
      const res = await adminFetch(`/api/produtos/${p.id}/qrcode`);
      const data = await res.json();
      if (res.ok) setQrDataUrl(data.qrcode);
    } finally {
      setLoadingQr(false);
    }
  };

  return (
    <div className="bg-white border border-editorial-border rounded-lg p-6 space-y-6">
      <div>
        <h3 className="font-bold text-sm text-editorial-text flex items-center gap-2 mb-1">
          <Package className="h-4 w-4 text-editorial-primary" /> Catálogo de Produtos
        </h3>
        <p className="text-editorial-muted text-xs">Itens vendáveis (frigobar, vestuário, brindes) — cada um ganha um QR code pra registrar consumo na conta do hóspede na recepção.</p>
      </div>

      {loading ? (
        <div className="flex justify-center py-6"><LoaderCircle className="h-5 w-5 text-editorial-primary animate-spin" /></div>
      ) : (
        <div className="space-y-2">
          {produtos.map(p => (
            <div key={p.id} className="flex items-center justify-between gap-3 border border-editorial-border rounded-md p-3">
              <div className="min-w-0">
                <p className="text-xs font-semibold text-editorial-text truncate">
                  {p.name} — <span className="text-editorial-primary">R$ {p.price.toLocaleString('pt-BR')}</span>
                  <span className="ml-2 text-[9px] uppercase tracking-wider font-bold text-editorial-muted bg-editorial-secondary px-1.5 py-0.5 rounded">{CATEGORY_LABELS[p.category]}</span>
                </p>
                {p.description && <p className="text-editorial-muted text-[11px] truncate">{p.description}</p>}
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <button onClick={() => handleShowQr(p)} className="text-editorial-muted hover:text-editorial-primary transition cursor-pointer" title="Ver QR code">
                  <QrCode className="h-4 w-4" />
                </button>
                <button onClick={() => handleToggleActive(p)} className="text-editorial-muted hover:text-editorial-primary transition cursor-pointer" title={p.active ? "Desativar" : "Ativar"}>
                  {p.active ? <ToggleRight className="h-5 w-5 text-emerald-600" /> : <ToggleLeft className="h-5 w-5" />}
                </button>
                <button onClick={() => handleDelete(p)} className="text-editorial-muted hover:text-red-600 transition cursor-pointer" title="Excluir">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ))}
          {produtos.length === 0 && <p className="text-editorial-muted text-xs italic">Nenhum produto cadastrado ainda.</p>}
        </div>
      )}

      <form onSubmit={handleCreate} className="border-t border-editorial-border pt-4 space-y-2">
        <label className="block text-editorial-text font-semibold text-xs">Novo produto</label>
        <input
          type="text" value={name} onChange={e => setName(e.target.value)} placeholder="Nome (ex: Refrigerante lata)"
          className="w-full border border-editorial-border rounded-md p-2 text-xs focus:outline-none focus:ring-1 focus:ring-editorial-primary"
        />
        <input
          type="text" value={description} onChange={e => setDescription(e.target.value)} placeholder="Descrição (opcional)"
          className="w-full border border-editorial-border rounded-md p-2 text-xs focus:outline-none focus:ring-1 focus:ring-editorial-primary"
        />
        <div className="flex gap-2">
          <select
            value={category} onChange={e => setCategory(e.target.value as Produto["category"])}
            className="border border-editorial-border rounded-md p-2 text-xs focus:outline-none focus:ring-1 focus:ring-editorial-primary"
          >
            {(Object.keys(CATEGORY_LABELS) as Produto["category"][]).map(c => <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>)}
          </select>
          <input
            type="number" min={0.01} step={0.01} value={price} onChange={e => setPrice(e.target.value)} placeholder="Preço (R$)"
            className="flex-1 border border-editorial-border rounded-md p-2 text-xs focus:outline-none focus:ring-1 focus:ring-editorial-primary"
          />
          <button type="submit" disabled={creating} className="bg-editorial-primary text-white text-xs font-bold uppercase tracking-widest px-4 py-2 rounded-md disabled:opacity-60 cursor-pointer flex items-center gap-1.5 flex-shrink-0">
            {creating ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />} Criar
          </button>
        </div>
        {error && <p className="text-red-600 text-xs font-medium">{error}</p>}
      </form>

      {qrFor && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50" onClick={() => setQrFor(null)}>
          <div className="bg-white rounded-lg p-6 max-w-xs w-full text-center relative" onClick={e => e.stopPropagation()}>
            <button onClick={() => setQrFor(null)} className="absolute top-3 right-3 text-editorial-muted hover:text-editorial-text cursor-pointer"><X className="h-4 w-4" /></button>
            <p className="text-sm font-bold text-editorial-text mb-1">{qrFor.name}</p>
            <p className="text-editorial-muted text-[11px] mb-4">Imprima e cole perto do produto — a recepção escaneia isso pra lançar o consumo.</p>
            {loadingQr ? (
              <div className="flex justify-center py-10"><LoaderCircle className="h-6 w-6 text-editorial-primary animate-spin" /></div>
            ) : qrDataUrl ? (
              <img src={qrDataUrl} alt={`QR code — ${qrFor.name}`} className="mx-auto w-48 h-48" />
            ) : (
              <p className="text-red-600 text-xs">Erro ao gerar QR code.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
