import React, { useState, useEffect } from "react";
import { ShieldCheck, UserPlus, Trash2, LoaderCircle, Copy, Check } from "lucide-react";
import { adminFetch } from "../lib/adminFetch";

interface AdminUser {
  id: string;
  email: string;
  createdAt: string;
  lastSignInAt: string | null;
}

// Lets an admin invite/revoke other admins directly from the dashboard,
// instead of requiring someone with terminal + service_role access to run
// scripts/create-admin.ts every time. See POST /api/admin/users in server.ts
// for why an action link (not an email) is what gets generated.
export default function AdminUsersPanel() {
  const [admins, setAdmins] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [unavailable, setUnavailable] = useState(false);
  const [email, setEmail] = useState("");
  const [inviting, setInviting] = useState(false);
  const [error, setError] = useState("");
  const [newAccessLink, setNewAccessLink] = useState<{ email: string; link: string | null } | null>(null);
  const [linkCopied, setLinkCopied] = useState(false);

  const fetchAdmins = async () => {
    try {
      const res = await adminFetch("/api/admin/users");
      if (res.status === 503) {
        setUnavailable(true);
        return;
      }
      if (res.ok) setAdmins(await res.json());
    } catch (err) {
      console.error("Erro ao carregar administradores:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchAdmins(); }, []);

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    setInviting(true);
    setError("");
    setNewAccessLink(null);
    try {
      const res = await adminFetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Erro ao convidar administrador.");
        return;
      }
      setNewAccessLink({ email: data.user.email, link: data.actionLink });
      setEmail("");
      fetchAdmins();
    } catch (err) {
      setError("Não foi possível convidar agora. Tente novamente.");
    } finally {
      setInviting(false);
    }
  };

  const handleRevoke = async (admin: AdminUser) => {
    if (!confirm(`Remover o acesso administrativo de ${admin.email}?`)) return;
    const res = await adminFetch(`/api/admin/users/${admin.id}`, { method: "DELETE" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      alert(data.error || "Erro ao remover acesso.");
      return;
    }
    fetchAdmins();
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

  return (
    <div className="space-y-6">
      <form onSubmit={handleInvite} className="bg-white border border-editorial-border p-6 space-y-3">
        <h3 className="font-bold text-sm text-editorial-text flex items-center gap-2">
          <UserPlus className="h-4 w-4 text-editorial-primary" /> Convidar novo administrador
        </h3>
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
            disabled={inviting}
            className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold uppercase tracking-widest px-5 py-2.5 rounded-lg transition disabled:opacity-60 cursor-pointer flex items-center justify-center gap-2"
          >
            {inviting ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
            Convidar
          </button>
        </div>
        {error && <p className="text-red-600 text-xs font-medium">{error}</p>}

        {newAccessLink && (
          <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4 text-xs">
            <p className="font-bold text-emerald-900 mb-1">
              Administrador {newAccessLink.email} criado!
            </p>
            {newAccessLink.link ? (
              <>
                <p className="text-emerald-800 mb-2">
                  Envie este link a essa pessoa (WhatsApp, email) para que ela defina a própria senha e acesse o painel:
                </p>
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
              <p className="text-amber-700">
                Não foi possível gerar o link de acesso automaticamente — peça para a pessoa usar "Esqueci minha senha" na tela de login administrativo com este email.
              </p>
            )}
          </div>
        )}
      </form>

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
                <td className="p-4 font-bold text-zinc-900 flex items-center gap-2">
                  <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" /> {admin.email}
                </td>
                <td className="p-4 text-zinc-600">{new Date(admin.createdAt).toLocaleDateString("pt-BR")}</td>
                <td className="p-4 text-zinc-600">{admin.lastSignInAt ? new Date(admin.lastSignInAt).toLocaleDateString("pt-BR") : "Nunca acessou"}</td>
                <td className="p-4 text-right">
                  <button
                    onClick={() => handleRevoke(admin)}
                    className="text-red-400 hover:text-red-600 transition cursor-pointer inline-flex items-center gap-1 font-bold"
                    title="Remover acesso administrativo"
                  >
                    <Trash2 className="h-3.5 w-3.5" /> Remover acesso
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
    </div>
  );
}
