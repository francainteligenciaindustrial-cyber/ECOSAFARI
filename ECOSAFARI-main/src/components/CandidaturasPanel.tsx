import React, { useState, useEffect } from "react";
import { Users, Building2, Mail, Phone, Trash2, LoaderCircle } from "lucide-react";
import { Candidatura } from "../types";
import { adminFetch } from "../lib/adminFetch";

const STATUS_LABELS: Record<Candidatura["status"], string> = {
  pendente: "Pendente",
  contatado: "Contatado",
  aprovado: "Aprovado",
  rejeitado: "Rejeitado",
};

const STATUS_COLORS: Record<Candidatura["status"], string> = {
  pendente: "bg-amber-50 text-amber-900 border-amber-200",
  contatado: "bg-blue-50 text-blue-900 border-blue-200",
  aprovado: "bg-emerald-50 text-emerald-900 border-emerald-200",
  rejeitado: "bg-zinc-100 text-zinc-600 border-zinc-200",
};

export default function CandidaturasPanel() {
  const [candidaturas, setCandidaturas] = useState<Candidatura[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"todos" | "guia" | "pousada">("todos");

  const fetchData = async () => {
    try {
      const res = await adminFetch("/api/candidaturas");
      setCandidaturas(await res.json());
    } catch (err) {
      console.error("Erro ao carregar candidaturas:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const updateStatus = async (id: string, status: Candidatura["status"]) => {
    await adminFetch(`/api/candidaturas/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    fetchData();
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Excluir esta candidatura?")) return;
    await adminFetch(`/api/candidaturas/${id}`, { method: "DELETE" });
    fetchData();
  };

  const filtered = candidaturas.filter(c => filter === "todos" || c.type === filter);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-editorial-muted gap-2">
        <LoaderCircle className="h-5 w-5 animate-spin" />
        <span className="text-xs uppercase tracking-widest font-bold">Carregando candidaturas...</span>
      </div>
    );
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <p className="text-editorial-muted text-xs">
          Cadastros enviados pelo formulário público <span className="font-mono">/seja-parceiro</span> — guias e pousadas interessados em virar parceiros.
        </p>
        <div className="flex gap-2">
          {(["todos", "guia", "pousada"] as const).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 text-[10px] uppercase tracking-widest font-bold border transition cursor-pointer ${
                filter === f ? "bg-editorial-primary text-white border-editorial-primary" : "bg-white text-editorial-muted border-editorial-border hover:text-editorial-primary"
              }`}
            >
              {f === "todos" ? "Todos" : f === "guia" ? "Guias" : "Pousadas"}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="bg-white border border-editorial-border p-10 text-center text-editorial-muted text-sm">
          Nenhuma candidatura recebida ainda.
        </div>
      ) : (
        <div className="space-y-4">
          {filtered.map(c => (
            <div key={c.id} className="bg-white border border-editorial-border p-5">
              <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
                <div className="flex items-center gap-2">
                  {c.type === "guia" ? <Users className="h-4 w-4 text-editorial-primary" /> : <Building2 className="h-4 w-4 text-editorial-primary" />}
                  <span className="text-sm font-bold text-editorial-text">
                    {c.type === "pousada" ? (c.pousadaName || c.name) : c.name}
                  </span>
                  <span className={`text-[9px] uppercase tracking-widest font-bold border px-2 py-0.5 rounded-full ${STATUS_COLORS[c.status]}`}>
                    {STATUS_LABELS[c.status]}
                  </span>
                </div>
                <span className="text-[10px] text-editorial-muted">
                  {new Date(c.dateCreated).toLocaleDateString('pt-BR')}
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 text-xs text-editorial-muted mb-3">
                <a href={`mailto:${c.email}`} className="flex items-center gap-1.5 hover:text-editorial-primary transition"><Mail className="h-3 w-3" /> {c.email}</a>
                <a href={`https://wa.me/${(c.phone || "").replace(/\D/g, "")}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 hover:text-editorial-primary transition"><Phone className="h-3 w-3" /> {c.phone}</a>

                {c.type === "pousada" ? (
                  <>
                    {c.name && c.pousadaName && <span>Responsável: {c.name}</span>}
                    {c.location && <span>Localidade: {c.location}</span>}
                    {c.capacity && <span>Capacidade: {c.capacity} hóspedes</span>}
                  </>
                ) : (
                  <>
                    {c.languages && <span>Idiomas: {c.languages}</span>}
                    {c.availability && <span>Disponibilidade: {c.availability}</span>}
                    {c.age && <span>Idade: {c.age}</span>}
                    {c.experienceYears !== undefined && <span>Experiência: {c.experienceYears} anos</span>}
                    {c.specialty && <span>Especialidade: {c.specialty}</span>}
                  </>
                )}
              </div>

              {c.message && (
                <p className="text-xs text-editorial-text bg-editorial-secondary border border-editorial-border p-3 mb-3 italic">"{c.message}"</p>
              )}

              <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-editorial-border/60">
                <select
                  value={c.status}
                  onChange={e => updateStatus(c.id, e.target.value as Candidatura["status"])}
                  className="border border-editorial-border px-3 py-1.5 text-[11px] uppercase tracking-widest font-bold rounded-md bg-white cursor-pointer"
                >
                  <option value="pendente">Pendente</option>
                  <option value="contatado">Contatado</option>
                  <option value="aprovado">Aprovado</option>
                  <option value="rejeitado">Rejeitado</option>
                </select>
                <button onClick={() => handleDelete(c.id)} className="flex items-center gap-1.5 text-red-600 hover:text-red-800 text-[11px] uppercase tracking-widest font-bold cursor-pointer">
                  <Trash2 className="h-3.5 w-3.5" /> Excluir
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
