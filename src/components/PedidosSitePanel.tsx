import React, { useEffect, useState } from "react";
import { Globe, LoaderCircle, MessageSquare, Mail } from "lucide-react";
import { adminFetch } from "../lib/adminFetch";
import type { PedidoSite } from "../types";

type Pedido = PedidoSite & { pousadaName: string; sitePublicado: boolean; customDomain: string | null };

const STATUS: { id: PedidoSite["status"]; label: string; tone: string }[] = [
  { id: "novo", label: "Novo", tone: "bg-amber-50 text-amber-800 border-amber-200" },
  { id: "em_contato", label: "Em contato", tone: "bg-sky-50 text-sky-800 border-sky-200" },
  { id: "em_producao", label: "Em produção", tone: "bg-indigo-50 text-indigo-800 border-indigo-200" },
  { id: "entregue", label: "Entregue", tone: "bg-emerald-50 text-emerald-800 border-emerald-200" },
  { id: "cancelado", label: "Cancelado", tone: "bg-zinc-100 text-zinc-600 border-zinc-200" },
];

const waLink = (phone?: string) => {
  const digits = String(phone || "").replace(/\D/g, "");
  if (digits.length < 10) return null;
  return `https://wa.me/${digits.length <= 11 ? `55${digits}` : digits}`;
};

// Gestão → Pedidos de site: parceiros que pediram a criação do site oficial.
// Marcar "Entregue" publica o site da pousada e libera o editor no portal dela.
export default function PedidosSitePanel() {
  const [pedidos, setPedidos] = useState<Pedido[] | null>(null);
  const [error, setError] = useState("");
  const [savingId, setSavingId] = useState<string | null>(null);

  const load = async () => {
    const res = await adminFetch("/api/admin/pedidos-site").catch(() => null);
    const body = res ? await res.json().catch(() => ({})) : {};
    if (!res || !res.ok) {
      setError(body.error || "Não foi possível carregar os pedidos.");
      setPedidos([]);
      return;
    }
    setError("");
    setPedidos(body);
  };
  useEffect(() => { load(); }, []);

  const update = async (p: Pedido, patch: { status?: PedidoSite["status"]; notes?: string }) => {
    if (patch.status === "entregue" && !confirm(`Marcar o site de ${p.pousadaName} como entregue? O site passa a aparecer no catálogo e o parceiro ganha o editor para ajustes.`)) return;
    setSavingId(p.id);
    await adminFetch(`/api/admin/pedidos-site/${p.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch) });
    setSavingId(null);
    load();
  };

  if (pedidos === null) {
    return <div className="flex items-center justify-center py-20 text-editorial-muted gap-2"><LoaderCircle className="h-5 w-5 animate-spin" /> <span className="text-xs uppercase tracking-widest font-bold">Carregando pedidos...</span></div>;
  }

  const abertos = pedidos.filter(p => p.status !== "entregue" && p.status !== "cancelado").length;

  return (
    <div className="space-y-6">
      {error && <div className="bg-amber-50 border border-amber-200 text-amber-900 text-xs px-4 py-3 rounded-lg">{error}</div>}
      <div className="bg-white p-4 border border-zinc-200 rounded-2xl text-xs text-editorial-muted">
        Parceiros que pediram a criação do site oficial pelo portal ({abertos} em aberto). Ao marcar <strong>Entregue</strong>, o site da pousada é publicado e o gestor passa a poder ajustar textos e fotos. O domínio próprio, se houver, é configurado em Pousadas → Editar.
      </div>
      {pedidos.length === 0 && !error ? (
        <div className="text-center py-16 border border-dashed border-zinc-300 rounded-2xl text-editorial-muted text-xs"><Globe className="h-7 w-7 mx-auto mb-2" />Nenhum pedido ainda.</div>
      ) : (
        <div className="space-y-3">
          {pedidos.map(p => {
            const tone = STATUS.find(s => s.id === p.status)?.tone || "";
            const wa = waLink(p.contatoTelefone);
            return (
              <div key={p.id} className="bg-white border border-zinc-200 rounded-2xl p-4 text-xs">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-bold text-sm text-zinc-900">{p.pousadaName}</p>
                    <p className="text-editorial-muted">Pedido em {new Date(p.createdAt).toLocaleString("pt-BR")}{p.sitePublicado ? " · site publicado" : ""}{p.customDomain ? ` · ${p.customDomain}` : ""}</p>
                    <p className="mt-1 text-zinc-700">{p.contatoNome || "Gestor sem nome cadastrado"}{p.contatoTelefone ? ` · ${p.contatoTelefone}` : ""}{p.contatoEmail ? ` · ${p.contatoEmail}` : ""}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full border ${tone}`}>{STATUS.find(s => s.id === p.status)?.label}</span>
                    <label className="sr-only" htmlFor={`st-${p.id}`}>Status</label>
                    <select id={`st-${p.id}`} value={p.status} disabled={savingId === p.id} onChange={e => update(p, { status: e.target.value as PedidoSite["status"] })} className="border border-zinc-200 rounded p-1.5 bg-zinc-50 cursor-pointer">
                      {STATUS.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
                    </select>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-3 mt-3">
                  {wa && <a href={wa} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 font-bold text-emerald-700"><MessageSquare className="h-3.5 w-3.5" /> WhatsApp</a>}
                  {p.contatoEmail && <a href={`mailto:${p.contatoEmail}?subject=${encodeURIComponent(`Site da ${p.pousadaName}`)}`} className="flex items-center gap-1 font-bold text-editorial-primary"><Mail className="h-3.5 w-3.5" /> E-mail</a>}
                </div>
                <textarea
                  aria-label="Anotações internas"
                  defaultValue={p.notes || ""}
                  placeholder="Anotações internas (valor combinado, prazo, domínio...)"
                  onBlur={e => { if (e.target.value !== (p.notes || "")) update(p, { notes: e.target.value }); }}
                  rows={2}
                  className="w-full mt-3 border border-zinc-200 rounded p-2 bg-zinc-50 resize-none"
                />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
