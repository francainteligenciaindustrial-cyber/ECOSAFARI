import React, { useState } from "react";
import { UserRound, Hotel, Plus, Trash2, LoaderCircle, Check, ChevronRight } from "lucide-react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { adminFetch } from "../lib/adminFetch";
import { useToast } from "../lib/ToastProvider";

interface PousadaRef {
  partnerId: string;
  name: string;
}

interface Props {
  supabase: SupabaseClient;
  userInfo: { email: string; name: string; phone: string };
  onUserInfoSaved: (info: { name: string; phone: string }) => void;
  pousadas: PousadaRef[];
  activeId: string | null;
  onOpen: (partnerId: string) => void;
  onChanged: () => void;
}

const inputClass = "w-full border border-editorial-border rounded-md p-2.5 text-xs focus:outline-none focus:ring-1 focus:ring-editorial-primary";

// Tela inicial do gestor: dados pessoais + todas as pousadas que ele
// gerencia. Clicar numa pousada abre as abas de edição dela.
export default function GestorPousadaPanel({ supabase, userInfo, onUserInfoSaved, pousadas, activeId, onOpen, onChanged }: Props) {
  const { showToast } = useToast();
  const [name, setName] = useState(userInfo.name);
  const [phone, setPhone] = useState(userInfo.phone);
  const [savingInfo, setSavingInfo] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newLocation, setNewLocation] = useState("");
  const [creating, setCreating] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);

  const saveInfo = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingInfo(true);
    try {
      const { error } = await supabase.auth.updateUser({ data: { name: name.trim(), phone: phone.trim() } });
      if (error) {
        showToast(error.message || "Erro ao salvar seus dados.", "error");
        return;
      }
      onUserInfoSaved({ name: name.trim(), phone: phone.trim() });
      showToast("Dados pessoais salvos.", "success");
    } finally {
      setSavingInfo(false);
    }
  };

  const createPousada = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    try {
      const res = await adminFetch("/api/my-pousadas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName, location: newLocation }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        showToast(body.error || "Erro ao cadastrar pousada.", "error");
        return;
      }
      showToast(`${body.name} cadastrada. Complete as informações nas abas.`, "success");
      setNewName("");
      setNewLocation("");
      setShowCreate(false);
      onChanged();
      onOpen(body.partnerId);
    } finally {
      setCreating(false);
    }
  };

  const removePousada = async (p: PousadaRef) => {
    if (!confirm(`Remover a pousada "${p.name}"?\n\nEla sai do catálogo e vai para a lixeira — o administrador consegue restaurar em até 30 dias.`)) return;
    setRemovingId(p.partnerId);
    try {
      const res = await adminFetch(`/api/pousadas/${p.partnerId}`, { method: "DELETE" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        showToast(body.error || "Erro ao remover pousada.", "error");
        return;
      }
      showToast(body.message || "Pousada removida.", "success");
      onChanged();
    } finally {
      setRemovingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <form onSubmit={saveInfo} className="bg-white border border-editorial-border rounded-lg p-6 space-y-4">
        <h2 className="text-[10px] uppercase tracking-[0.15em] font-bold text-editorial-primary flex items-center gap-2">
          <UserRound className="h-3.5 w-3.5" /> Meus dados
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
          <div>
            <label className="block text-editorial-text font-semibold mb-1.5">Nome</label>
            <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="Seu nome" className={inputClass} />
          </div>
          <div>
            <label className="block text-editorial-text font-semibold mb-1.5">Telefone / WhatsApp</label>
            <input type="text" value={phone} onChange={e => setPhone(e.target.value)} placeholder="(00) 00000-0000" className={inputClass} />
          </div>
          <div className="sm:col-span-2">
            <label className="block text-editorial-text font-semibold mb-1.5">Email de acesso</label>
            <input type="email" value={userInfo.email} disabled className={`${inputClass} bg-editorial-secondary/40 text-editorial-muted`} />
          </div>
        </div>
        <button type="submit" disabled={savingInfo} className="bg-editorial-primary text-white text-[11px] uppercase tracking-widest font-bold px-4 py-2 rounded-md hover:opacity-90 transition disabled:opacity-60 cursor-pointer flex items-center gap-2">
          {savingInfo ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />} Salvar meus dados
        </button>
      </form>

      <div className="bg-white border border-editorial-border rounded-lg p-6 space-y-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h2 className="text-[10px] uppercase tracking-[0.15em] font-bold text-editorial-primary flex items-center gap-2">
            <Hotel className="h-3.5 w-3.5" /> Minhas Pousadas ({pousadas.length})
          </h2>
          <button type="button" onClick={() => setShowCreate(v => !v)} className="flex items-center gap-1.5 border border-editorial-primary text-editorial-primary text-[11px] uppercase tracking-widest font-bold px-3 py-1.5 rounded-md hover:bg-editorial-primary hover:text-white transition cursor-pointer">
            <Plus className="h-3.5 w-3.5" /> Nova pousada
          </button>
        </div>

        {showCreate && (
          <form onSubmit={createPousada} className="bg-editorial-secondary/40 border border-editorial-border rounded-md p-4 grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-3 items-end text-xs">
            <div>
              <label className="block text-editorial-text font-semibold mb-1.5">Nome da pousada</label>
              <input required type="text" value={newName} onChange={e => setNewName(e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className="block text-editorial-text font-semibold mb-1.5">Localização</label>
              <input required type="text" value={newLocation} onChange={e => setNewLocation(e.target.value)} placeholder="Ex: Pantanal Sul, MS" className={inputClass} />
            </div>
            <button type="submit" disabled={creating} className="bg-editorial-primary text-white text-[11px] uppercase tracking-widest font-bold px-4 py-2.5 rounded-md disabled:opacity-60 cursor-pointer flex items-center justify-center gap-2">
              {creating ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />} Cadastrar
            </button>
          </form>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {pousadas.map(p => {
            const isActive = p.partnerId === activeId;
            return (
              <div key={p.partnerId} className={`border rounded-lg p-4 flex items-center justify-between gap-3 transition ${isActive ? "border-editorial-primary bg-editorial-secondary/30" : "border-editorial-border"}`}>
                <button type="button" onClick={() => onOpen(p.partnerId)} className="flex-1 min-w-0 text-left cursor-pointer group">
                  <span className="font-semibold text-sm text-editorial-text group-hover:text-editorial-primary flex items-center gap-1 truncate">
                    {p.name} <ChevronRight className="h-4 w-4 flex-shrink-0" />
                  </span>
                  <span className="text-[10px] uppercase tracking-widest font-bold text-editorial-muted">{isActive ? "Selecionada" : "Abrir e editar"}</span>
                </button>
                <button
                  type="button"
                  onClick={() => removePousada(p)}
                  disabled={removingId === p.partnerId}
                  title="Remover pousada"
                  className="text-editorial-muted hover:text-red-600 transition cursor-pointer disabled:opacity-60 flex-shrink-0"
                >
                  {removingId === p.partnerId ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                </button>
              </div>
            );
          })}
          {pousadas.length === 0 && (
            <p className="text-editorial-muted text-xs italic sm:col-span-2">Você ainda não gerencia nenhuma pousada. Clique em "Nova pousada" para cadastrar a primeira.</p>
          )}
        </div>
      </div>
    </div>
  );
}
