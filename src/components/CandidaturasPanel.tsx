import React, { useState, useEffect } from "react";
import { Users, Building2, MapPin, Mail, Phone, Trash2, LoaderCircle, ShieldCheck, Copy, Check, UserPlus } from "lucide-react";
import { Candidatura } from "../types";
import { adminFetch } from "../lib/adminFetch";
import Pagination from "./Pagination";
import { usePagination } from "../lib/usePagination";

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

const TYPE_ICONS: Record<Candidatura["type"], React.ComponentType<{ className?: string }>> = {
  guia: Users,
  pousada: Building2,
  atracao: MapPin,
};

interface ApproveResult {
  candidaturaId: string;
  actionLink: string | null;
  loginCreated: boolean;
  emailSent: boolean;
  loginError?: string;
}

// Approving used to be just a status dropdown — changing it to "aprovado"
// didn't actually create anything. Now approval goes exclusively through
// POST /api/candidaturas/:id/approve (the "Aprovar e Criar Acesso" button
// below), which creates the real pousada/guides/atracoes record from what
// the candidate submitted AND their partner login in one step, so "aprovado"
// always means a working parceiro exists — not just a relabeled status.
export default function CandidaturasPanel() {
  const [candidaturas, setCandidaturas] = useState<Candidatura[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [filter, setFilter] = useState<"todos" | "guia" | "pousada" | "atracao">("todos");
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [approveError, setApproveError] = useState<{ id: string; message: string } | null>(null);
  const [approveResult, setApproveResult] = useState<ApproveResult | null>(null);
  const [linkCopied, setLinkCopied] = useState(false);

  const fetchData = async () => {
    setLoadError(false);
    try {
      const res = await adminFetch("/api/candidaturas");
      // A non-ok response returns { error: "..." } instead of an array —
      // setting state to that object instead of [] used to crash this
      // whole tab the moment .filter() ran against it below.
      if (res.ok) {
        setCandidaturas(await res.json());
      } else {
        setLoadError(true);
      }
    } catch (err) {
      console.error("Erro ao carregar candidaturas:", err);
      setLoadError(true);
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

  const handleApprove = async (c: Candidatura) => {
    const label = c.type === "pousada" ? (c.pousadaName || c.name) : c.type === "atracao" ? (c.atracaoName || c.name) : c.name;
    if (!confirm(`Aprovar "${label}"? Isso cria o perfil de parceiro e o login de acesso dele agora.`)) return;
    setApprovingId(c.id);
    setApproveError(null);
    setApproveResult(null);
    try {
      const res = await adminFetch(`/api/candidaturas/${c.id}/approve`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setApproveError({ id: c.id, message: data.error || "Erro ao aprovar candidatura." });
        return;
      }
      setApproveResult({ candidaturaId: c.id, actionLink: data.actionLink || null, loginCreated: !!data.loginCreated, emailSent: !!data.emailSent, loginError: data.loginError || undefined });
      fetchData();
    } catch {
      setApproveError({ id: c.id, message: "Não foi possível aprovar agora. Tente novamente." });
    } finally {
      setApprovingId(null);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Excluir esta candidatura?")) return;
    await adminFetch(`/api/candidaturas/${id}`, { method: "DELETE" });
    fetchData();
  };

  const filtered = candidaturas.filter(c => filter === "todos" || c.type === filter);
  const pagination = usePagination(filtered, 15);

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
      {loadError && (
        <div className="bg-amber-50 border border-amber-200 text-amber-900 text-xs px-4 py-3 rounded-lg mb-4">
          Não foi possível carregar as candidaturas. Tente sair e entrar de novo no painel — se persistir, a tabela <span className="font-mono">candidaturas</span> pode não existir ainda no Supabase (copie o script de criação em <span className="font-mono">/api/supabase/sql</span>, acessível logado como admin, e rode no SQL Editor do seu projeto).
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <p className="text-editorial-muted text-xs">
          Cadastros enviados pelo formulário público <span className="font-mono">/seja-parceiro</span> — guias, pousadas e atrações interessados em virar parceiros.
        </p>
        <div className="flex gap-2">
          {(["todos", "guia", "pousada", "atracao"] as const).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 text-[10px] uppercase tracking-widest font-bold border transition cursor-pointer ${
                filter === f ? "bg-editorial-primary text-white border-editorial-primary" : "bg-white text-editorial-muted border-editorial-border hover:text-editorial-primary"
              }`}
            >
              {f === "todos" ? "Todos" : f === "guia" ? "Guias" : f === "pousada" ? "Pousadas" : "Atrações"}
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
          {pagination.pageItems.map(c => {
            const TypeIcon = TYPE_ICONS[c.type];
            const displayName = c.type === "pousada" ? (c.pousadaName || c.name) : c.type === "atracao" ? (c.atracaoName || c.name) : c.name;
            const alreadyPartner = !!c.partnerId;
            return (
              <div key={c.id} className="bg-white border border-editorial-border p-5">
                <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
                  <div className="flex items-center gap-2">
                    <TypeIcon className="h-4 w-4 text-editorial-primary" />
                    <span className="text-sm font-bold text-editorial-text">{displayName}</span>
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

                  {c.type === "pousada" && (
                    <>
                      {c.name && c.pousadaName && <span>Responsável: {c.name}</span>}
                      {c.location && <span>Localidade: {c.location}</span>}
                      {c.capacity && <span>Capacidade: {c.capacity} hóspedes</span>}
                    </>
                  )}
                  {c.type === "atracao" && (
                    <>
                      {c.name && c.atracaoName && <span>Responsável: {c.name}</span>}
                      {c.atracaoType && <span>Tipo: {c.atracaoType === "restaurante" ? "Restaurante" : "Parada Legal"}</span>}
                      {c.location && <span>Localidade: {c.location}</span>}
                    </>
                  )}
                  {c.type === "guia" && (
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

                {approveError?.id === c.id && (
                  <p className="text-red-600 text-xs font-medium mb-3">{approveError.message}</p>
                )}

                {approveResult?.candidaturaId === c.id && (
                  <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 text-xs space-y-2 mb-3">
                    <p className="text-emerald-900 font-semibold flex items-center gap-1.5"><ShieldCheck className="h-3.5 w-3.5" /> Perfil de parceiro criado!</p>
                    {approveResult.actionLink ? (
                      <>
                        <p className="text-emerald-800">
                          {approveResult.emailSent
                            ? <>Convite enviado por email automaticamente! Se não chegar, use este link como reserva pra ele acessar o painel em <span className="font-mono">/parceiro</span>:</>
                            : <>Não foi possível confirmar o envio automático — envie este link pro parceiro definir a própria senha e acessar o painel dele em <span className="font-mono">/parceiro</span>:</>}
                        </p>
                        <div className="flex items-center gap-2">
                          <input readOnly value={approveResult.actionLink} onFocus={e => e.target.select()} className="flex-1 min-w-0 bg-white border border-emerald-200 px-2 py-1.5 rounded font-mono text-[10px] truncate" />
                          <button
                            type="button"
                            onClick={() => { navigator.clipboard.writeText(approveResult.actionLink!); setLinkCopied(true); setTimeout(() => setLinkCopied(false), 2000); }}
                            className="flex-shrink-0 bg-emerald-600 text-white font-bold px-2.5 py-1.5 rounded hover:bg-emerald-700 transition cursor-pointer flex items-center gap-1"
                          >
                            {linkCopied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                          </button>
                        </div>
                      </>
                    ) : (
                      <div className="space-y-1">
                        <p className="text-emerald-800">O perfil foi criado, mas não foi possível gerar o login agora — abra o perfil dele na aba correspondente e use "Acesso de parceiro" para convidar manualmente.</p>
                        {approveResult.loginError && (
                          <p className="text-amber-800 bg-amber-50 border border-amber-200 rounded px-2 py-1.5 font-mono text-[10px]">{approveResult.loginError}</p>
                        )}
                      </div>
                    )}
                  </div>
                )}

                <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-editorial-border/60">
                  <div className="flex items-center gap-2">
                    <select
                      value={c.status === "aprovado" ? "aprovado" : c.status}
                      onChange={e => updateStatus(c.id, e.target.value as Candidatura["status"])}
                      disabled={alreadyPartner}
                      className="border border-editorial-border px-3 py-1.5 text-[11px] uppercase tracking-widest font-bold rounded-md bg-white cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <option value="pendente">Pendente</option>
                      <option value="contatado">Contatado</option>
                      <option value="rejeitado">Rejeitado</option>
                      {alreadyPartner && <option value="aprovado">Aprovado</option>}
                    </select>
                    {!alreadyPartner && (
                      <button
                        onClick={() => handleApprove(c)}
                        disabled={approvingId === c.id}
                        className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] uppercase tracking-widest font-bold px-3 py-1.5 rounded-md transition disabled:opacity-60 cursor-pointer"
                      >
                        {approvingId === c.id ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <UserPlus className="h-3.5 w-3.5" />}
                        Aprovar e Criar Acesso
                      </button>
                    )}
                  </div>
                  <button onClick={() => handleDelete(c.id)} className="flex items-center gap-1.5 text-red-600 hover:text-red-800 text-[11px] uppercase tracking-widest font-bold cursor-pointer">
                    <Trash2 className="h-3.5 w-3.5" /> Excluir
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
      <Pagination
        page={pagination.page}
        totalPages={pagination.totalPages}
        totalItems={pagination.totalItems}
        onPageChange={pagination.setPage}
      />
    </div>
  );
}
