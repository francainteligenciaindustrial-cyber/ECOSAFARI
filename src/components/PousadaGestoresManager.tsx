import React, { useEffect, useState } from "react";
import { Users, LoaderCircle, Trash2, UserPlus } from "lucide-react";
import { adminFetch } from "../lib/adminFetch";
import { useToast } from "../lib/ToastProvider";

interface Gestor {
  userId: string;
  email: string;
  name: string;
  isPrimary: boolean;
  isMe: boolean;
}

// Outros gestores com acesso a esta pousada — cada um entra com o próprio
// login e vê a pousada na lista "Minhas Pousadas".
export default function PousadaGestoresManager({ pousadaId, pousadaName }: { pousadaId: string; pousadaName: string }) {
  const { showToast } = useToast();
  const [gestores, setGestores] = useState<Gestor[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [email, setEmail] = useState("");
  const [adding, setAdding] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);

  const fetchGestores = () => {
    setLoading(true);
    setLoadError("");
    adminFetch(`/api/pousadas/${pousadaId}/gestores`)
      .then(async res => {
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body.error || "Erro ao carregar gestores.");
        setGestores(body.gestores || []);
      })
      .catch(err => setLoadError(err.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchGestores(); }, [pousadaId]);

  const addGestor = async (e: React.FormEvent) => {
    e.preventDefault();
    setAdding(true);
    try {
      const res = await adminFetch(`/api/pousadas/${pousadaId}/gestores`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        showToast(body.error || "Erro ao adicionar gestor.", "error");
        return;
      }
      showToast(
        body.emailSent
          ? `Convite enviado para ${email}.`
          : `${email} agora tem acesso. Se for uma conta nova, peça para usar "Esqueci minha senha" no login de parceiro.`,
        "success"
      );
      setEmail("");
      fetchGestores();
    } finally {
      setAdding(false);
    }
  };

  const removeGestor = async (g: Gestor) => {
    const msg = g.isMe
      ? `Remover o SEU acesso a "${pousadaName}"? Você deixa de ver esta pousada.`
      : `Remover o acesso de ${g.email} a "${pousadaName}"?`;
    if (!confirm(msg)) return;
    setRemovingId(g.userId);
    try {
      const res = await adminFetch(`/api/pousadas/${pousadaId}/gestores/${g.userId}`, { method: "DELETE" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        showToast(body.error || "Erro ao remover gestor.", "error");
        return;
      }
      showToast("Acesso removido.", "success");
      if (g.isMe) window.location.reload();
      else fetchGestores();
    } finally {
      setRemovingId(null);
    }
  };

  return (
    <div className="bg-white border border-editorial-border rounded-lg p-6 space-y-4">
      <div>
        <h3 className="text-[10px] uppercase tracking-[0.15em] font-bold text-editorial-primary flex items-center gap-2">
          <Users className="h-3.5 w-3.5" /> Gestores desta pousada
        </h3>
        <p className="text-editorial-muted text-[11px] mt-1">Quem estiver aqui entra com o próprio email e senha e consegue editar esta pousada e ver a agenda de reservas.</p>
      </div>

      <form onSubmit={addGestor} className="flex gap-2">
        <input
          type="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder="email@do-novo-gestor.com"
          className="flex-1 border border-editorial-border rounded-md p-2.5 text-xs focus:outline-none focus:ring-1 focus:ring-editorial-primary"
        />
        <button type="submit" disabled={adding} className="bg-editorial-primary text-white text-[11px] uppercase tracking-widest font-bold px-4 rounded-md disabled:opacity-60 cursor-pointer flex items-center gap-1.5">
          {adding ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <UserPlus className="h-3.5 w-3.5" />} Adicionar
        </button>
      </form>

      {loading ? (
        <div className="flex justify-center py-4"><LoaderCircle className="h-4 w-4 text-editorial-primary animate-spin" /></div>
      ) : loadError ? (
        <p className="bg-amber-50 border border-amber-200 text-amber-900 text-xs px-3 py-2 rounded-md">{loadError}</p>
      ) : (
        <ul className="divide-y divide-editorial-border">
          {gestores.map(g => (
            <li key={g.userId} className="flex items-center justify-between gap-3 py-2.5 text-xs">
              <div className="min-w-0">
                <p className="font-semibold text-editorial-text truncate">{g.name || g.email}{g.isMe ? " (você)" : ""}</p>
                {g.name && <p className="text-editorial-muted text-[11px] truncate">{g.email}</p>}
                {g.isPrimary && <span className="text-[9px] uppercase tracking-widest font-bold text-editorial-primary">Gestor principal</span>}
              </div>
              {gestores.length > 1 && (
                <button type="button" onClick={() => removeGestor(g)} disabled={removingId === g.userId} title="Remover acesso" className="text-editorial-muted hover:text-red-600 transition cursor-pointer disabled:opacity-60">
                  {removingId === g.userId ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                </button>
              )}
            </li>
          ))}
          {gestores.length === 0 && <li className="text-editorial-muted text-xs italic py-2">Nenhum gestor encontrado.</li>}
        </ul>
      )}
    </div>
  );
}
