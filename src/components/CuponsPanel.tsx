import React, { useEffect, useState } from "react";
import { Tag, Plus, Trash2, Edit3, X, LoaderCircle } from "lucide-react";
import type { Cupom, Pousada } from "../types";
import { adminFetch } from "../lib/adminFetch";
import ToggleSwitch from "./ToggleSwitch";

const input = "w-full bg-zinc-50 border border-zinc-200 rounded p-2 text-xs focus:outline-none focus:border-emerald-500";
const label = "block text-zinc-700 font-semibold mb-1 text-xs";

interface Draft {
  code: string; description: string; tipo: "percent" | "amount"; valor: string;
  minTotal: string; maxUses: string; validFrom: string; validUntil: string; pousadaId: string; active: boolean;
}
const emptyDraft = (): Draft => ({ code: "", description: "", tipo: "percent", valor: "10", minTotal: "", maxUses: "", validFrom: "", validUntil: "", pousadaId: "", active: true });
const toDraft = (c: Cupom): Draft => ({
  code: c.code, description: c.description || "", tipo: c.percentOff ? "percent" : "amount", valor: String(c.percentOff ?? c.amountOff ?? ""),
  minTotal: c.minTotal != null ? String(c.minTotal) : "", maxUses: c.maxUses != null ? String(c.maxUses) : "",
  validFrom: c.validFrom ? String(c.validFrom).slice(0, 10) : "", validUntil: c.validUntil ? String(c.validUntil).slice(0, 10) : "",
  pousadaId: c.pousadaId || "", active: c.active,
});

// Gestão → Cupons: códigos promocionais aplicados na reserva online. O
// desconto é validado e recalculado no servidor e vai para o Stripe como
// desconto de uso único.
export default function CuponsPanel({ pousadas }: { pousadas: Pousada[] }) {
  const [cupons, setCupons] = useState<Cupom[] | null>(null);
  const [loadError, setLoadError] = useState("");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);

  const load = async () => {
    const res = await adminFetch("/api/admin/cupons").catch(() => null);
    if (!res || !res.ok) {
      const body = res ? await res.json().catch(() => ({})) : {};
      setLoadError(body.error || "Não foi possível carregar os cupons.");
      setCupons([]);
      return;
    }
    setLoadError("");
    setCupons(await res.json());
  };
  useEffect(() => { load(); }, []);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!draft) return;
    setSaving(true);
    setFormError("");
    const payload = {
      code: draft.code, description: draft.description,
      percentOff: draft.tipo === "percent" ? draft.valor : null,
      amountOff: draft.tipo === "amount" ? draft.valor : null,
      minTotal: draft.minTotal, maxUses: draft.maxUses, validFrom: draft.validFrom, validUntil: draft.validUntil,
      pousadaId: draft.pousadaId, active: draft.active,
    };
    const res = await adminFetch(editingId ? `/api/admin/cupons/${editingId}` : "/api/admin/cupons", {
      method: editingId ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
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

  const remove = async (c: Cupom) => {
    if (!confirm(`Excluir o cupom ${c.code}? Reservas que já usaram não mudam.`)) return;
    await adminFetch(`/api/admin/cupons/${c.id}`, { method: "DELETE" });
    load();
  };

  const descreve = (c: Cupom) => (c.percentOff ? `${c.percentOff}% off` : `R$ ${Number(c.amountOff).toLocaleString("pt-BR")} off`);

  if (cupons === null) {
    return <div className="flex items-center justify-center py-20 text-editorial-muted gap-2"><LoaderCircle className="h-5 w-5 animate-spin" /> <span className="text-xs uppercase tracking-widest font-bold">Carregando cupons...</span></div>;
  }

  return (
    <div className="space-y-6">
      {loadError && <div className="bg-amber-50 border border-amber-200 text-amber-900 text-xs px-4 py-3 rounded-lg">{loadError}</div>}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-4 border border-zinc-200 rounded-2xl">
        <p className="text-xs text-editorial-muted max-w-xl">O turista digita o código na tela de reserva. Percentual ou valor fixo; validade, limite de usos e valor mínimo são opcionais.</p>
        <button type="button" onClick={() => { setEditingId(null); setDraft(emptyDraft()); setFormError(""); }} className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-4 py-2 rounded-lg transition flex items-center gap-1.5 shadow-sm cursor-pointer">
          <Plus className="h-4 w-4" /> Novo cupom
        </button>
      </div>

      {draft && (
        <form onSubmit={save} className="bg-white border border-zinc-200 p-6 rounded-2xl shadow-md space-y-4">
          <div className="flex items-center justify-between border-b border-zinc-100 pb-3">
            <h3 className="font-bold text-base text-zinc-900">{editingId ? "Editar cupom" : "Novo cupom"}</h3>
            <button type="button" aria-label="Fechar" onClick={() => setDraft(null)} className="text-zinc-400 hover:text-zinc-700 cursor-pointer"><X className="h-5 w-5" /></button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label htmlFor="cp-code" className={label}>Código</label>
              <input id="cp-code" required minLength={3} maxLength={40} value={draft.code} onChange={e => setDraft({ ...draft, code: e.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, "") })} className={`${input} uppercase font-mono`} placeholder="PANTANAL10" />
            </div>
            <div>
              <label htmlFor="cp-tipo" className={label}>Tipo de desconto</label>
              <select id="cp-tipo" value={draft.tipo} onChange={e => setDraft({ ...draft, tipo: e.target.value as Draft["tipo"] })} className={input}>
                <option value="percent">Percentual (%)</option>
                <option value="amount">Valor fixo (R$)</option>
              </select>
            </div>
            <div>
              <label htmlFor="cp-valor" className={label}>{draft.tipo === "percent" ? "Percentual" : "Valor (R$)"}</label>
              <input id="cp-valor" type="number" required min={draft.tipo === "percent" ? 1 : 1} max={draft.tipo === "percent" ? 100 : undefined} step="0.01" value={draft.valor} onChange={e => setDraft({ ...draft, valor: e.target.value })} className={input} />
            </div>
          </div>
          <div>
            <label htmlFor="cp-desc" className={label}>Descrição (aparece para o turista)</label>
            <input id="cp-desc" maxLength={200} value={draft.description} onChange={e => setDraft({ ...draft, description: e.target.value })} className={input} placeholder="Ex.: 10% na temporada de onças" />
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <label htmlFor="cp-from" className={label}>Válido a partir de</label>
              <input id="cp-from" type="date" value={draft.validFrom} onChange={e => setDraft({ ...draft, validFrom: e.target.value })} className={input} />
            </div>
            <div>
              <label htmlFor="cp-until" className={label}>Válido até</label>
              <input id="cp-until" type="date" value={draft.validUntil} onChange={e => setDraft({ ...draft, validUntil: e.target.value })} className={input} />
            </div>
            <div>
              <label htmlFor="cp-max" className={label}>Limite de usos</label>
              <input id="cp-max" type="number" min={1} value={draft.maxUses} onChange={e => setDraft({ ...draft, maxUses: e.target.value })} className={input} placeholder="Sem limite" />
            </div>
            <div>
              <label htmlFor="cp-min" className={label}>Valor mínimo (R$)</label>
              <input id="cp-min" type="number" min={0} value={draft.minTotal} onChange={e => setDraft({ ...draft, minTotal: e.target.value })} className={input} placeholder="Sem mínimo" />
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-end">
            <div>
              <label htmlFor="cp-pousada" className={label}>Vale para</label>
              <select id="cp-pousada" value={draft.pousadaId} onChange={e => setDraft({ ...draft, pousadaId: e.target.value })} className={input}>
                <option value="">Todas as pousadas</option>
                {pousadas.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <ToggleSwitch checked={draft.active} onChange={v => setDraft({ ...draft, active: v })} labelOn="Ativo" labelOff="Desativado" />
          </div>
          {formError && <p role="alert" className="text-red-600 text-xs">{formError}</p>}
          <button type="submit" disabled={saving} className="bg-editorial-primary text-white text-xs font-bold px-5 py-2.5 rounded-lg disabled:opacity-60 cursor-pointer">{saving ? "Salvando..." : "Salvar cupom"}</button>
        </form>
      )}

      {cupons.length === 0 && !loadError ? (
        <div className="text-center py-16 border border-dashed border-zinc-300 rounded-2xl text-editorial-muted text-xs"><Tag className="h-7 w-7 mx-auto mb-2" />Nenhum cupom ainda.</div>
      ) : (
        <div className="bg-white border border-zinc-200 rounded-2xl overflow-x-auto">
          <table className="w-full text-xs min-w-[640px]">
            <thead className="text-left text-[10px] uppercase tracking-widest text-editorial-muted">
              <tr><th className="p-3">Código</th><th className="p-3">Desconto</th><th className="p-3">Usos</th><th className="p-3">Validade</th><th className="p-3">Pousada</th><th className="p-3"><span className="sr-only">Ações</span></th></tr>
            </thead>
            <tbody>
              {cupons.map(c => (
                <tr key={c.id} className={`border-t border-zinc-100 ${c.active ? "" : "opacity-50"}`}>
                  <td className="p-3 font-mono font-bold">{c.code}</td>
                  <td className="p-3">{descreve(c)}{c.minTotal ? ` · mín. R$ ${c.minTotal}` : ""}</td>
                  <td className="p-3">{c.usedCount}{c.maxUses ? ` / ${c.maxUses}` : ""}</td>
                  <td className="p-3">{c.validUntil ? `até ${new Date(String(c.validUntil).slice(0, 10) + "T12:00:00").toLocaleDateString("pt-BR")}` : "sem prazo"}</td>
                  <td className="p-3">{c.pousadaId ? pousadas.find(p => p.id === c.pousadaId)?.name || "—" : "Todas"}</td>
                  <td className="p-3 whitespace-nowrap">
                    <button type="button" aria-label={`Editar ${c.code}`} onClick={() => { setEditingId(c.id); setDraft(toDraft(c)); setFormError(""); }} className="text-editorial-primary mr-3 cursor-pointer"><Edit3 className="h-4 w-4" /></button>
                    <button type="button" aria-label={`Excluir ${c.code}`} onClick={() => remove(c)} className="text-red-600 cursor-pointer"><Trash2 className="h-4 w-4" /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
