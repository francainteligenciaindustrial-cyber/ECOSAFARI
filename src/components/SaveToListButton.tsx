import React, { useEffect, useRef, useState } from "react";
import { Heart, LoaderCircle, Plus, Check } from "lucide-react";
import { useTouristSession } from "../lib/useTouristSession";
import { adminFetch } from "../lib/adminFetch";
import { navigate } from "../lib/router";
import { RETURN_TO_KEY } from "../lib/returnTo";

export type SaveTipo = "pousada" | "guia" | "atracao" | "pacote";
interface Lista { id: string; nome: string }

// Coração "Salvar na lista de desejos" — escolhe em qual lista (ou cria uma
// nova). Sem login de turista, leva para o cadastro e volta para cá depois.
export default function SaveToListButton({ tipo, refId, compact = false, className = "" }: { tipo: SaveTipo; refId: string; compact?: boolean; className?: string }) {
  const { isTourist, checking } = useTouristSession();
  const [open, setOpen] = useState(false);
  const [listas, setListas] = useState<Lista[] | null>(null);
  const [salvoEm, setSalvoEm] = useState<string[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [novaNome, setNovaNome] = useState("");
  const [error, setError] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  const loadSaved = () =>
    adminFetch(`/api/turista/salvos?tipo=${tipo}&refId=${encodeURIComponent(refId)}`)
      .then(r => (r.ok ? r.json() : { listas: [] }))
      .then(d => setSalvoEm(d.listas || []))
      .catch(() => {});

  useEffect(() => {
    if (!checking && isTourist) loadSaved();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checking, isTourist, tipo, refId]);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", esc); };
  }, [open]);

  const openMenu = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!isTourist) {
      try { localStorage.setItem(RETURN_TO_KEY, window.location.pathname + window.location.search); } catch { /* sem storage */ }
      navigate("/turista");
      return;
    }
    setOpen(v => !v);
    setError("");
    if (listas === null) {
      const r = await adminFetch("/api/turista/listas");
      const body = await r.json().catch(() => []);
      if (!r.ok) return setError(body.error || "Não foi possível carregar suas listas.");
      setListas((body as any[]).map(l => ({ id: l.id, nome: l.nome })));
    }
  };

  const toggle = async (listaId: string) => {
    setBusy(listaId);
    try {
      const has = salvoEm.includes(listaId);
      const r = has
        ? await adminFetch(`/api/turista/listas/${listaId}/itens?tipo=${tipo}&refId=${encodeURIComponent(refId)}`, { method: "DELETE" })
        : await adminFetch(`/api/turista/listas/${listaId}/itens`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tipo, refId }) });
      if (r.ok) setSalvoEm(s => (has ? s.filter(x => x !== listaId) : [...s, listaId]));
    } finally {
      setBusy(null);
    }
  };

  const criar = async (e: React.FormEvent) => {
    e.preventDefault();
    const nome = novaNome.trim();
    if (!nome) return;
    setBusy("nova");
    try {
      const r = await adminFetch("/api/turista/listas", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ nome }) });
      const body = await r.json().catch(() => ({}));
      if (!r.ok) return setError(body.error || "Não foi possível criar a lista.");
      setListas(l => [...(l || []), { id: body.id, nome: body.nome }]);
      setNovaNome("");
      await toggle(body.id);
    } finally {
      setBusy(null);
    }
  };

  const saved = salvoEm.length > 0;
  return (
    <div ref={ref} className={`relative inline-block ${className}`} onClick={e => e.stopPropagation()}>
      <button
        type="button"
        onClick={openMenu}
        disabled={checking}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={saved ? "Salvo na lista de desejos — alterar" : "Salvar na lista de desejos"}
        className={compact
          ? `w-9 h-9 rounded-full flex items-center justify-center bg-white/90 backdrop-blur-sm shadow-sm border border-white hover:scale-105 transition cursor-pointer ${saved ? "text-red-500" : "text-editorial-text"}`
          : `inline-flex items-center gap-1.5 border px-3 py-1.5 rounded-full text-xs font-semibold transition cursor-pointer ${saved ? "bg-red-50 border-red-200 text-red-600" : "bg-white border-editorial-border text-editorial-muted hover:text-red-600 hover:border-red-200"}`}
      >
        <Heart className={`h-4 w-4 ${saved ? "fill-current" : ""}`} />
        {!compact && (saved ? "Salvo" : "Salvar")}
      </button>

      {open && (
        <div role="dialog" aria-label="Escolha a lista de desejos" className="absolute right-0 top-full mt-2 w-72 bg-white border border-editorial-border rounded-2xl shadow-xl z-50 p-3 text-left">
          <p className="text-[11px] uppercase tracking-widest font-bold text-editorial-muted px-1 mb-2">Salvar em</p>
          {error && <p className="text-xs text-red-700 px-1 mb-2">{error}</p>}
          {listas === null && !error && <div className="flex justify-center py-3"><LoaderCircle className="h-4 w-4 animate-spin text-editorial-muted" /></div>}
          {listas && listas.length === 0 && <p className="text-xs text-editorial-muted px-1 mb-2">Crie sua primeira lista — por exemplo "Pantanal julho".</p>}
          <ul className="max-h-56 overflow-y-auto">
            {(listas || []).map(l => {
              const on = salvoEm.includes(l.id);
              return (
                <li key={l.id}>
                  <button type="button" onClick={() => toggle(l.id)} disabled={busy !== null} className="w-full flex items-center justify-between gap-2 px-2 py-2 rounded-xl text-sm hover:bg-editorial-secondary cursor-pointer disabled:opacity-60">
                    <span className="truncate">{l.nome}</span>
                    {busy === l.id ? <LoaderCircle className="h-4 w-4 animate-spin" /> : on ? <Check className="h-4 w-4 text-editorial-accent" /> : <Plus className="h-4 w-4 text-editorial-muted" />}
                  </button>
                </li>
              );
            })}
          </ul>
          <form onSubmit={criar} className="flex gap-2 mt-2 pt-2 border-t border-editorial-border">
            <label htmlFor={`nova-lista-${tipo}-${refId}`} className="sr-only">Nome da nova lista</label>
            <input id={`nova-lista-${tipo}-${refId}`} value={novaNome} onChange={e => setNovaNome(e.target.value)} maxLength={80} placeholder="Nova lista..." className="flex-1 min-w-0 border border-editorial-border rounded-xl px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-editorial-primary" />
            <button type="submit" disabled={busy !== null || !novaNome.trim()} className="bg-editorial-primary text-white text-xs font-semibold px-3 rounded-xl disabled:opacity-50 cursor-pointer">Criar</button>
          </form>
          <button type="button" onClick={() => { setOpen(false); navigate("/turista/listas"); }} className="w-full mt-2 text-[11px] font-semibold text-editorial-accent hover:underline cursor-pointer">Ver minhas listas →</button>
        </div>
      )}
    </div>
  );
}
