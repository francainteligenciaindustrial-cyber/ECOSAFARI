import React, { useState, useEffect } from "react";
import { X, UserPlus, Trash2, LoaderCircle, Copy, Check, ShieldCheck } from "lucide-react";
import { PartnerType } from "../types";
import { adminFetch } from "../lib/adminFetch";

interface PartnerAccessUser {
  id: string;
  email: string;
  createdAt: string;
  lastSignInAt: string | null;
}

interface PartnerAccessManagerProps {
  partnerType: PartnerType;
  partnerId: string;
  partnerLabel: string; // nome da pousada/atração/guia, só para exibição
  onClose: () => void;
}

// Reusable "who can self-edit this specific pousada/atração/guia" panel —
// invite by email (generates a recovery link the admin copies and sends
// manually, same pattern as AdminUsersPanel) and revoke. Opened from each
// partner's row in the admin CRUD tables via a key icon.
export default function PartnerAccessManager({ partnerType, partnerId, partnerLabel, onClose }: PartnerAccessManagerProps) {
  const [users, setUsers] = useState<PartnerAccessUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [unavailable, setUnavailable] = useState(false);
  const [email, setEmail] = useState("");
  const [inviting, setInviting] = useState(false);
  const [error, setError] = useState("");
  const [newAccessLink, setNewAccessLink] = useState<string | null>(null);
  const [newAccessEmailSent, setNewAccessEmailSent] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);

  const fetchUsers = async () => {
    try {
      const res = await adminFetch(`/api/partners/${partnerType}/${partnerId}/access`);
      if (res.status === 503) { setUnavailable(true); return; }
      if (res.ok) setUsers(await res.json());
    } catch (err) {
      console.error("Erro ao carregar acessos de parceiro:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchUsers(); }, [partnerType, partnerId]);

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    setInviting(true);
    setError("");
    setNewAccessLink(null);
    try {
      const res = await adminFetch("/api/partners/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, partnerType, partnerId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Erro ao convidar parceiro.");
        return;
      }
      setNewAccessLink(data.actionLink || null);
      setNewAccessEmailSent(!!data.emailSent);
      setEmail("");
      fetchUsers();
    } catch (err) {
      setError("Não foi possível convidar agora. Tente novamente.");
    } finally {
      setInviting(false);
    }
  };

  const handleRevoke = async (user: PartnerAccessUser) => {
    if (!confirm(`Remover o acesso de ${user.email} a "${partnerLabel}"?`)) return;
    const res = await adminFetch(`/api/partners/access/${user.id}`, { method: "DELETE" });
    if (res.ok) fetchUsers();
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white border border-zinc-200 rounded-2xl shadow-xl w-full max-w-lg max-h-[85vh] overflow-y-auto p-6 space-y-5">
        <div className="flex items-center justify-between border-b border-zinc-100 pb-3">
          <h3 className="font-bold text-base text-zinc-900">Acesso de parceiro — {partnerLabel}</h3>
          <button onClick={onClose} className="text-zinc-400 hover:text-zinc-700 transition cursor-pointer">
            <X className="h-5 w-5" />
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-10 text-zinc-400 gap-2">
            <LoaderCircle className="h-5 w-5 animate-spin" />
          </div>
        ) : unavailable ? (
          <div className="bg-zinc-50 border border-zinc-200 rounded-lg p-4 text-xs text-zinc-500">
            Requer <span className="font-mono">SUPABASE_SERVICE_ROLE_KEY</span> configurada no backend.
          </div>
        ) : (
          <>
            <form onSubmit={handleInvite} className="space-y-2">
              <label className="block text-[11px] font-semibold text-zinc-700">Convidar por email</label>
              <div className="flex gap-2">
                <input
                  type="email" required value={email} onChange={e => setEmail(e.target.value)}
                  placeholder="dono@exemplo.com"
                  className="flex-1 bg-zinc-50 border border-zinc-200 rounded-lg p-2 text-xs focus:outline-none focus:border-emerald-500"
                />
                <button
                  type="submit" disabled={inviting}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-4 py-2 rounded-lg transition disabled:opacity-60 cursor-pointer flex items-center gap-1.5"
                >
                  {inviting ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
                  Convidar
                </button>
              </div>
              {error && <p className="text-red-600 text-xs font-medium">{error}</p>}
            </form>

            {newAccessLink && (
              <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 text-xs space-y-2">
                <p className="text-emerald-900 font-semibold">
                  {newAccessEmailSent
                    ? "Convite enviado por email automaticamente! Se não chegar, use este link como reserva:"
                    : "Não foi possível confirmar o envio automático — envie este link pro parceiro definir a própria senha:"}
                </p>
                <div className="flex items-center gap-2">
                  <input readOnly value={newAccessLink} onFocus={e => e.target.select()} className="flex-1 min-w-0 bg-white border border-emerald-200 px-2 py-1.5 rounded font-mono text-[10px] truncate" />
                  <button
                    type="button"
                    onClick={() => { navigator.clipboard.writeText(newAccessLink); setLinkCopied(true); setTimeout(() => setLinkCopied(false), 2000); }}
                    className="flex-shrink-0 bg-emerald-600 text-white font-bold px-2.5 py-1.5 rounded hover:bg-emerald-700 transition cursor-pointer flex items-center gap-1"
                  >
                    {linkCopied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                  </button>
                </div>
              </div>
            )}

            <div className="space-y-2">
              {users.length === 0 && <p className="text-xs text-zinc-400 italic">Ninguém tem acesso de parceiro a este perfil ainda.</p>}
              {users.map(u => (
                <div key={u.id} className="flex items-center justify-between bg-zinc-50 border border-zinc-200 rounded-lg p-2.5 text-xs">
                  <span className="flex items-center gap-1.5 font-semibold text-zinc-800"><ShieldCheck className="h-3.5 w-3.5 text-emerald-600" /> {u.email}</span>
                  <button onClick={() => handleRevoke(u)} className="text-red-500 hover:text-red-700 transition cursor-pointer" title="Revogar acesso">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
