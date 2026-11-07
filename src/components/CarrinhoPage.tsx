import React, { useEffect, useMemo, useRef, useState } from "react";
import { ShoppingBag, Trash2, LoaderCircle, CalendarDays, Users, BedDouble, CreditCard, ShieldCheck, Clock, AlertTriangle, Package, Tag } from "lucide-react";
import InfoPageLayout from "./InfoPageLayout";
import TuristaAuthPanel from "./TuristaAuthPanel";
import { useTouristSession } from "../lib/useTouristSession";
import { adminFetch } from "../lib/adminFetch";
import { navigate } from "../lib/router";
import { RETURN_TO_KEY } from "../lib/returnTo";
import { useCart, writeCart, readCart, updateCartItem, removeFromCart, toBookingRequest, type CartItem } from "../lib/cart";
import type { Pousada } from "../types";

interface Cotacao { ok: boolean; total?: number; error?: string; suggestions?: { checkIn: string; checkOut: string; note: string }[] }

const money = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const addDays = (iso: string, d: number) => new Date(Date.parse(iso) + d * 86400000).toISOString().slice(0, 10);
const fmt = (iso: string) => iso.split("-").reverse().join("/");
const tomorrow = () => addDays(new Date().toISOString().slice(0, 10), 1);
const field = "border border-editorial-border bg-white rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-editorial-primary";
const label = "block text-[10px] uppercase tracking-widest font-bold text-editorial-muted mb-1";

// /carrinho — várias estadias/pacotes num pagamento só. Preço e vaga de
// cada item vêm do servidor (POST /api/carrinho/cotar); no pagamento cada
// item vira uma reserva própria, e a vaga fica segurada ~30 min.
export default function CarrinhoPage() {
  const items = useCart();
  const { isTourist, checking } = useTouristSession();
  const [pousadas, setPousadas] = useState<Record<string, Pousada>>({});
  const [cotacoes, setCotacoes] = useState<Cotacao[] | null>(null);
  const [cotando, setCotando] = useState(false);
  const [aceite, setAceite] = useState(false);
  const [pagando, setPagando] = useState(false);
  const [erro, setErro] = useState("");
  const [itemComErro, setItemComErro] = useState<number | null>(null);
  const [pedirLogin, setPedirLogin] = useState(false);
  const params = useMemo(() => new URLSearchParams(window.location.search), []);
  const cancelado = params.get("pagamento") === "cancelado";
  const ignorados = Number(params.get("ignorados") || 0);

  // Dados das pousadas (quartos, foto) para editar cada item.
  useEffect(() => {
    const faltam = Array.from(new Set(items.map(i => i.pousadaId))).filter(id => !pousadas[id]);
    faltam.forEach(id =>
      fetch(`/api/pousadas/${encodeURIComponent(id)}`)
        .then(r => (r.ok ? r.json() : null))
        .then((p: Pousada | null) => p && setPousadas(prev => ({ ...prev, [id]: p })))
        .catch(() => {})
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items]);

  // Cotação ao vivo, com um pequeno atraso enquanto a pessoa edita.
  const seq = useRef(0);
  useEffect(() => {
    if (items.length === 0) { setCotacoes([]); return; }
    const my = ++seq.current;
    setCotando(true);
    const t = setTimeout(() => {
      fetch("/api/carrinho/cotar", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ items: items.map(toBookingRequest) }) })
        .then(r => r.json())
        .then(body => { if (my === seq.current) setCotacoes(body.items || []); })
        .catch(() => { if (my === seq.current) setCotacoes(null); })
        .finally(() => { if (my === seq.current) setCotando(false); });
    }, 350);
    return () => clearTimeout(t);
  }, [items]);

  const edit = (key: string, patch: Partial<CartItem>) => { setErro(""); setItemComErro(null); writeCart(updateCartItem(readCart(), key, patch)); };
  const remove = (key: string) => { setErro(""); setItemComErro(null); writeCart(removeFromCart(readCart(), key)); };

  const total = (cotacoes || []).reduce((acc, c) => acc + (c.ok ? c.total || 0 : 0), 0);
  const algumErro = (cotacoes || []).some(c => !c.ok);
  const pronto = !!cotacoes && cotacoes.length === items.length && !algumErro && !cotando;

  const pagar = async () => {
    setErro("");
    setItemComErro(null);
    if (!isTourist) {
      try { localStorage.setItem(RETURN_TO_KEY, "/carrinho"); } catch { /* sem storage */ }
      setPedirLogin(true);
      return;
    }
    if (!aceite) return setErro("Aceite os termos e a política de cancelamento para continuar.");
    setPagando(true);
    try {
      const r = await adminFetch("/api/turista/carrinho/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: items.map(toBookingRequest), acceptedTerms: true }),
      });
      const body = await r.json().catch(() => ({}));
      if (!r.ok) {
        setErro(body.error || "Não foi possível abrir o pagamento.");
        if (typeof body.itemIndex === "number") setItemComErro(body.itemIndex);
        return;
      }
      if (typeof body.url === "string" && body.url.startsWith("https://checkout.stripe.com/")) window.location.assign(body.url);
      else setErro("Não foi possível abrir o pagamento.");
    } catch {
      setErro("Sem conexão. Tente de novo.");
    } finally {
      setPagando(false);
    }
  };

  return (
    <InfoPageLayout kicker="Sua viagem" title="Carrinho">
      {cancelado && (
        <p className="mb-5 bg-amber-50 border border-amber-200 text-amber-900 text-sm rounded-xl px-4 py-3">
          O pagamento não foi concluído. Seus itens continuam aqui — é só tentar de novo.
        </p>
      )}
      {ignorados > 0 && (
        <p className="mb-5 bg-editorial-secondary border border-editorial-border text-sm rounded-xl px-4 py-3">
          {ignorados} item(ns) da lista são guias ou atrações — esses são combinados direto pela conversa com o guia ou pelo WhatsApp da equipe, e não entram no pagamento online.
        </p>
      )}

      {items.length === 0 ? (
        <div className="text-center py-14 bg-white border border-editorial-border rounded-2xl">
          <ShoppingBag className="h-10 w-10 mx-auto text-editorial-muted mb-3" />
          <p className="font-semibold text-editorial-text mb-1">Seu carrinho está vazio</p>
          <p className="text-sm text-editorial-muted mb-6">Na página de reserva de uma pousada, use "Adicionar ao carrinho" para juntar várias estadias e pagar tudo de uma vez.</p>
          <div className="flex flex-wrap justify-center gap-3">
            <button type="button" onClick={() => navigate("/")} className="bg-editorial-primary text-white text-xs uppercase tracking-widest font-bold px-5 py-2.5 rounded-full cursor-pointer">Ver pousadas</button>
            <button type="button" onClick={() => navigate("/turista/listas")} className="border border-editorial-border text-xs uppercase tracking-widest font-bold px-5 py-2.5 rounded-full cursor-pointer">Minha lista de desejos</button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
          <ul className="lg:col-span-2 space-y-4">
            {items.map((item, idx) => {
              const p = pousadas[item.pousadaId];
              const c = cotacoes?.[idx];
              const rooms = p?.rooms || [];
              const img = item.image || p?.images?.[0];
              const destaque = itemComErro === idx || (c && !c.ok);
              return (
                <li key={item.key} className={`bg-white border rounded-2xl p-4 ${destaque ? "border-amber-300" : "border-editorial-border"}`}>
                  <div className="flex gap-4">
                    {img && <img src={img} alt="" onError={e => { e.currentTarget.style.display = "none"; }} className="h-20 w-24 object-cover rounded-xl flex-shrink-0 bg-editorial-secondary" />}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-semibold text-editorial-text truncate">{item.pousadaName}</p>
                          {item.pacoteName && <p className="text-xs text-editorial-accent flex items-center gap-1"><Package className="h-3.5 w-3.5" /> {item.pacoteName}</p>}
                          {!item.pacoteName && item.experienceTypes && item.experienceTypes.length > 0 && <p className="text-xs text-editorial-muted truncate">{item.experienceTypes.join(" + ")}</p>}
                        </div>
                        <button type="button" onClick={() => remove(item.key)} aria-label={`Remover ${item.pousadaName} do carrinho`} className="text-editorial-muted hover:text-red-600 cursor-pointer p-1">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3 mt-4">
                    <label className="block">
                      <span className={label}><CalendarDays className="inline h-3 w-3" /> Check-in</span>
                      <input type="date" min={tomorrow()} value={item.checkIn} className={`${field} w-full`}
                        onChange={e => {
                          const ci = e.target.value;
                          if (!ci) return;
                          const noites = item.pacoteNights || Math.max(1, Math.round((Date.parse(item.checkOut) - Date.parse(item.checkIn)) / 86400000));
                          edit(item.key, { checkIn: ci, checkOut: item.pacoteNights || item.checkOut <= ci ? addDays(ci, noites) : item.checkOut });
                        }} />
                    </label>
                    <label className="block">
                      <span className={label}>Check-out</span>
                      <input type="date" min={addDays(item.checkIn, 1)} value={item.checkOut} disabled={!!item.pacoteNights} className={`${field} w-full disabled:bg-editorial-secondary`}
                        onChange={e => e.target.value && edit(item.key, { checkOut: e.target.value })} />
                    </label>
                    <label className="block">
                      <span className={label}><Users className="inline h-3 w-3" /> Adultos</span>
                      <select value={item.adults} onChange={e => edit(item.key, { adults: Number(e.target.value) })} className={`${field} w-full`}>
                        {Array.from({ length: 12 }, (_, n) => n + 1).map(n => <option key={n} value={n}>{n}</option>)}
                      </select>
                    </label>
                    <label className="block">
                      <span className={label}>Crianças</span>
                      <select value={item.children} onChange={e => edit(item.key, { children: Number(e.target.value) })} className={`${field} w-full`}>
                        {Array.from({ length: 9 }, (_, n) => n).map(n => <option key={n} value={n}>{n}</option>)}
                      </select>
                    </label>
                    {rooms.length > 0 && (
                      <label className="block col-span-2">
                        <span className={label}><BedDouble className="inline h-3 w-3" /> Quarto</span>
                        <select value={item.roomType || ""} onChange={e => edit(item.key, { roomType: e.target.value || undefined })} className={`${field} w-full`}>
                          <option value="">Escolha o quarto…</option>
                          {rooms.map(r => <option key={r.type} value={r.type}>{r.type} (até {r.capacity} pessoas)</option>)}
                        </select>
                      </label>
                    )}
                  </div>

                  <div className="mt-3 flex items-center justify-between gap-3 text-sm">
                    <span className="text-editorial-muted text-xs">{fmt(item.checkIn)} a {fmt(item.checkOut)}</span>
                    {!c || cotando ? (
                      <LoaderCircle className="h-4 w-4 animate-spin text-editorial-muted" />
                    ) : c.ok ? (
                      <span className="font-semibold text-editorial-text">{money(c.total || 0)}</span>
                    ) : null}
                  </div>
                  {c && !c.ok && !cotando && (
                    <div role="alert" className="mt-2 bg-amber-50 border border-amber-200 text-amber-900 text-xs rounded-xl px-3 py-2 space-y-1">
                      <p className="flex items-start gap-1.5"><AlertTriangle className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" /> {c.error}</p>
                      {(c.suggestions || []).map(s => (
                        <button key={s.checkIn} type="button" onClick={() => edit(item.key, { checkIn: s.checkIn, checkOut: s.checkOut })} className="block underline font-semibold cursor-pointer">
                          Tentar {fmt(s.checkIn)} a {fmt(s.checkOut)}
                        </button>
                      ))}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>

          <aside className="bg-white border border-editorial-border rounded-2xl p-5 space-y-4 lg:sticky lg:top-6">
            <div>
              <p className="text-[10px] uppercase tracking-widest font-bold text-editorial-muted">{items.length} reserva(s)</p>
              <div className="flex items-baseline justify-between gap-3 mt-1 flex-wrap">
                <span className="text-sm">Total</span>
                <span className="font-serif text-2xl font-bold text-editorial-primary">{cotacoes ? money(total) : "—"}</span>
              </div>
            </div>
            <ul className="text-xs text-editorial-muted space-y-1.5">
              <li className="flex gap-1.5"><CreditCard className="h-3.5 w-3.5 flex-shrink-0" /> Um pagamento só: cartão (com parcelamento) ou Pix, conforme ativado na Stripe.</li>
              <li className="flex gap-1.5"><Clock className="h-3.5 w-3.5 flex-shrink-0" /> Ao abrir o pagamento, as vagas ficam seguradas por 30 minutos.</li>
              <li className="flex gap-1.5"><ShieldCheck className="h-3.5 w-3.5 flex-shrink-0" /> Cada item vira uma reserva separada, com voucher próprio, e pode ser cancelado sem afetar os outros.</li>
              <li className="flex gap-1.5"><Tag className="h-3.5 w-3.5 flex-shrink-0" /> Tem cupom? Ele vale na reserva individual da pousada.</li>
            </ul>
            {pedirLogin && !isTourist && !checking ? (
              <div className="border-t border-editorial-border pt-4">
                <p className="text-sm font-semibold mb-2">Entre ou crie sua conta para pagar</p>
                <TuristaAuthPanel />
              </div>
            ) : (
              <>
                <label className="flex items-start gap-2 text-xs cursor-pointer">
                  <input type="checkbox" checked={aceite} onChange={e => setAceite(e.target.checked)} className="accent-editorial-primary h-4 w-4 mt-0.5" />
                  <span>Li e aceito os <a href="/termos" target="_blank" rel="noopener noreferrer" className="text-editorial-primary font-semibold underline">termos e a política de cancelamento</a>.</span>
                </label>
                {erro && <p role="alert" className="bg-red-50 border border-red-200 text-red-700 text-xs px-3 py-2 rounded-xl">{erro}{itemComErro !== null && items[itemComErro] ? ` (${items[itemComErro].pousadaName})` : ""}</p>}
                {algumErro && !cotando && <p className="text-xs text-amber-800">Ajuste ou remova os itens marcados para continuar.</p>}
                <button type="button" onClick={pagar} disabled={!pronto || pagando} className="w-full bg-editorial-primary text-white text-[11px] uppercase tracking-widest font-bold py-3 rounded-full hover:opacity-90 transition disabled:opacity-50 cursor-pointer flex items-center justify-center gap-2">
                  {pagando ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <CreditCard className="h-4 w-4" />} Pagar tudo {cotacoes && pronto ? money(total) : ""}
                </button>
              </>
            )}
          </aside>
        </div>
      )}
    </InfoPageLayout>
  );
}
