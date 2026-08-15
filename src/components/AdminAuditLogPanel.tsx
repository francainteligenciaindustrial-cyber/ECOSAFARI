import React, { useState, useEffect, useMemo } from "react";
import { ScrollText, LoaderCircle, RefreshCw, Search } from "lucide-react";
import { adminFetch } from "../lib/adminFetch";

interface AuditLogEntry {
  id: string;
  actor_id: string;
  actor_email: string;
  action: string;
  resource_type: string;
  resource_id: string | null;
  resource_label: string | null;
  created_at: string;
}

const ACTION_LABELS: Record<string, string> = {
  create: "Criou",
  update: "Editou",
  update_status: "Mudou status",
  delete: "Excluiu",
  approve: "Aprovou",
  propose_grant_admin: "Propôs conceder admin",
  propose_revoke_admin: "Propôs remover admin",
  vote_approve: "Votou a favor",
  vote_reject: "Votou contra",
  grant_admin: "Concedeu admin",
  revoke_admin: "Removeu admin",
  cancel_admin_proposal: "Cancelou proposta",
  invite_partner: "Convidou parceiro",
  revoke_partner_access: "Revogou acesso de parceiro",
  purge_fake_data: "Limpou dados fictícios",
};

const ACTION_COLORS: Record<string, string> = {
  create: "bg-emerald-50 text-emerald-700",
  approve: "bg-emerald-50 text-emerald-700",
  grant_admin: "bg-emerald-50 text-emerald-700",
  vote_approve: "bg-emerald-50 text-emerald-700",
  update: "bg-blue-50 text-blue-700",
  update_status: "bg-blue-50 text-blue-700",
  invite_partner: "bg-blue-50 text-blue-700",
  delete: "bg-red-50 text-red-700",
  revoke_admin: "bg-red-50 text-red-700",
  revoke_partner_access: "bg-red-50 text-red-700",
  vote_reject: "bg-red-50 text-red-700",
  purge_fake_data: "bg-red-50 text-red-700",
};

const RESOURCE_LABELS: Record<string, string> = {
  pousada: "Pousada",
  guide: "Guia",
  atracao: "Atração",
  booking: "Reserva",
  species: "Espécie",
  turista: "Turista",
  roteiro: "Roteiro",
  reserva_roteiro: "Reserva de roteiro",
  pagamento: "Pagamento",
  guia_turistico: "Guia turístico",
  candidatura: "Candidatura",
  admin: "Administrador",
  admin_proposal: "Proposta de admin",
  partner_access: "Acesso de parceiro",
  integrity: "Integridade de dados",
};

// Toda ação administrativa que altera dados fica registrada aqui — quem fez,
// o quê, em qual registro e quando — visível para qualquer admin. Ver
// logAdminAction/GET /api/admin/audit-log em server.ts.
export default function AdminAuditLogPanel() {
  const [entries, setEntries] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState("");

  const fetchLog = async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    try {
      const res = await adminFetch("/api/admin/audit-log");
      if (res.ok) setEntries(await res.json());
    } catch (err) {
      console.error("Erro ao carregar log de auditoria:", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => { fetchLog(); }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return entries;
    return entries.filter(e =>
      e.actor_email.toLowerCase().includes(q) ||
      (e.resource_label || "").toLowerCase().includes(q) ||
      (RESOURCE_LABELS[e.resource_type] || e.resource_type).toLowerCase().includes(q) ||
      (ACTION_LABELS[e.action] || e.action).toLowerCase().includes(q)
    );
  }, [entries, search]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-editorial-muted gap-2">
        <LoaderCircle className="h-5 w-5 animate-spin" />
        <span className="text-xs uppercase tracking-widest font-bold">Carregando log de auditoria...</span>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <h3 className="font-bold text-sm text-editorial-text flex items-center gap-2">
          <ScrollText className="h-4 w-4 text-editorial-primary" /> Log de Auditoria
        </h3>
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <div className="relative flex-1 sm:flex-none">
            <Search className="h-3.5 w-3.5 text-zinc-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Buscar por admin, ação ou registro..."
              className="pl-8 pr-3 py-2 text-xs bg-zinc-50 border border-zinc-200 rounded-lg focus:outline-none focus:border-emerald-500 w-full sm:w-72"
            />
          </div>
          <button
            onClick={() => fetchLog(true)}
            disabled={refreshing}
            className="flex-shrink-0 p-2 text-zinc-400 hover:text-editorial-primary transition cursor-pointer disabled:opacity-50"
            title="Atualizar"
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      <div className="bg-white border border-editorial-border overflow-hidden">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="bg-zinc-100 text-zinc-500 uppercase font-bold border-b border-zinc-200 text-[10px] tracking-wider">
              <th className="p-3">Quando</th>
              <th className="p-3">Admin</th>
              <th className="p-3">Ação</th>
              <th className="p-3">Registro</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-200">
            {filtered.map(entry => (
              <tr key={entry.id} className="hover:bg-zinc-50/50">
                <td className="p-3 text-zinc-500 whitespace-nowrap">{new Date(entry.created_at).toLocaleString("pt-BR")}</td>
                <td className="p-3 font-bold text-zinc-900 whitespace-nowrap">{entry.actor_email}</td>
                <td className="p-3">
                  <span className={`text-[10px] uppercase tracking-widest font-bold px-2 py-1 rounded whitespace-nowrap ${ACTION_COLORS[entry.action] || "bg-zinc-100 text-zinc-600"}`}>
                    {ACTION_LABELS[entry.action] || entry.action}
                  </span>
                </td>
                <td className="p-3 text-zinc-700">
                  <span className="text-zinc-400">{RESOURCE_LABELS[entry.resource_type] || entry.resource_type}:</span>{" "}
                  {entry.resource_label || entry.resource_id || "—"}
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={4} className="text-center p-8 text-zinc-400">
                  {entries.length === 0 ? "Nenhuma ação registrada ainda." : "Nenhum resultado para esta busca."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
