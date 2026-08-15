import React, { useState, useEffect } from "react";
import { ShieldCheck, Crown, UserPlus, UserMinus, Trash2, LoaderCircle, Copy, Check, ThumbsUp, ThumbsDown, Clock } from "lucide-react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseClient } from "../lib/supabaseClient";
import { isChiefUser } from "../lib/authRoles";
import { adminFetch } from "../lib/adminFetch";

interface AdminUser {
  id: string;
  email: string;
  createdAt: string;
  lastSignInAt: string | null;
  isChief: boolean;
}

interface ProposalVote {
  proposal_id: string;
  chief_id: string;
  chief_email: string;
  approve: boolean;
  voted_at: string;
}

interface Proposal {
  id: string;
  email: string;
  action: "grant" | "revoke";
  target_user_id: string | null;
  proposed_by_id: string;
  proposed_by_email: string;
  status: "pending" | "approved" | "rejected" | "cancelled";
  result_message: string | null;
  created_at: string;
  resolved_at: string | null;
  votes: ProposalVote[];
}

const REQUIRED_VOTES: Record<"grant" | "revoke", number> = { grant: 3, revoke: 2 };

// Conceder acesso de administrador não é mais uma ação unilateral: qualquer
// admin propõe (email pra conceder, ou remover o acesso de outro admin), mas
// só se efetiva com o voto dos 3 admins-chefe — unanimidade (3/3) pra
// conceder, maioria (2/3) pra revogar. Um "não" de qualquer chefe já
// rejeita uma proposta de concessão na hora. Ver ADMIN GOVERNANCE em
// server.ts para a lógica completa.
export default function AdminUsersPanel() {
  const [supabase, setSupabase] = useState<SupabaseClient | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [amIChief, setAmIChief] = useState(false);

  const [admins, setAdmins] = useState<AdminUser[]>([]);
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [loading, setLoading] = useState(true);
  const [unavailable, setUnavailable] = useState(false);

  const [email, setEmail] = useState("");
  const [proposing, setProposing] = useState(false);
  const [error, setError] = useState("");

  const [newAccessLink, setNewAccessLink] = useState<{ email: string; link: string | null } | null>(null);
  const [linkCopied, setLinkCopied] = useState(false);
  const [busyProposalId, setBusyProposalId] = useState<string | null>(null);

  useEffect(() => {
    getSupabaseClient().then(client => {
      setSupabase(client);
      client.auth.getSession().then(({ data }) => {
        setCurrentUserId(data.session?.user?.id || null);
        setAmIChief(isChiefUser(data.session?.user));
      });
    });
  }, []);

  const fetchAll = async () => {
    try {
      const [adminsRes, proposalsRes] = await Promise.all([
        adminFetch("/api/admin/users"),
        adminFetch("/api/admin/proposals"),
      ]);
      if (adminsRes.status === 503 || proposalsRes.status === 503) {
        setUnavailable(true);
        return;
      }
      if (adminsRes.ok) setAdmins(await adminsRes.json());
      if (proposalsRes.ok) setProposals(await proposalsRes.json());
    } catch (err) {
      console.error("Erro ao carregar administradores:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchAll(); }, []);

  const handlePropose = async (e: React.FormEvent) => {
    e.preventDefault();
    setProposing(true);
    setError("");
    try {
      const res = await adminFetch("/api/admin/proposals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "grant", email }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Erro ao propor administrador.");
        return;
      }
      setEmail("");
      fetchAll();
    } catch (err) {
      setError("Não foi possível propor agora. Tente novamente.");
    } finally {
      setProposing(false);
    }
  };

  const handleProposeRevoke = async (admin: AdminUser) => {
    if (!confirm(`Propor a remoção do acesso administrativo de ${admin.email}? Isso precisa do voto de 2 dos 3 admins-chefe pra valer.`)) return;
    try {
      const res = await adminFetch("/api/admin/proposals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "revoke", targetUserId: admin.id }),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || "Erro ao propor remoção.");
        return;
      }
      fetchAll();
    } catch (err) {
      alert("Não foi possível propor a remoção agora.");
    }
  };

  const handleVote = async (proposal: Proposal, approve: boolean) => {
    setBusyProposalId(proposal.id);
    try {
      const res = await adminFetch(`/api/admin/proposals/${proposal.id}/vote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ approve }),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || "Erro ao registrar voto.");
        return;
      }
      if (data.status === "approved" && data.actionLink) {
        setNewAccessLink({ email: proposal.email, link: data.actionLink });
      } else if (data.status === "approved") {
        setNewAccessLink({ email: proposal.email, link: null });
      } else if (data.status === "error") {
        alert(data.error || "A votação concluiu, mas houve um erro ao efetivar a ação.");
      }
      fetchAll();
    } catch (err) {
      alert("Não foi possível registrar o voto agora.");
    } finally {
      setBusyProposalId(null);
    }
  };

  const handleCancel = async (proposal: Proposal) => {
    if (!confirm("Cancelar esta proposta?")) return;
    setBusyProposalId(proposal.id);
    try {
      await adminFetch(`/api/admin/proposals/${proposal.id}`, { method: "DELETE" });
      fetchAll();
    } finally {
      setBusyProposalId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-editorial-muted gap-2">
        <LoaderCircle className="h-5 w-5 animate-spin" />
        <span className="text-xs uppercase tracking-widest font-bold">Carregando administradores...</span>
      </div>
    );
  }

  if (unavailable) {
    return (
      <div className="bg-white border border-editorial-border p-8 text-center text-editorial-muted text-sm">
        Gestão de administradores requer <span className="font-mono text-xs">SUPABASE_SERVICE_ROLE_KEY</span> configurada no ambiente do backend.
      </div>
    );
  }

  const pendingProposals = proposals.filter(p => p.status === "pending");
  const resolvedProposals = proposals.filter(p => p.status !== "pending").slice(0, 10);

  return (
    <div className="space-y-6">
      <form onSubmit={handlePropose} className="bg-white border border-editorial-border p-6 space-y-3">
        <h3 className="font-bold text-sm text-editorial-text flex items-center gap-2">
          <UserPlus className="h-4 w-4 text-editorial-primary" /> Propor novo administrador
        </h3>
        <p className="text-editorial-muted text-xs">
          Conceder acesso não é imediato: precisa do voto favorável dos 3 admins-chefe (unanimidade) antes de valer.
          Se o email já tem cadastro no site (turista ou parceiro), esse perfil é mantido — só se acrescenta o acesso de admin.
        </p>
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            type="email"
            required
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="email@exemplo.com"
            className="flex-1 bg-zinc-50 border border-zinc-200 rounded-lg p-2.5 text-sm focus:outline-none focus:border-emerald-500"
          />
          <button
            type="submit"
            disabled={proposing}
            className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold uppercase tracking-widest px-5 py-2.5 rounded-lg transition disabled:opacity-60 cursor-pointer flex items-center justify-center gap-2"
          >
            {proposing ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
            Propor
          </button>
        </div>
        {error && <p className="text-red-600 text-xs font-medium">{error}</p>}

        {newAccessLink && (
          <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4 text-xs">
            <p className="font-bold text-emerald-900 mb-1">Proposta aprovada — {newAccessLink.email} agora é administrador!</p>
            {newAccessLink.link ? (
              <>
                <p className="text-emerald-800 mb-2">Envie este link a essa pessoa (WhatsApp, email) para que ela defina a própria senha e acesse o painel:</p>
                <div className="flex items-center gap-2">
                  <input
                    readOnly
                    value={newAccessLink.link}
                    onFocus={e => e.target.select()}
                    className="flex-1 min-w-0 bg-white border border-emerald-200 px-2.5 py-2 rounded-md font-mono text-[11px] truncate"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(newAccessLink.link || "");
                      setLinkCopied(true);
                      setTimeout(() => setLinkCopied(false), 2000);
                    }}
                    className="flex-shrink-0 bg-emerald-600 text-white font-bold px-3 py-2 rounded-md hover:bg-emerald-700 transition cursor-pointer flex items-center gap-1"
                  >
                    {linkCopied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                    {linkCopied ? "Copiado!" : "Copiar"}
                  </button>
                </div>
              </>
            ) : (
              <p className="text-amber-700">Não foi possível gerar o link de acesso automaticamente — peça para a pessoa usar "Esqueci minha senha" na tela de login administrativo com este email.</p>
            )}
          </div>
        )}
      </form>

      {pendingProposals.length > 0 && (
        <div className="bg-white border border-editorial-border p-6 space-y-4">
          <h3 className="font-bold text-sm text-editorial-text flex items-center gap-2">
            <Clock className="h-4 w-4 text-amber-500" /> Propostas pendentes de votação
          </h3>
          {pendingProposals.map(proposal => {
            const required = REQUIRED_VOTES[proposal.action];
            const yesVotes = proposal.votes.filter(v => v.approve).length;
            const myVote = proposal.votes.find(v => v.chief_id === currentUserId);
            return (
              <div key={proposal.id} className="border border-zinc-200 rounded-lg p-4 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-bold text-sm text-zinc-900">
                      {proposal.action === "grant" ? "Conceder admin a" : "Remover admin de"} {proposal.email}
                    </p>
                    <p className="text-[11px] text-editorial-muted">Proposto por {proposal.proposed_by_email}</p>
                  </div>
                  <span className="text-[10px] uppercase tracking-widest font-bold bg-amber-50 text-amber-700 px-2 py-1 rounded whitespace-nowrap">
                    {yesVotes}/{required} votos
                  </span>
                </div>

                {proposal.votes.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {proposal.votes.map(v => (
                      <span
                        key={v.chief_id}
                        className={`text-[10px] font-bold px-2 py-1 rounded-full flex items-center gap-1 ${v.approve ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}
                      >
                        {v.approve ? <ThumbsUp className="h-3 w-3" /> : <ThumbsDown className="h-3 w-3" />}
                        {v.chief_email}
                      </span>
                    ))}
                  </div>
                )}

                <div className="flex flex-wrap items-center gap-2">
                  {amIChief && !myVote && (
                    <>
                      <button
                        onClick={() => handleVote(proposal, true)}
                        disabled={busyProposalId === proposal.id}
                        className="bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold uppercase tracking-widest px-3 py-1.5 rounded-md transition disabled:opacity-60 cursor-pointer flex items-center gap-1.5"
                      >
                        <ThumbsUp className="h-3.5 w-3.5" /> Aprovar
                      </button>
                      <button
                        onClick={() => handleVote(proposal, false)}
                        disabled={busyProposalId === proposal.id}
                        className="bg-red-500 hover:bg-red-600 text-white text-[11px] font-bold uppercase tracking-widest px-3 py-1.5 rounded-md transition disabled:opacity-60 cursor-pointer flex items-center gap-1.5"
                      >
                        <ThumbsDown className="h-3.5 w-3.5" /> Rejeitar
                      </button>
                    </>
                  )}
                  {amIChief && myVote && (
                    <span className="text-[11px] text-editorial-muted italic">Você já votou nesta proposta.</span>
                  )}
                  <button
                    onClick={() => handleCancel(proposal)}
                    disabled={busyProposalId === proposal.id}
                    className="text-zinc-400 hover:text-red-600 transition cursor-pointer text-[11px] font-bold uppercase tracking-widest ml-auto"
                  >
                    Cancelar proposta
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="bg-white border border-editorial-border overflow-hidden">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="bg-zinc-100 text-zinc-500 uppercase font-bold border-b border-zinc-200 text-[10px] tracking-wider">
              <th className="p-4">Email</th>
              <th className="p-4">Criado em</th>
              <th className="p-4">Último acesso</th>
              <th className="p-4 text-right">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-200">
            {admins.map(admin => (
              <tr key={admin.id} className="hover:bg-zinc-50/50">
                <td className="p-4 font-bold text-zinc-900">
                  <span className="flex items-center gap-2">
                    {admin.isChief ? <Crown className="h-3.5 w-3.5 text-amber-500" /> : <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />}
                    {admin.email}
                    {admin.isChief && <span className="text-[9px] uppercase tracking-widest font-bold text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded">Chefe</span>}
                  </span>
                </td>
                <td className="p-4 text-zinc-600">{new Date(admin.createdAt).toLocaleDateString("pt-BR")}</td>
                <td className="p-4 text-zinc-600">{admin.lastSignInAt ? new Date(admin.lastSignInAt).toLocaleDateString("pt-BR") : "Nunca acessou"}</td>
                <td className="p-4 text-right">
                  <button
                    onClick={() => handleProposeRevoke(admin)}
                    className="text-red-400 hover:text-red-600 transition cursor-pointer inline-flex items-center gap-1 font-bold"
                    title="Propor remoção de acesso administrativo"
                  >
                    <UserMinus className="h-3.5 w-3.5" /> Propor remoção
                  </button>
                </td>
              </tr>
            ))}
            {admins.length === 0 && (
              <tr>
                <td colSpan={4} className="text-center p-8 text-zinc-400">Nenhum administrador encontrado.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {resolvedProposals.length > 0 && (
        <div className="bg-white border border-editorial-border overflow-hidden">
          <div className="p-4 border-b border-zinc-200">
            <h3 className="font-bold text-sm text-editorial-text flex items-center gap-2">
              <Trash2 className="h-4 w-4 text-editorial-muted" /> Histórico recente de propostas
            </h3>
          </div>
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="bg-zinc-100 text-zinc-500 uppercase font-bold border-b border-zinc-200 text-[10px] tracking-wider">
                <th className="p-3">Email</th>
                <th className="p-3">Ação</th>
                <th className="p-3">Status</th>
                <th className="p-3">Resolvida em</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200">
              {resolvedProposals.map(p => (
                <tr key={p.id}>
                  <td className="p-3 text-zinc-700">{p.email}</td>
                  <td className="p-3 text-zinc-600">{p.action === "grant" ? "Conceder" : "Remover"}</td>
                  <td className="p-3">
                    <span className={`text-[10px] uppercase tracking-widest font-bold px-2 py-1 rounded ${
                      p.status === "approved" ? "bg-emerald-50 text-emerald-700" :
                      p.status === "rejected" ? "bg-red-50 text-red-700" :
                      "bg-zinc-100 text-zinc-500"
                    }`}>
                      {p.status === "approved" ? "Aprovada" : p.status === "rejected" ? "Rejeitada" : "Cancelada"}
                    </span>
                    {p.result_message && <span className="block text-[10px] text-red-500 mt-1">{p.result_message}</span>}
                  </td>
                  <td className="p-3 text-zinc-500">{p.resolved_at ? new Date(p.resolved_at).toLocaleString("pt-BR") : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
