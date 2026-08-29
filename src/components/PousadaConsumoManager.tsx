import React, { useState, useEffect } from "react";
import { ShoppingBag, LoaderCircle, QrCode, Plus, Trash2, CreditCard, Check } from "lucide-react";
import { Produto, Consumo } from "../types";
import { adminFetch } from "../lib/adminFetch";
import { useToast } from "../lib/ToastProvider";
import QrProductScanner from "./QrProductScanner";

interface HospedeAtivo {
  id: string; // bookingId
  customerName: string;
  customerEmail: string;
  checkIn: string;
  checkOut: string;
  status: string;
}

interface Props {
  pousadaId: string;
}

// A "comanda" de cada hóspede — o que consumiu de frigobar/vestuário/
// brindes durante a estadia (ver PousadaProdutosManager.tsx pro catálogo
// que alimenta isso). Escanear o QR do produto (QrProductScanner) ou
// adicionar manualmente lançam na conta do hóspede selecionado; "Marcar
// como Pago" (fora do Stripe) e "Cobrar" (gera link Stripe) fecham a conta.
export default function PousadaConsumoManager({ pousadaId }: Props) {
  const { showToast } = useToast();
  const [hospedes, setHospedes] = useState<HospedeAtivo[]>([]);
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedBookingId, setSelectedBookingId] = useState<string | null>(null);
  const [consumos, setConsumos] = useState<Consumo[]>([]);
  const [loadingConsumos, setLoadingConsumos] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const [manualProdutoId, setManualProdutoId] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [adding, setAdding] = useState(false);
  const [charging, setCharging] = useState(false);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      adminFetch(`/api/pousadas/${pousadaId}/hospedes-ativos`).then(r => (r.ok ? r.json() : [])),
      adminFetch(`/api/pousadas/${pousadaId}/produtos`).then(r => (r.ok ? r.json() : [])),
    ])
      .then(([h, p]) => {
        setHospedes(h);
        setProdutos((Array.isArray(p) ? p : []).filter((prod: Produto) => prod.active));
      })
      .catch(() => {
        setHospedes([]);
        setProdutos([]);
      })
      .finally(() => setLoading(false));
  }, [pousadaId]);

  const fetchConsumos = (bookingId: string) => {
    setLoadingConsumos(true);
    adminFetch(`/api/pousadas/${pousadaId}/bookings/${bookingId}/consumos`)
      .then(r => (r.ok ? r.json() : []))
      .then(setConsumos)
      .finally(() => setLoadingConsumos(false));
  };

  const handleSelectHospede = (bookingId: string) => {
    setSelectedBookingId(bookingId);
    fetchConsumos(bookingId);
  };

  const handleAddConsumo = async (produtoId: string) => {
    if (!selectedBookingId || adding) return;
    const produto = produtos.find(p => p.id === produtoId);
    if (!produto) {
      showToast("Produto não encontrado no catálogo desta pousada.", "error");
      return;
    }
    setAdding(true);
    try {
      const res = await adminFetch(`/api/pousadas/${pousadaId}/bookings/${selectedBookingId}/consumos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ produtoId, quantity: Number(quantity) || 1 }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        showToast(body.error || "Erro ao registrar consumo.", "error");
        return;
      }
      showToast(`${produto.name} adicionado.`, "success");
      setQuantity("1");
      setManualProdutoId("");
      fetchConsumos(selectedBookingId);
    } finally {
      setAdding(false);
    }
  };

  const handleScan = (produtoId: string) => {
    setShowScanner(false);
    handleAddConsumo(produtoId);
  };

  const handleRemove = async (consumoId: string) => {
    if (!selectedBookingId) return;
    await adminFetch(`/api/pousadas/${pousadaId}/bookings/${selectedBookingId}/consumos/${consumoId}`, { method: "DELETE" });
    fetchConsumos(selectedBookingId);
  };

  const handleMarkPaid = async () => {
    if (!selectedBookingId) return;
    await adminFetch(`/api/pousadas/${pousadaId}/bookings/${selectedBookingId}/consumos/marcar-pago`, { method: "POST" });
    showToast("Consumo marcado como pago.", "success");
    fetchConsumos(selectedBookingId);
  };

  const handleChargeStripe = async () => {
    if (!selectedBookingId || charging) return;
    setCharging(true);
    try {
      const res = await adminFetch(`/api/pousadas/${pousadaId}/bookings/${selectedBookingId}/consumos/cobrar`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        showToast(data.error || "Erro ao gerar cobrança.", "error");
        return;
      }
      window.open(data.url, "_blank");
    } finally {
      setCharging(false);
    }
  };

  const pendente = consumos.filter(c => c.status === "pendente");
  const totalPendente = pendente.reduce((sum, c) => sum + c.totalPrice, 0);
  const selectedHospede = hospedes.find(h => h.id === selectedBookingId);

  return (
    <div className="bg-white border border-editorial-border rounded-lg p-6 space-y-6">
      <div>
        <h3 className="font-bold text-sm text-editorial-text flex items-center gap-2 mb-1">
          <ShoppingBag className="h-4 w-4 text-editorial-primary" /> Consumo dos Hóspedes
        </h3>
        <p className="text-editorial-muted text-xs">O que cada hóspede consumiu durante a estadia — escaneie o QR do produto ou adicione manualmente.</p>
      </div>

      {loading ? (
        <div className="flex justify-center py-6"><LoaderCircle className="h-5 w-5 text-editorial-primary animate-spin" /></div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="md:col-span-1 space-y-1.5 max-h-96 overflow-y-auto">
            {hospedes.map(h => (
              <button
                key={h.id}
                onClick={() => handleSelectHospede(h.id)}
                className={`w-full text-left border rounded-md p-2.5 text-xs transition cursor-pointer ${selectedBookingId === h.id ? "border-editorial-primary bg-editorial-primary/5" : "border-editorial-border hover:bg-editorial-secondary"}`}
              >
                <p className="font-semibold text-editorial-text truncate">{h.customerName}</p>
                <p className="text-editorial-muted text-[10px]">{h.checkIn} até {h.checkOut}</p>
              </button>
            ))}
            {hospedes.length === 0 && <p className="text-editorial-muted text-xs italic">Nenhum hóspede com reserva ativa no momento.</p>}
          </div>

          <div className="md:col-span-2">
            {!selectedBookingId ? (
              <p className="text-editorial-muted text-xs italic py-6 text-center">Selecione um hóspede pra ver/lançar o consumo.</p>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <h4 className="text-sm font-bold text-editorial-text">{selectedHospede?.customerName}</h4>
                  <button
                    onClick={() => setShowScanner(true)}
                    className="flex items-center gap-1.5 bg-editorial-primary text-white text-[10px] uppercase tracking-widest font-bold px-3 py-1.5 rounded-md cursor-pointer"
                  >
                    <QrCode className="h-3.5 w-3.5" /> Escanear Produto
                  </button>
                </div>

                <div className="flex gap-2">
                  <select
                    value={manualProdutoId} onChange={e => setManualProdutoId(e.target.value)}
                    className="flex-1 border border-editorial-border rounded-md p-2 text-xs focus:outline-none focus:ring-1 focus:ring-editorial-primary"
                  >
                    <option value="">Selecione um produto...</option>
                    {produtos.map(p => <option key={p.id} value={p.id}>{p.name} — R$ {p.price.toLocaleString('pt-BR')}</option>)}
                  </select>
                  <input
                    type="number" min={1} value={quantity} onChange={e => setQuantity(e.target.value)}
                    className="w-16 border border-editorial-border rounded-md p-2 text-xs focus:outline-none focus:ring-1 focus:ring-editorial-primary"
                  />
                  <button
                    onClick={() => manualProdutoId && handleAddConsumo(manualProdutoId)}
                    disabled={!manualProdutoId || adding}
                    className="bg-editorial-secondary border border-editorial-border text-editorial-text text-xs font-bold px-3 py-2 rounded-md disabled:opacity-60 cursor-pointer flex items-center gap-1"
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </button>
                </div>

                {loadingConsumos ? (
                  <div className="flex justify-center py-4"><LoaderCircle className="h-4 w-4 text-editorial-primary animate-spin" /></div>
                ) : (
                  <div className="space-y-1.5">
                    {consumos.map(c => (
                      <div key={c.id} className="flex items-center justify-between gap-2 text-xs border-b border-editorial-border pb-1.5">
                        <span className={c.status === "pago" ? "text-editorial-muted line-through" : "text-editorial-text"}>
                          {c.quantity}x {c.produtoName} — R$ {c.totalPrice.toLocaleString('pt-BR')}
                        </span>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          {c.status === "pago" ? (
                            <span className="text-emerald-700 text-[9px] uppercase font-bold flex items-center gap-1"><Check className="h-3 w-3" /> Pago</span>
                          ) : (
                            <button onClick={() => handleRemove(c.id)} className="text-editorial-muted hover:text-red-600 cursor-pointer"><Trash2 className="h-3 w-3" /></button>
                          )}
                        </div>
                      </div>
                    ))}
                    {consumos.length === 0 && <p className="text-editorial-muted text-xs italic">Nenhum consumo registrado ainda.</p>}
                  </div>
                )}

                {pendente.length > 0 && (
                  <div className="bg-editorial-secondary/40 border border-editorial-border rounded-md p-3 flex items-center justify-between flex-wrap gap-2">
                    <span className="text-xs font-bold text-editorial-text">Pendente: R$ {totalPendente.toLocaleString('pt-BR')}</span>
                    <div className="flex items-center gap-2">
                      <button onClick={handleMarkPaid} className="text-[10px] uppercase tracking-widest font-bold border border-editorial-border px-3 py-1.5 rounded-md hover:bg-white transition cursor-pointer">
                        Marcar como Pago
                      </button>
                      <button
                        onClick={handleChargeStripe}
                        disabled={charging}
                        className="flex items-center gap-1.5 bg-editorial-primary text-white text-[10px] uppercase tracking-widest font-bold px-3 py-1.5 rounded-md disabled:opacity-60 cursor-pointer"
                      >
                        <CreditCard className="h-3 w-3" /> {charging ? "Gerando..." : "Cobrar (Stripe)"}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {showScanner && <QrProductScanner onScan={handleScan} onClose={() => setShowScanner(false)} />}
    </div>
  );
}
