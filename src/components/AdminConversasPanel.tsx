import React, { useEffect, useState } from "react";
import { LoaderCircle, MessagesSquare, EyeOff } from "lucide-react";
import { adminFetch } from "../lib/adminFetch";

interface Conversa {
  id: string;
  lastMessageAt: string;
  lastMessagePreview?: string;
  turista: { name: string; email: string } | null;
  guia: { name: string } | null;
}
interface Mensagem { id: string; autor: "turista" | "guia"; texto: string; textoOriginal?: string | null; ocultado: boolean; createdAt: string }

// Gestão → Mensagens (guias): para a equipe acompanhar uma conversa quando
// há reclamação ou suspeita de negociação "por fora". Mostra também o texto
// original das mensagens em que um contato foi ocultado.
export default function AdminConversasPanel() {
  const [lista, setLista] = useState<Conversa[] | null>(null);
  const [error, setError] = useState("");
  const [ativa, setAtiva] = useState<string | null>(null);
  const [msgs, setMsgs] = useState<Mensagem[] | null>(null);
  const [busca, setBusca] = useState("");

  useEffect(() => {
    adminFetch("/api/admin/conversas")
      .then(async r => {
        const body = await r.json().catch(() => []);
        if (!r.ok) throw new Error(body.error || "Erro ao carregar.");
        setLista(body);
      })
      .catch(err => setError(err.message));
  }, []);

  useEffect(() => {
    if (!ativa) return;
    setMsgs(null);
    adminFetch(`/api/admin/conversas/${ativa}`).then(r => (r.ok ? r.json() : [])).then(setMsgs);
  }, [ativa]);

  const q = busca.trim().toLowerCase();
  const filtradas = (lista || []).filter(c => !q || [c.turista?.name, c.turista?.email, c.guia?.name].some(v => (v || "").toLowerCase().includes(q)));

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-bold text-zinc-900 flex items-center gap-2"><MessagesSquare className="h-5 w-5 text-emerald-600" /> Mensagens turista ↔ guia</h2>
        <p className="text-sm text-zinc-500 mt-1">Consulta para atendimento de problemas. Mensagens com contato ocultado mostram também o texto original (só aqui).</p>
      </div>
      {error && <p className="bg-amber-50 border border-amber-200 text-amber-900 text-sm rounded-xl px-4 py-3">{error}</p>}
      <label className="block">
        <span className="sr-only">Buscar por turista ou guia</span>
        <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar por turista, email ou guia…" className="w-full border border-zinc-200 bg-white rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-emerald-500" />
      </label>
      <div className="grid grid-cols-1 md:grid-cols-[300px_minmax(0,1fr)] gap-4">
        <ul className="bg-white border border-zinc-200 rounded-2xl p-2 max-h-[600px] overflow-y-auto">
          {lista === null && !error && <li className="flex justify-center py-6"><LoaderCircle className="h-5 w-5 animate-spin" /></li>}
          {lista && filtradas.length === 0 && <li className="text-sm text-zinc-500 p-3">Nenhuma conversa.</li>}
          {filtradas.map(c => (
            <li key={c.id}>
              <button type="button" onClick={() => setAtiva(c.id)} className={`w-full text-left p-3 rounded-xl cursor-pointer ${ativa === c.id ? "bg-emerald-50" : "hover:bg-zinc-50"}`}>
                <span className="block text-sm font-semibold text-zinc-900 truncate">{c.turista?.name || "Turista"} → {c.guia?.name || "Guia"}</span>
                <span className="block text-xs text-zinc-500 truncate">{c.lastMessagePreview}</span>
                <span className="block text-[10px] text-zinc-400">{new Date(c.lastMessageAt).toLocaleString("pt-BR")}</span>
              </button>
            </li>
          ))}
        </ul>
        <div className="bg-white border border-zinc-200 rounded-2xl p-4 min-h-[300px] space-y-3">
          {!ativa && <p className="text-sm text-zinc-500">Escolha uma conversa.</p>}
          {ativa && msgs === null && <div className="flex justify-center py-6"><LoaderCircle className="h-5 w-5 animate-spin" /></div>}
          {(msgs || []).map(m => (
            <div key={m.id} className={`rounded-xl px-3 py-2 text-sm ${m.autor === "guia" ? "bg-zinc-100" : "bg-emerald-50"}`}>
              <span className="block text-[10px] uppercase tracking-widest font-bold text-zinc-500">{m.autor} · {new Date(m.createdAt).toLocaleString("pt-BR")}</span>
              <span className="whitespace-pre-line">{m.texto}</span>
              {m.ocultado && m.textoOriginal && (
                <span className="mt-1 flex items-start gap-1 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-2 py-1">
                  <EyeOff className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" /> Original: {m.textoOriginal}
                </span>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
