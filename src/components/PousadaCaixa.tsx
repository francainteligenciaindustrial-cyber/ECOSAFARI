import React, { useEffect, useMemo, useState } from "react";
import { LoaderCircle, QrCode, Plus, Minus, Trash2, Banknote, CreditCard, Smartphone, UserRound, Receipt } from "lucide-react";
import { Produto } from "../types";
import { adminFetch } from "../lib/adminFetch";
import { useToast } from "../lib/ToastProvider";
import QrProductScanner from "./QrProductScanner";

interface Hospede {
  id: string;
  customerName: string;
  checkIn: string;
  checkOut: string;
}

interface Venda {
  id: string;
  total: number;
  paymentMethod: string;
  customerName?: string | null;
  createdAt: string;
  items: { name: string; quantity: number; totalPrice: number }[];
}

const METHODS: { id: string; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: "dinheiro", label: "Dinheiro", icon: Banknote },
  { id: "pix", label: "Pix", icon: Smartphone },
  { id: "cartao_credito", label: "Crédito", icon: CreditCard },
  { id: "cartao_debito", label: "Débito", icon: CreditCard },
  { id: "outro", label: "Outro", icon: Receipt },
];
const METHOD_LABEL = Object.fromEntries(METHODS.map(m => [m.id, m.label]));
const brl = (v: number) => `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// Caixa de atendimento: monta a venda com os produtos do catálogo (QR ou
// lista), e fecha lançando na conta do hóspede ou recebendo na hora.
// Os preços são recalculados no servidor — o carrinho aqui é só a tela.
export default function PousadaCaixa({ pousadaId }: { pousadaId: string }) {
  const { showToast } = useToast();
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [hospedes, setHospedes] = useState<Hospede[]>([]);
  const [loading, setLoading] = useState(true);
  const [cart, setCart] = useState<Record<string, number>>({});
  const [search, setSearch] = useState("");
  const [showScanner, setShowScanner] = useState(false);
  const [destino, setDestino] = useState<"pagamento" | "conta_hospede">("pagamento");
  const [paymentMethod, setPaymentMethod] = useState("pix");
  const [bookingId, setBookingId] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [vendas, setVendas] = useState<{ vendas: Venda[]; totals: Record<string, number>; total: number } | null>(null);
  const [vendasError, setVendasError] = useState("");

  const fetchVendas = () => {
    adminFetch(`/api/pousadas/${pousadaId}/vendas`)
      .then(async res => {
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body.error || "Erro ao carregar as vendas do dia.");
        setVendas(body);
        setVendasError("");
      })
      .catch(err => setVendasError(err.message));
  };

  useEffect(() => {
    setLoading(true);
    Promise.all([
      adminFetch(`/api/pousadas/${pousadaId}/produtos`).then(r => (r.ok ? r.json() : [])),
      adminFetch(`/api/pousadas/${pousadaId}/hospedes-ativos`).then(r => (r.ok ? r.json() : [])),
    ])
      .then(([p, h]) => {
        setProdutos((Array.isArray(p) ? p : []).filter((x: Produto) => x.active));
        setHospedes(Array.isArray(h) ? h : []);
      })
      .finally(() => setLoading(false));
    fetchVendas();
  }, [pousadaId]);

  const byId = useMemo(() => new Map(produtos.map(p => [p.id, p])), [produtos]);
  const cartItems = Object.entries(cart).filter(([id, q]) => q > 0 && byId.has(id)).map(([id, q]) => ({ produto: byId.get(id)!, quantity: q }));
  const total = cartItems.reduce((sum, i) => sum + i.produto.price * i.quantity, 0);
  const filtered = produtos.filter(p => p.name.toLowerCase().includes(search.trim().toLowerCase()));

  const add = (id: string, delta = 1) => setCart(c => ({ ...c, [id]: Math.max(0, Math.min(999, (c[id] || 0) + delta)) }));

  const handleScan = (produtoId: string) => {
    setShowScanner(false);
    if (!byId.has(produtoId)) {
      showToast("Esse QR não é de um produto ativo desta pousada.", "error");
      return;
    }
    add(produtoId);
    showToast(`${byId.get(produtoId)!.name} adicionado.`, "success");
  };

  const finalizar = async () => {
    if (cartItems.length === 0 || submitting) return;
    if (destino === "conta_hospede" && !bookingId) {
      showToast("Escolha o hóspede.", "error");
      return;
    }
    setSubmitting(true);
    try {
      const res = await adminFetch(`/api/pousadas/${pousadaId}/vendas`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: cartItems.map(i => ({ produtoId: i.produto.id, quantity: i.quantity })),
          destino,
          paymentMethod,
          bookingId: destino === "conta_hospede" ? bookingId : undefined,
          customerName: destino === "pagamento" ? customerName : undefined,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        showToast(body.error || "Erro ao registrar a venda.", "error");
        return;
      }
      showToast(
        destino === "conta_hospede"
          ? `${brl(body.total)} lançado na conta de ${body.customerName}.`
          : `Venda de ${brl(body.total)} registrada (${METHOD_LABEL[paymentMethod]}).`,
        "success"
      );
      setCart({});
      setCustomerName("");
      fetchVendas();
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <div className="flex justify-center py-16"><LoaderCircle className="h-6 w-6 text-editorial-primary animate-spin" /></div>;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 xl:grid-cols-5 gap-6 items-start">
        <section className="xl:col-span-3 bg-white border border-editorial-border rounded-lg p-5 space-y-4">
          <div className="flex items-center gap-2">
            <input
              type="search" value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar produto..." aria-label="Buscar produto"
              className="flex-1 border border-editorial-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-editorial-primary"
            />
            <button type="button" onClick={() => setShowScanner(true)} className="flex items-center gap-1.5 bg-editorial-primary text-white text-[11px] uppercase tracking-widest font-bold px-3 py-2.5 rounded-md cursor-pointer">
              <QrCode className="h-4 w-4" /> Escanear
            </button>
          </div>
          {produtos.length === 0 ? (
            <p className="text-editorial-muted text-xs">Nenhum produto ativo. Cadastre os produtos na aba "Produtos" — cada um ganha um QR code.</p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-[420px] overflow-y-auto pr-1">
              {filtered.map(p => (
                <button key={p.id} type="button" onClick={() => add(p.id)} className="text-left border border-editorial-border rounded-md p-3 hover:border-editorial-primary hover:bg-editorial-secondary/50 transition cursor-pointer">
                  <span className="block text-xs font-semibold leading-tight">{p.name}</span>
                  <span className="block text-[11px] text-editorial-primary font-bold mt-1">{brl(p.price)}</span>
                  {cart[p.id] > 0 && <span className="inline-block mt-1 text-[10px] bg-arara-yellow text-arara-black font-bold px-1.5 rounded">{cart[p.id]} no carrinho</span>}
                </button>
              ))}
            </div>
          )}
        </section>

        <section className="xl:col-span-2 bg-white border border-editorial-border rounded-lg p-5 space-y-4 xl:sticky xl:top-6">
          <h3 className="text-[10px] uppercase tracking-[0.15em] font-bold text-editorial-primary">Venda atual</h3>
          {cartItems.length === 0 ? (
            <p className="text-editorial-muted text-xs">Toque nos produtos ou escaneie o QR para adicionar.</p>
          ) : (
            <ul className="divide-y divide-editorial-border">
              {cartItems.map(({ produto, quantity }) => (
                <li key={produto.id} className="flex items-center justify-between gap-2 py-2 text-xs">
                  <span className="flex-1 min-w-0 truncate">{produto.name}</span>
                  <div className="flex items-center gap-1">
                    <button type="button" aria-label={`Diminuir ${produto.name}`} onClick={() => add(produto.id, -1)} className="p-1 rounded border border-editorial-border cursor-pointer"><Minus className="h-3 w-3" /></button>
                    <span className="w-6 text-center font-semibold">{quantity}</span>
                    <button type="button" aria-label={`Aumentar ${produto.name}`} onClick={() => add(produto.id, 1)} className="p-1 rounded border border-editorial-border cursor-pointer"><Plus className="h-3 w-3" /></button>
                  </div>
                  <span className="w-20 text-right font-semibold">{brl(produto.price * quantity)}</span>
                  <button type="button" aria-label={`Remover ${produto.name}`} onClick={() => setCart(c => ({ ...c, [produto.id]: 0 }))} className="text-editorial-muted hover:text-red-600 cursor-pointer"><Trash2 className="h-3.5 w-3.5" /></button>
                </li>
              ))}
            </ul>
          )}
          <div className="flex justify-between items-baseline border-t border-editorial-border pt-3">
            <span className="text-xs uppercase tracking-widest font-bold">Total</span>
            <span className="font-serif text-2xl font-bold text-editorial-primary">{brl(total)}</span>
          </div>

          <div className="grid grid-cols-2 gap-2 text-[11px] uppercase tracking-widest font-bold" role="radiogroup" aria-label="Como fechar a venda">
            <button type="button" role="radio" aria-checked={destino === "pagamento"} onClick={() => setDestino("pagamento")} className={`py-2 rounded-md border cursor-pointer ${destino === "pagamento" ? "bg-editorial-primary text-white border-editorial-primary" : "border-editorial-border"}`}>Pagar agora</button>
            <button type="button" role="radio" aria-checked={destino === "conta_hospede"} onClick={() => setDestino("conta_hospede")} className={`py-2 rounded-md border cursor-pointer ${destino === "conta_hospede" ? "bg-editorial-primary text-white border-editorial-primary" : "border-editorial-border"}`}>Conta do hóspede</button>
          </div>

          {destino === "pagamento" ? (
            <>
              <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Forma de pagamento">
                {METHODS.map(m => {
                  const Icon = m.icon;
                  const active = paymentMethod === m.id;
                  return (
                    <button key={m.id} type="button" role="radio" aria-checked={active} onClick={() => setPaymentMethod(m.id)} className={`flex flex-col items-center gap-1 py-2 rounded-md border text-[10px] font-bold uppercase tracking-wider cursor-pointer ${active ? "border-editorial-primary bg-editorial-secondary text-editorial-primary" : "border-editorial-border text-editorial-muted"}`}>
                      <Icon className="h-4 w-4" /> {m.label}
                    </button>
                  );
                })}
              </div>
              <input type="text" maxLength={120} value={customerName} onChange={e => setCustomerName(e.target.value)} placeholder="Nome do cliente (opcional)" aria-label="Nome do cliente" className="w-full border border-editorial-border rounded-md px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-editorial-primary" />
            </>
          ) : (
            <select value={bookingId} onChange={e => setBookingId(e.target.value)} aria-label="Hóspede" className="w-full border border-editorial-border rounded-md px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-editorial-primary">
              <option value="">Escolha o hóspede...</option>
              {hospedes.map(h => <option key={h.id} value={h.id}>{h.customerName} ({h.checkIn} a {h.checkOut})</option>)}
            </select>
          )}

          <button type="button" onClick={finalizar} disabled={cartItems.length === 0 || submitting} className="w-full bg-arara-yellow text-arara-black hover:bg-arara-orange text-[11px] uppercase tracking-widest font-bold py-3 rounded-md disabled:opacity-50 cursor-pointer flex items-center justify-center gap-2">
            {submitting ? <LoaderCircle className="h-4 w-4 animate-spin" /> : destino === "conta_hospede" ? <UserRound className="h-4 w-4" /> : <Receipt className="h-4 w-4" />}
            {destino === "conta_hospede" ? "Lançar na conta" : "Registrar pagamento"}
          </button>
          <p className="text-[10px] text-editorial-muted">Cartão e Pix aqui registram o que foi recebido na maquininha ou na chave Pix da pousada. Não é emitida nota fiscal automaticamente.</p>
        </section>
      </div>

      <section className="bg-white border border-editorial-border rounded-lg p-5">
        <h3 className="text-[10px] uppercase tracking-[0.15em] font-bold text-editorial-primary mb-3">Fechamento de hoje (vendas pagas na hora)</h3>
        {vendasError ? (
          <p className="bg-amber-50 border border-amber-200 text-amber-900 text-xs px-3 py-2 rounded-md">{vendasError}</p>
        ) : !vendas ? (
          <LoaderCircle className="h-4 w-4 text-editorial-primary animate-spin" />
        ) : (
          <>
            <div className="flex flex-wrap gap-3 mb-4">
              {METHODS.filter(m => vendas.totals[m.id]).map(m => (
                <div key={m.id} className="border border-editorial-border rounded-md px-3 py-2 text-xs">
                  <span className="block text-editorial-muted text-[10px] uppercase tracking-widest font-bold">{m.label}</span>
                  <span className="font-semibold">{brl(vendas.totals[m.id])}</span>
                </div>
              ))}
              <div className="border border-editorial-primary rounded-md px-3 py-2 text-xs">
                <span className="block text-editorial-primary text-[10px] uppercase tracking-widest font-bold">Total do dia</span>
                <span className="font-bold">{brl(vendas.total)}</span>
              </div>
            </div>
            {vendas.vendas.length === 0 ? (
              <p className="text-editorial-muted text-xs">Nenhuma venda paga registrada hoje.</p>
            ) : (
              <ul className="divide-y divide-editorial-border text-xs">
                {vendas.vendas.map(v => (
                  <li key={v.id} className="py-2 flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-semibold">{new Date(v.createdAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })} · {METHOD_LABEL[v.paymentMethod] || v.paymentMethod}{v.customerName ? ` · ${v.customerName}` : ""}</p>
                      <p className="text-editorial-muted truncate">{v.items.map(i => `${i.quantity}× ${i.name}`).join(", ")}</p>
                    </div>
                    <span className="font-semibold whitespace-nowrap">{brl(Number(v.total))}</span>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </section>

      {showScanner && <QrProductScanner onScan={handleScan} onClose={() => setShowScanner(false)} />}
    </div>
  );
}
