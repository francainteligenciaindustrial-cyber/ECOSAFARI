import React, { useState, useEffect } from "react";
import { MapPin, Plus, Trash2, LoaderCircle, BadgeCheck, X, KeyRound } from "lucide-react";
import { Atracao } from "../types";
import { adminFetch } from "../lib/adminFetch";
import ImageListEditor from "./ImageListEditor";
import ExperienceListEditor, { ExperienceDraft } from "./ExperienceListEditor";
import PartnerAccessManager from "./PartnerAccessManager";
import Pagination from "./Pagination";
import { usePagination } from "../lib/usePagination";

const TYPE_LABELS: Record<Atracao["type"], string> = {
  parada_legal: "Parada Legal",
  restaurante: "Restaurante",
};

// "Atração" is the partner category for anyone who isn't a hospedagem —
// a "Parada Legal" (passeio, artesanato, lembrança) or um Restaurante. See
// scripts/add-atracoes-and-partner-fields.sql for the table this manages.
export default function AtracoesPanel() {
  const [atracoes, setAtracoes] = useState<Atracao[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [filter, setFilter] = useState<"todos" | Atracao["type"]>("todos");
  const [showAddForm, setShowAddForm] = useState(false);
  const [managingAccessFor, setManagingAccessFor] = useState<Atracao | null>(null);
  const [editing, setEditing] = useState<Atracao | null>(null);

  const emptyForm = {
    type: "parada_legal" as Atracao["type"],
    name: "",
    description: "",
    location: "",
    images: [] as string[],
    menu: [] as ExperienceDraft[],
  };
  const [form, setForm] = useState(emptyForm);

  const fetchData = async () => {
    setLoadError(false);
    try {
      const res = await adminFetch("/api/atracoes");
      if (res.ok) setAtracoes(await res.json());
      else setLoadError(true);
    } catch (err) {
      console.error("Erro ao carregar atrações:", err);
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const filtered = atracoes.filter(a => filter === "todos" || a.type === filter);
  const pagination = usePagination(filtered, 12);

  const openEdit = (a: Atracao) => {
    setEditing(a);
    setForm({
      type: a.type,
      name: a.name,
      description: a.description,
      location: a.location,
      images: [...(a.images || [])],
      menu: (a.menu || []).map(m => ({ title: m.item, price: m.price })),
    });
  };

  const closeForm = () => {
    setShowAddForm(false);
    setEditing(null);
    setForm(emptyForm);
  };

  const buildPayload = () => ({
    type: form.type,
    name: form.name,
    description: form.description,
    location: form.location,
    images: form.images.map(i => i.trim()).filter(Boolean),
    menu: form.type === "restaurante"
      ? form.menu.filter(m => m.title.trim()).map(m => ({ item: m.title.trim(), price: m.price || 0 }))
      : undefined,
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload = buildPayload();
    const res = editing
      ? await adminFetch(`/api/atracoes/${editing.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) })
      : await adminFetch("/api/atracoes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    if (res.ok) {
      closeForm();
      fetchData();
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Excluir esta atração?")) return;
    await adminFetch(`/api/atracoes/${id}`, { method: "DELETE" });
    fetchData();
  };

  const handleToggleVerified = async (a: Atracao) => {
    const res = await adminFetch(`/api/atracoes/${a.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ verified: !a.verified }),
    });
    if (res.ok) fetchData();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-editorial-muted gap-2">
        <LoaderCircle className="h-5 w-5 animate-spin" />
        <span className="text-xs uppercase tracking-widest font-bold">Carregando atrações...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {loadError && (
        <div className="bg-amber-50 border border-amber-200 text-amber-900 text-xs px-4 py-3 rounded-lg">
          Não foi possível carregar as atrações. Tente sair e entrar de novo no painel — se persistir, a tabela <span className="font-mono">atracoes</span> pode não existir ainda no Supabase.
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-4 border border-zinc-200 rounded-2xl">
        <div className="flex gap-2">
          {(["todos", "parada_legal", "restaurante"] as const).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 text-[10px] uppercase tracking-widest font-bold border rounded transition cursor-pointer ${
                filter === f ? "bg-editorial-primary text-white border-editorial-primary" : "bg-white text-editorial-muted border-editorial-border hover:text-editorial-primary"
              }`}
            >
              {f === "todos" ? "Todos" : TYPE_LABELS[f]}
            </button>
          ))}
        </div>
        <button
          onClick={() => { closeForm(); setShowAddForm(true); }}
          className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-4 py-2 rounded-lg transition flex items-center gap-1.5 shadow-sm cursor-pointer"
        >
          <Plus className="h-4 w-4" /> Adicionar Atração
        </button>
      </div>

      {(showAddForm || editing) && (
        <form onSubmit={handleSubmit} className="bg-white border border-zinc-200 p-6 rounded-2xl shadow-md space-y-4">
          <div className="flex items-center justify-between border-b border-zinc-100 pb-3">
            <h3 className="font-bold text-base text-zinc-900">{editing ? "Editar Atração" : "Cadastrar Nova Atração"}</h3>
            <button type="button" onClick={closeForm} className="text-zinc-400 hover:text-zinc-700 transition cursor-pointer">
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            <div>
              <label className="block text-zinc-700 font-semibold mb-1">Tipo</label>
              <select
                value={form.type}
                onChange={e => setForm(prev => ({ ...prev, type: e.target.value as Atracao["type"] }))}
                className="w-full bg-zinc-50 border border-zinc-200 rounded p-2 focus:outline-none focus:border-emerald-500"
              >
                <option value="parada_legal">Parada Legal</option>
                <option value="restaurante">Restaurante</option>
              </select>
            </div>
            <div>
              <label className="block text-zinc-700 font-semibold mb-1">Nome</label>
              <input
                type="text" required value={form.name}
                onChange={e => setForm(prev => ({ ...prev, name: e.target.value }))}
                className="w-full bg-zinc-50 border border-zinc-200 rounded p-2 focus:outline-none focus:border-emerald-500"
              />
            </div>
          </div>

          <div className="text-xs">
            <label className="block text-zinc-700 font-semibold mb-1">Localização</label>
            <input
              type="text" required value={form.location}
              onChange={e => setForm(prev => ({ ...prev, location: e.target.value }))}
              className="w-full bg-zinc-50 border border-zinc-200 rounded p-2 focus:outline-none focus:border-emerald-500"
            />
          </div>

          <div className="text-xs">
            <label className="block text-zinc-700 font-semibold mb-1">Descrição</label>
            <textarea
              rows={3} value={form.description}
              onChange={e => setForm(prev => ({ ...prev, description: e.target.value }))}
              className="w-full bg-zinc-50 border border-zinc-200 rounded p-2 focus:outline-none focus:border-emerald-500 resize-none"
            />
          </div>

          <ImageListEditor label="Imagens" value={form.images} onChange={images => setForm(prev => ({ ...prev, images }))} />

          {form.type === "restaurante" && (
            <div className="text-xs">
              <label className="block text-zinc-700 font-semibold mb-1.5">Cardápio</label>
              <ExperienceListEditor value={form.menu} onChange={menu => setForm(prev => ({ ...prev, menu }))} />
            </div>
          )}

          <div className="flex gap-2 justify-end pt-2 text-xs border-t border-zinc-100">
            <button type="button" onClick={closeForm} className="bg-zinc-100 text-zinc-700 px-4 py-2 rounded font-semibold hover:bg-zinc-200 transition cursor-pointer">
              Cancelar
            </button>
            <button type="submit" className="bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-2.5 rounded font-bold transition shadow-sm cursor-pointer">
              {editing ? "Salvar Alterações" : "Salvar Atração"}
            </button>
          </div>
        </form>
      )}

      {managingAccessFor && (
        <PartnerAccessManager
          partnerType="atracao"
          partnerId={managingAccessFor.id}
          partnerLabel={managingAccessFor.name}
          onClose={() => setManagingAccessFor(null)}
        />
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {pagination.pageItems.map(a => (
          <div key={a.id} className="bg-white border border-zinc-200 rounded-2xl p-5 shadow-sm flex gap-4">
            <div className="w-24 h-24 flex-shrink-0 rounded-xl overflow-hidden bg-zinc-100 border border-zinc-200">
              {a.images[0] && <img src={a.images[0]} alt={a.name} referrerPolicy="no-referrer" className="w-full h-full object-cover" />}
            </div>
            <div className="flex-1 flex flex-col justify-between min-w-0">
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-bold text-zinc-900 truncate">{a.name}</span>
                  <span className="text-[9px] uppercase tracking-widest font-bold bg-zinc-100 text-zinc-600 border border-zinc-200 px-2 py-0.5 rounded-full">
                    {TYPE_LABELS[a.type]}
                  </span>
                  {a.verified && (
                    <span className="flex items-center gap-1 text-[9px] uppercase tracking-widest font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded-full">
                      <BadgeCheck className="h-3 w-3" /> Verificada
                    </span>
                  )}
                </div>
                <span className="text-[11px] text-zinc-500 flex items-center gap-1 mt-1"><MapPin className="h-3 w-3" /> {a.location}</span>
              </div>
              <div className="flex items-center justify-end gap-1 mt-2 flex-wrap">
                <button onClick={() => setManagingAccessFor(a)} className="text-zinc-500 hover:text-editorial-primary p-1.5 rounded hover:bg-zinc-50 transition cursor-pointer" title="Gerenciar acesso de parceiro">
                  <KeyRound className="h-4 w-4" />
                </button>
                <button onClick={() => handleToggleVerified(a)} className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 hover:text-emerald-700 px-2 py-1 rounded hover:bg-emerald-50 transition cursor-pointer">
                  {a.verified ? "Remover selo" : "Verificar"}
                </button>
                <button onClick={() => openEdit(a)} className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 hover:text-editorial-primary px-2 py-1 rounded hover:bg-zinc-50 transition cursor-pointer">
                  Editar
                </button>
                <button onClick={() => handleDelete(a.id)} className="text-red-500 hover:text-red-700 hover:bg-red-50 p-1.5 rounded transition cursor-pointer" title="Excluir">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        ))}
        {filtered.length === 0 && (
          <div className="col-span-full bg-white border border-dashed border-zinc-300 rounded-2xl p-10 text-center text-zinc-400 text-sm">
            Nenhuma atração cadastrada ainda.
          </div>
        )}
      </div>
      <Pagination page={pagination.page} totalPages={pagination.totalPages} totalItems={pagination.totalItems} onPageChange={pagination.setPage} />
    </div>
  );
}
