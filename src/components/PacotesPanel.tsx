import React, { useEffect, useState } from "react";
import { Package, Plus, Trash2, Edit3, X, LoaderCircle } from "lucide-react";
import type { Pacote, PacoteItem, Pousada, Guide, Atracao } from "../types";
import { adminFetch } from "../lib/adminFetch";
import ImageUploadButton from "./ImageUploadButton";
import ToggleSwitch from "./ToggleSwitch";

const KIND_LABEL: Record<PacoteItem["kind"], string> = { hospedagem: "Hospedagem", guia: "Guia", atracao: "Atração", outro: "Outro" };
const input = "w-full bg-zinc-50 border border-zinc-200 rounded p-2 text-xs focus:outline-none focus:border-emerald-500";
const label = "block text-zinc-700 font-semibold mb-1 text-xs";
const money = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

type Draft = Omit<Pacote, "id" | "createdAt">;
const emptyDraft = (): Draft => ({ name: "", description: "", pousadaId: "", guideId: "", atracaoIds: [], nights: 3, items: [], imageUrl: "", active: true });

// Gestão → Pacotes: monta combinações pousada + guia + atrações com preço por
// pessoa por componente. Cada item vira uma linha no checkout do Stripe.
export default function PacotesPanel({ pousadas, guides }: { pousadas: Pousada[]; guides: Guide[] }) {
  const [pacotes, setPacotes] = useState<Pacote[] | null>(null);
  const [atracoes, setAtracoes] = useState<Atracao[]>([]);
  const [loadError, setLoadError] = useState("");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");

  const load = async () => {
    const res = await adminFetch("/api/admin/pacotes").catch(() => null);
    if (!res || !res.ok) {
      const body = res ? await res.json().catch(() => ({})) : {};
      setLoadError(body.error || "Não foi possível carregar os pacotes.");
      setPacotes([]);
      return;
    }
    setLoadError("");
    setPacotes(await res.json());
  };

  useEffect(() => {
    load();
    fetch("/api/atracoes").then(r => (r.ok ? r.json() : [])).then(setAtracoes).catch(() => {});
  }, []);

  const pousadaName = (id: string) => pousadas.find(p => p.id === id)?.name || "—";
  const total = (items: PacoteItem[]) => items.reduce((acc, i) => acc + (Number(i.pricePerPerson) || 0), 0);

  // Sugere os itens a partir do que foi escolhido (o admin ajusta os preços).
  const suggestItems = (d: Draft): PacoteItem[] => {
    const p = pousadas.find(x => x.id === d.pousadaId);
    const items: PacoteItem[] = [];
    if (p) items.push({ kind: "hospedagem", label: `${p.name} — ${d.nights} noites`, pricePerPerson: p.pricePerNight * d.nights });
    const g = guides.find(x => x.id === d.guideId);
    if (g) items.push({ kind: "guia", label: `Guia ${g.name}`, pricePerPerson: 0 });
    for (const id of d.atracaoIds) {
      const a = atracoes.find(x => x.id === id);
      if (a) items.push({ kind: "atracao", label: a.name, pricePerPerson: 0 });
    }
    return items;
  };

  const openNew = () => { setEditingId(null); setDraft(emptyDraft()); setFormError(""); };
  const openEdit = (p: Pacote) => { setEditingId(p.id); setDraft({ ...p, description: p.description || "", guideId: p.guideId || "", imageUrl: p.imageUrl || "" }); setFormError(""); };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!draft) return;
    setSaving(true);
    setFormError("");
    const res = await adminFetch(editingId ? `/api/admin/pacotes/${editingId}` : "/api/admin/pacotes", {
      method: editingId ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(draft),
    }).catch(() => null);
    setSaving(false);
    if (!res || !res.ok) {
      const body = res ? await res.json().catch(() => ({})) : {};
      setFormError(body.error || "Erro ao salvar.");
      return;
    }
    setDraft(null);
    load();
  };

  const remove = async (p: Pacote) => {
    if (!confirm(`Excluir o pacote "${p.name}"? Reservas já feitas com ele não são afetadas.`)) return;
    await adminFetch(`/api/admin/pacotes/${p.id}`, { method: "DELETE" });
    load();
  };

  const setItem = (idx: number, patch: Partial<PacoteItem>) =>
    setDraft(d => d && { ...d, items: d.items.map((it, i) => (i === idx ? { ...it, ...patch } : it)) });

  if (pacotes === null) {
    return <div className="flex items-center justify-center py-20 text-editorial-muted gap-2"><LoaderCircle className="h-5 w-5 animate-spin" /> <span className="text-xs uppercase tracking-widest font-bold">Carregando pacotes...</span></div>;
  }

  return (
    <div className="space-y-6">
      {loadError && <div className="bg-amber-50 border border-amber-200 text-amber-900 text-xs px-4 py-3 rounded-lg">{loadError}</div>}

      <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-4 border border-zinc-200 rounded-2xl">
        <p className="text-xs text-editorial-muted max-w-xl">Pacotes aparecem na home e são pagos num único checkout do Stripe, com uma linha por item (hospedagem, guia, atrações). Preço por pessoa.</p>
        <button type="button" onClick={openNew} className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-4 py-2 rounded-lg transition flex items-center gap-1.5 shadow-sm cursor-pointer">
          <Plus className="h-4 w-4" /> Novo pacote
        </button>
      </div>

      {draft && (
        <form onSubmit={save} className="bg-white border border-zinc-200 p-6 rounded-2xl shadow-md space-y-4">
          <div className="flex items-center justify-between border-b border-zinc-100 pb-3">
            <h3 className="font-bold text-base text-zinc-900">{editingId ? "Editar pacote" : "Novo pacote"}</h3>
            <button type="button" aria-label="Fechar" onClick={() => setDraft(null)} className="text-zinc-400 hover:text-zinc-700 cursor-pointer"><X className="h-5 w-5" /></button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="md:col-span-2">
              <label htmlFor="pk-name" className={label}>Nome</label>
              <input id="pk-name" required maxLength={120} value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} className={input} placeholder="Ex.: Onça-pintada — 4 noites com guia" />
            </div>
            <div>
              <label htmlFor="pk-nights" className={label}>Noites</label>
              <input id="pk-nights" type="number" min={1} max={30} required value={draft.nights} onChange={e => setDraft({ ...draft, nights: Math.max(1, Number(e.target.value) || 1) })} className={input} />
            </div>
          </div>
          <div>
            <label htmlFor="pk-desc" className={label}>Descrição</label>
            <textarea id="pk-desc" rows={2} maxLength={1000} value={draft.description || ""} onChange={e => setDraft({ ...draft, description: e.target.value })} className={`${input} resize-none`} />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label htmlFor="pk-pousada" className={label}>Pousada</label>
              <select id="pk-pousada" required value={draft.pousadaId} onChange={e => setDraft({ ...draft, pousadaId: e.target.value })} className={input}>
                <option value="">Selecione...</option>
                {pousadas.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="pk-guia" className={label}>Guia (opcional)</label>
              <select id="pk-guia" value={draft.guideId || ""} onChange={e => setDraft({ ...draft, guideId: e.target.value })} className={input}>
                <option value="">Sem guia</option>
                {guides.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
              </select>
            </div>
          </div>
          {atracoes.length > 0 && (
            <fieldset>
              <legend className={label}>Atrações incluídas</legend>
              <div className="flex flex-wrap gap-2">
                {atracoes.map(a => {
                  const on = draft.atracaoIds.includes(a.id);
                  return (
                    <button key={a.id} type="button" aria-pressed={on} onClick={() => setDraft({ ...draft, atracaoIds: on ? draft.atracaoIds.filter(x => x !== a.id) : [...draft.atracaoIds, a.id] })}
                      className={`text-xs px-3 py-1.5 rounded-full border cursor-pointer ${on ? "bg-editorial-primary text-white border-editorial-primary" : "bg-white border-zinc-200"}`}>
                      {on ? "✓ " : ""}{a.name}
                    </button>
                  );
                })}
              </div>
            </fieldset>
          )}

          <fieldset className="border border-zinc-200 rounded-lg p-3 space-y-2">
            <legend className="px-1 text-xs font-semibold text-zinc-700">Itens do checkout (preço por pessoa)</legend>
            {draft.items.map((it, idx) => (
              <div key={idx} className="grid grid-cols-12 gap-2 items-center">
                <select aria-label="Tipo do item" value={it.kind} onChange={e => setItem(idx, { kind: e.target.value as PacoteItem["kind"] })} className={`${input} col-span-3`}>
                  {Object.entries(KIND_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
                <input aria-label="Descrição do item" value={it.label} onChange={e => setItem(idx, { label: e.target.value })} className={`${input} col-span-5`} />
                <input aria-label="Preço por pessoa" type="number" min={0} step="0.01" value={it.pricePerPerson} onChange={e => setItem(idx, { pricePerPerson: Number(e.target.value) || 0 })} className={`${input} col-span-3`} />
                <button type="button" aria-label="Remover item" onClick={() => setDraft({ ...draft, items: draft.items.filter((_, i) => i !== idx) })} className="col-span-1 text-red-600 hover:text-red-800 cursor-pointer"><Trash2 className="h-4 w-4" /></button>
              </div>
            ))}
            <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
              <div className="flex gap-3">
                <button type="button" onClick={() => setDraft({ ...draft, items: [...draft.items, { kind: "outro", label: "", pricePerPerson: 0 }] })} className="text-xs font-bold text-emerald-700 cursor-pointer">+ Item</button>
                <button type="button" onClick={() => setDraft({ ...draft, items: suggestItems(draft) })} className="text-xs font-bold text-editorial-primary cursor-pointer">Preencher a partir da seleção</button>
              </div>
              <span className="text-xs font-bold">Total por pessoa: {money(total(draft.items))}</span>
            </div>
          </fieldset>

          <div className="flex flex-wrap items-center gap-4">
            <ImageUploadButton onUploaded={url => setDraft({ ...draft, imageUrl: url })} label={draft.imageUrl ? "Trocar foto" : "Foto do pacote"} />
            {draft.imageUrl && <img src={draft.imageUrl} alt="" className="h-12 w-20 object-cover rounded border border-zinc-200" />}
            <ToggleSwitch checked={draft.active} onChange={v => setDraft({ ...draft, active: v })} labelOn="Visível na home" labelOff="Oculto" />
          </div>

          {formError && <p role="alert" className="text-red-600 text-xs">{formError}</p>}
          <button type="submit" disabled={saving} className="bg-editorial-primary text-white text-xs font-bold px-5 py-2.5 rounded-lg disabled:opacity-60 cursor-pointer">{saving ? "Salvando..." : "Salvar pacote"}</button>
        </form>
      )}

      {pacotes.length === 0 && !loadError ? (
        <div className="text-center py-16 border border-dashed border-zinc-300 rounded-2xl text-editorial-muted text-xs"><Package className="h-7 w-7 mx-auto mb-2" />Nenhum pacote ainda.</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {pacotes.map(p => (
            <div key={p.id} className="bg-white border border-zinc-200 rounded-2xl p-4 text-xs">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-bold text-sm text-zinc-900">{p.name}</p>
                  <p className="text-editorial-muted">{pousadaName(p.pousadaId)} · {p.nights} noites · {money(total(p.items))}/pessoa</p>
                </div>
                <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${p.active ? "bg-emerald-50 text-emerald-700" : "bg-zinc-100 text-zinc-500"}`}>{p.active ? "Ativo" : "Oculto"}</span>
              </div>
              <ul className="mt-2 text-editorial-muted space-y-0.5">{p.items.map((i, idx) => <li key={idx}>{KIND_LABEL[i.kind]}: {i.label} — {money(i.pricePerPerson)}</li>)}</ul>
              <div className="flex gap-3 mt-3">
                <button type="button" onClick={() => openEdit(p)} className="flex items-center gap-1 text-editorial-primary font-bold cursor-pointer"><Edit3 className="h-3.5 w-3.5" /> Editar</button>
                <button type="button" onClick={() => remove(p)} className="flex items-center gap-1 text-red-600 font-bold cursor-pointer"><Trash2 className="h-3.5 w-3.5" /> Excluir</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
