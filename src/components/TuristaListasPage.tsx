import React, { useEffect, useState } from "react";
import { Heart, LoaderCircle, Share2, Sparkles, Trash2, Bell, BellOff, Plus, Copy, Check, CalendarDays, X, MessageSquare } from "lucide-react";
import InfoPageLayout from "./InfoPageLayout";
import { useTouristSession } from "../lib/useTouristSession";
import { adminFetch } from "../lib/adminFetch";
import { navigate } from "../lib/router";
import { RETURN_TO_KEY } from "../lib/returnTo";
import WishlistItemCard, { WishItem } from "./WishlistItemCard";
import { addToCart, readCart, writeCart } from "../lib/cart";
import { ShoppingBag } from "lucide-react";

const AGENCY_WHATSAPP = "5565999868334";

interface Lista {
  id: string;
  nome: string;
  checkIn: string | null;
  checkOut: string | null;
  alertas: boolean;
  shareToken: string | null;
  itens: WishItem[];
}

const inputClass = "border border-editorial-border bg-white rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-editorial-primary";

// /turista/listas — Lista de desejos: várias listas com nome e datas,
// pousadas/guias/atrações/pacotes, alertas por email, compartilhamento e
// "Montar roteiro com estes itens" pela assistente de IA.
export default function TuristaListasPage() {
  const { isTourist, checking } = useTouristSession();
  const [listas, setListas] = useState<Lista[] | null>(null);
  const [error, setError] = useState("");
  const [novaNome, setNovaNome] = useState("");
  const [creating, setCreating] = useState(false);
  const [shareFor, setShareFor] = useState<{ id: string; url: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [roteiro, setRoteiro] = useState<{ lista: Lista; texto: string | null; erro?: string } | null>(null);

  const load = () =>
    adminFetch("/api/turista/listas")
      .then(async r => {
        const body = await r.json().catch(() => []);
        if (!r.ok) throw new Error(body.error || "Não foi possível carregar suas listas.");
        setListas(body);
      })
      .catch(err => setError(err.message));

  useEffect(() => {
    if (checking) return;
    if (!isTourist) {
      try { localStorage.setItem(RETURN_TO_KEY, "/turista/listas"); } catch { /* sem storage */ }
      return;
    }
    load();
  }, [checking, isTourist]);

  const update = async (id: string, patch: Partial<Lista>) => {
    setListas(ls => (ls || []).map(l => (l.id === id ? { ...l, ...patch } : l)));
    await adminFetch(`/api/turista/listas/${id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch) });
  };

  const criar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!novaNome.trim()) return;
    setCreating(true);
    try {
      const r = await adminFetch("/api/turista/listas", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ nome: novaNome.trim() }) });
      const body = await r.json().catch(() => ({}));
      if (!r.ok) return setError(body.error || "Não foi possível criar a lista.");
      setListas(ls => [...(ls || []), body]);
      setNovaNome("");
    } finally {
      setCreating(false);
    }
  };

  // Pousadas e pacotes da lista vão para o carrinho com as datas da lista
  // (ou daqui a um mês, se não houver) e 2 adultos — tudo editável lá.
  // Guias e atrações não têm pagamento online: ficam de fora, com aviso.
  const [reservando, setReservando] = useState<string | null>(null);
  const reservarTudo = async (l: Lista) => {
    setReservando(l.id);
    try {
      const hoje = new Date().toISOString().slice(0, 10);
      const plus = (iso: string, d: number) => new Date(Date.parse(iso) + d * 86400000).toISOString().slice(0, 10);
      const ci = l.checkIn && l.checkIn > hoje ? l.checkIn : plus(hoje, 30);
      const co = l.checkOut && l.checkOut > ci ? l.checkOut : plus(ci, 3);
      let list = readCart();
      let cheio = false;
      for (const it of l.itens) {
        if (it.tipo === "pousada") {
          const r = addToCart(list, { pousadaId: it.refId, pousadaName: it.nome, image: it.imagem, checkIn: ci, checkOut: co, adults: 2, children: 0 });
          cheio = cheio || r.full;
          list = r.list;
        } else if (it.tipo === "pacote") {
          const pk = await fetch(`/api/pacotes/${encodeURIComponent(it.refId)}`).then(r => (r.ok ? r.json() : null)).catch(() => null);
          if (!pk) continue;
          const r = addToCart(list, { pousadaId: pk.pousadaId, pousadaName: pk.pousadaName, image: pk.imageUrl || it.imagem, checkIn: ci, checkOut: plus(ci, pk.nights), adults: 2, children: 0, pacoteId: pk.id, pacoteName: pk.name, pacoteNights: pk.nights });
          cheio = cheio || r.full;
          list = r.list;
        }
      }
      writeCart(list);
      const ignorados = l.itens.filter(i => i.tipo === "guia" || i.tipo === "atracao").length;
      if (cheio) window.alert("O carrinho chegou ao limite de itens — alguns ficaram de fora.");
      navigate(`/carrinho${ignorados ? `?ignorados=${ignorados}` : ""}`);
    } finally {
      setReservando(null);
    }
  };

  const apagar = async (l: Lista) => {
    if (!window.confirm(`Apagar a lista "${l.nome}"?`)) return;
    setListas(ls => (ls || []).filter(x => x.id !== l.id));
    await adminFetch(`/api/turista/listas/${l.id}`, { method: "DELETE" });
  };

  const remover = async (l: Lista, item: WishItem) => {
    setListas(ls => (ls || []).map(x => (x.id === l.id ? { ...x, itens: x.itens.filter(i => i.id !== item.id) } : x)));
    await adminFetch(`/api/turista/listas/${l.id}/itens?tipo=${item.tipo}&refId=${encodeURIComponent(item.refId)}`, { method: "DELETE" });
  };

  const compartilhar = async (l: Lista) => {
    const r = await adminFetch(`/api/turista/listas/${l.id}/compartilhar`, { method: "POST" });
    const body = await r.json().catch(() => ({}));
    if (r.ok) {
      setShareFor({ id: l.id, url: body.url });
      setCopied(false);
    }
  };

  const pararCompartilhar = async (id: string) => {
    await adminFetch(`/api/turista/listas/${id}/compartilhar`, { method: "DELETE" });
    setShareFor(null);
  };

  const montarRoteiro = async (l: Lista) => {
    setRoteiro({ lista: l, texto: null });
    const r = await adminFetch(`/api/turista/listas/${l.id}/roteiro`, { method: "POST" });
    const body = await r.json().catch(() => ({}));
    setRoteiro({ lista: l, texto: r.ok ? body.roteiro : null, erro: r.ok ? undefined : body.error || "Não foi possível montar o roteiro." });
  };

  const fmt = (d: string | null) => (d ? new Date(`${d}T12:00:00`).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" }) : "");

  return (
    <InfoPageLayout kicker="Minha conta" title="Lista de desejos">
      {checking ? (
        <div className="flex justify-center py-16"><LoaderCircle className="h-6 w-6 animate-spin text-editorial-primary" /></div>
      ) : !isTourist ? (
        <div className="max-w-md mx-auto text-center bg-white border border-editorial-border rounded-3xl p-10">
          <Heart className="h-10 w-10 text-red-500 mx-auto mb-3" />
          <p className="text-sm text-editorial-muted mb-5">Entre na sua conta de turista para ver e montar suas listas de desejos.</p>
          <button type="button" onClick={() => navigate("/turista")} className="bg-editorial-primary text-white text-xs uppercase tracking-widest font-bold px-6 py-3 rounded-full cursor-pointer">Entrar ou criar conta</button>
        </div>
      ) : (
        <div className="space-y-8">
          {error && <p className="bg-amber-50 border border-amber-200 text-amber-900 text-sm rounded-2xl px-4 py-3">{error}</p>}

          <form onSubmit={criar} className="flex flex-col sm:flex-row gap-3 bg-white border border-editorial-border rounded-3xl p-4">
            <label htmlFor="nova-lista" className="sr-only">Nome da nova lista</label>
            <input id="nova-lista" value={novaNome} onChange={e => setNovaNome(e.target.value)} maxLength={80} placeholder='Nova lista — ex.: "Pantanal julho 2027", "Lua de mel"' className={`${inputClass} flex-1`} />
            <button type="submit" disabled={creating || !novaNome.trim()} className="inline-flex items-center justify-center gap-2 bg-editorial-primary text-white text-xs uppercase tracking-widest font-bold px-5 py-2.5 rounded-full disabled:opacity-50 cursor-pointer">
              {creating ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Criar lista
            </button>
          </form>

          {listas === null && !error && <div className="flex justify-center py-10"><LoaderCircle className="h-6 w-6 animate-spin text-editorial-primary" /></div>}
          {listas && listas.length === 0 && (
            <p className="text-center text-sm text-editorial-muted py-10">Você ainda não tem listas. Toque no ❤ de uma pousada, guia, atração ou pacote para começar.</p>
          )}

          {(listas || []).map(l => (
            <section key={l.id} className="bg-white border border-editorial-border rounded-3xl p-5 md:p-6 space-y-5">
              <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
                <div className="space-y-3 flex-1 min-w-0">
                  <label className="sr-only" htmlFor={`nome-${l.id}`}>Nome da lista</label>
                  <input
                    id={`nome-${l.id}`}
                    defaultValue={l.nome}
                    maxLength={80}
                    onBlur={e => e.target.value.trim() && e.target.value !== l.nome && update(l.id, { nome: e.target.value.trim() })}
                    className="w-full font-serif text-2xl font-semibold text-editorial-text bg-transparent border-b border-transparent hover:border-editorial-border focus:border-editorial-primary focus:outline-none"
                  />
                  <div className="flex flex-wrap items-center gap-3 text-sm">
                    <CalendarDays className="h-4 w-4 text-editorial-muted" />
                    <label className="sr-only" htmlFor={`ida-${l.id}`}>Ida</label>
                    <input id={`ida-${l.id}`} type="date" value={l.checkIn || ""} onChange={e => update(l.id, { checkIn: e.target.value || null })} className={inputClass} />
                    <span className="text-editorial-muted">até</span>
                    <label className="sr-only" htmlFor={`volta-${l.id}`}>Volta</label>
                    <input id={`volta-${l.id}`} type="date" min={l.checkIn || undefined} value={l.checkOut || ""} onChange={e => update(l.id, { checkOut: e.target.value || null })} className={inputClass} />
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={() => update(l.id, { alertas: !l.alertas })} aria-pressed={l.alertas} className="inline-flex items-center gap-1.5 border border-editorial-border text-xs font-semibold px-3 py-2 rounded-full hover:bg-editorial-secondary cursor-pointer" title="Avisos por email: vaga nas suas datas e começo da época de avistamento">
                    {l.alertas ? <Bell className="h-4 w-4 text-editorial-accent" /> : <BellOff className="h-4 w-4" />} {l.alertas ? "Alertas ligados" : "Alertas desligados"}
                  </button>
                  <button type="button" onClick={() => compartilhar(l)} className="inline-flex items-center gap-1.5 border border-editorial-border text-xs font-semibold px-3 py-2 rounded-full hover:bg-editorial-secondary cursor-pointer">
                    <Share2 className="h-4 w-4" /> Compartilhar com quem vai comigo
                  </button>
                  <button type="button" onClick={() => reservarTudo(l)} disabled={!l.itens.some(i => i.tipo === "pousada" || i.tipo === "pacote") || reservando === l.id} className="inline-flex items-center gap-1.5 bg-editorial-accent text-white text-xs font-semibold px-4 py-2 rounded-full hover:opacity-90 disabled:opacity-40 cursor-pointer">
                    {reservando === l.id ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <ShoppingBag className="h-4 w-4" />} Reservar tudo desta lista
                  </button>
                  <button type="button" onClick={() => montarRoteiro(l)} disabled={!l.itens.length} className="inline-flex items-center gap-1.5 bg-editorial-primary text-white text-xs font-semibold px-4 py-2 rounded-full hover:opacity-90 disabled:opacity-40 cursor-pointer">
                    <Sparkles className="h-4 w-4" /> Montar roteiro com estes itens
                  </button>
                  <button type="button" onClick={() => apagar(l)} aria-label={`Apagar a lista ${l.nome}`} className="w-9 h-9 rounded-full border border-editorial-border flex items-center justify-center text-editorial-muted hover:text-red-600 cursor-pointer">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {shareFor?.id === l.id && (
                <div className="bg-editorial-secondary rounded-2xl p-4 space-y-3">
                  <p className="text-sm text-editorial-text">Quem tiver este link vê a lista (sem editar):</p>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <input readOnly value={shareFor.url} onFocus={e => e.target.select()} aria-label="Link da lista" className={`${inputClass} flex-1 font-mono text-xs`} />
                    <button type="button" onClick={() => { navigator.clipboard.writeText(shareFor.url); setCopied(true); }} className="inline-flex items-center justify-center gap-1.5 bg-editorial-primary text-white text-xs font-semibold px-4 py-2 rounded-full cursor-pointer">
                      {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />} {copied ? "Copiado" : "Copiar"}
                    </button>
                    <a href={`https://wa.me/?text=${encodeURIComponent(`Olha a nossa lista de viagem "${l.nome}" no Ipantanal: ${shareFor.url}`)}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center justify-center gap-1.5 bg-emerald-600 text-white text-xs font-semibold px-4 py-2 rounded-full">
                      <MessageSquare className="h-4 w-4" /> WhatsApp
                    </a>
                  </div>
                  <button type="button" onClick={() => pararCompartilhar(l.id)} className="text-xs text-editorial-muted hover:text-red-600 underline cursor-pointer">Parar de compartilhar (o link deixa de funcionar)</button>
                </div>
              )}

              {l.itens.length === 0 ? (
                <p className="text-sm text-editorial-muted">Lista vazia. Toque no ❤ nas páginas de pousadas, guias, atrações e pacotes para salvar aqui.</p>
              ) : (
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                  {l.itens.map(item => <WishlistItemCard key={item.id} item={item} onRemove={() => remover(l, item)} />)}
                </div>
              )}
              {l.checkIn && l.checkOut && <p className="text-[11px] text-editorial-muted">Viagem de {fmt(l.checkIn)} a {fmt(l.checkOut)}{l.alertas ? " · avisamos por email se abrir vaga nessas datas." : ""}</p>}
            </section>
          ))}
        </div>
      )}

      {roteiro && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center p-0 sm:p-6" onClick={() => setRoteiro(null)}>
          <div role="dialog" aria-modal="true" aria-labelledby="roteiro-titulo" onClick={e => e.stopPropagation()} className="bg-white w-full sm:max-w-2xl max-h-[90vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 id="roteiro-titulo" className="font-serif text-xl font-semibold flex items-center gap-2"><Sparkles className="h-5 w-5 text-editorial-accent" /> Roteiro sugerido — {roteiro.lista.nome}</h2>
              <button type="button" onClick={() => setRoteiro(null)} aria-label="Fechar" className="w-9 h-9 rounded-full hover:bg-editorial-secondary flex items-center justify-center cursor-pointer"><X className="h-4 w-4" /></button>
            </div>
            {roteiro.texto === null && !roteiro.erro && (
              <div className="flex items-center gap-3 text-sm text-editorial-muted py-8 justify-center"><LoaderCircle className="h-5 w-5 animate-spin" /> A assistente está montando seu roteiro…</div>
            )}
            {roteiro.erro && <p className="text-sm text-red-700">{roteiro.erro}</p>}
            {roteiro.texto && (
              <>
                <div className="text-sm leading-relaxed whitespace-pre-line text-editorial-text">{roteiro.texto}</div>
                <p className="text-[11px] text-editorial-muted">Sugestão gerada por IA a partir dos itens da sua lista — confirme datas e disponibilidade antes de reservar.</p>
                <a
                  href={`https://wa.me/${AGENCY_WHATSAPP}?text=${encodeURIComponent(`Olá! Montei este roteiro no Ipantanal e queria ajuda para fechar:\n\n${roteiro.texto.slice(0, 1500)}`)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 bg-emerald-600 text-white text-xs uppercase tracking-widest font-bold px-5 py-3 rounded-full"
                >
                  <MessageSquare className="h-4 w-4" /> Fechar com a equipe no WhatsApp
                </a>
              </>
            )}
          </div>
        </div>
      )}
    </InfoPageLayout>
  );
}
