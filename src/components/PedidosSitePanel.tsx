import React, { useEffect, useState } from "react";
import { Globe, LoaderCircle, MessageSquare, Mail, Trash2, Plus, PenTool } from "lucide-react";
import { adminFetch } from "../lib/adminFetch";
import ImageUploadButton from "./ImageUploadButton";
import type { LogoVersao, PedidoSite } from "../types";
import { SERVICO_LABEL, incluiLogo, incluiSite, podeMudarStatus } from "../lib/pedidoSite";

type Pedido = PedidoSite & { pousadaName: string; sitePublicado: boolean; customDomain: string | null; versoes: LogoVersao[] };

const STATUS: { id: PedidoSite["status"]; label: string; tone: string }[] = [
  { id: "novo", label: "Novo", tone: "bg-amber-50 text-amber-800 border-amber-200" },
  { id: "em_contato", label: "Em contato", tone: "bg-sky-50 text-sky-800 border-sky-200" },
  { id: "em_producao", label: "Site em produção", tone: "bg-indigo-50 text-indigo-800 border-indigo-200" },
  { id: "entregue", label: "Entregue", tone: "bg-emerald-50 text-emerald-800 border-emerald-200" },
  { id: "cancelado", label: "Cancelado", tone: "bg-zinc-100 text-zinc-600 border-zinc-200" },
];
const LOGO_LABEL: Record<string, string> = {
  novo: "Logo: novo", em_criacao: "Logo: em criação", aguardando_aprovacao: "Logo: aguardando o cliente", ajustes: "Logo: cliente pediu ajustes", aprovada: "Logo: aprovada",
};
const VERSAO_TONE: Record<LogoVersao["status"], string> = { pendente: "text-amber-700", aprovada: "text-emerald-700", rejeitada: "text-zinc-500" };

const waLink = (phone?: string) => {
  const digits = String(phone || "").replace(/\D/g, "");
  if (digits.length < 10) return null;
  return `https://wa.me/${digits.length <= 11 ? `55${digits}` : digits}`;
};

// Anexar versão: sobe a imagem (ImageUploadButton) e grava com descrição.
function NovaVersao({ pedidoId, onDone }: { pedidoId: string; onDone: () => void }) {
  const [imageUrl, setImageUrl] = useState("");
  const [descricao, setDescricao] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const salvar = async () => {
    setSaving(true);
    setError("");
    const res = await adminFetch(`/api/admin/pedidos-site/${pedidoId}/logo-versoes`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ imageUrl, descricao }),
    }).catch(() => null);
    setSaving(false);
    if (!res || !res.ok) {
      const body = res ? await res.json().catch(() => ({})) : {};
      return setError(body.error || "Erro ao anexar a versão.");
    }
    setImageUrl("");
    setDescricao("");
    onDone();
  };
  return (
    <div className="border border-dashed border-zinc-300 rounded-lg p-3 space-y-2">
      <p className="font-semibold text-zinc-700 flex items-center gap-1.5"><Plus className="h-3.5 w-3.5" /> Anexar nova versão</p>
      <div className="flex flex-wrap items-center gap-3">
        <ImageUploadButton onUploaded={setImageUrl} label={imageUrl ? "Trocar imagem" : "Enviar imagem (PNG/JPG)"} />
        {imageUrl && <img src={imageUrl} alt="Prévia" className="h-14 w-14 object-contain border border-zinc-200 rounded bg-zinc-50" />}
      </div>
      <input value={descricao} onChange={e => setDescricao(e.target.value)} maxLength={500} placeholder="Descrição para o cliente (ex.: versão com a arara em destaque)" aria-label="Descrição da versão" className="w-full border border-zinc-200 rounded p-2 bg-zinc-50" />
      <button type="button" onClick={salvar} disabled={!imageUrl || saving} className="bg-editorial-primary text-white font-bold px-4 py-2 rounded-lg disabled:opacity-50 cursor-pointer">
        {saving ? "Anexando..." : "Anexar versão"}
      </button>
      {error && <p role="alert" className="text-red-600">{error}</p>}
      <p className="text-[11px] text-zinc-500">O cliente recebe e-mail quando a primeira versão de um lote é anexada. Anexe todas as opções antes de avisá-lo pelo WhatsApp, se preferir.</p>
    </div>
  );
}

// Gestão → Pedidos de site: logo e/ou site pedidos pelos parceiros. Com
// logo, o designer anexa versões e o cliente aprova uma pelo portal; o site
// só entra em produção depois disso. "Entregue" publica o site da pousada.
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

  const update = async (p: Pedido, patch: { status?: PedidoSite["status"]; logoStatus?: string; notes?: string }) => {
    if (patch.status) {
      const bloqueio = podeMudarStatus(p, patch.status);
      if (bloqueio) return alert(bloqueio);
      if (patch.status === "entregue" && incluiSite(p.servico) && !confirm(`Marcar o site de ${p.pousadaName} como entregue? O site passa a aparecer no catálogo e o parceiro ganha o editor para ajustes.`)) return;
    }
    setSavingId(p.id);
    const res = await adminFetch(`/api/admin/pedidos-site/${p.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch) }).catch(() => null);
    setSavingId(null);
    if (res && !res.ok) {
      const body = await res.json().catch(() => ({}));
      alert(body.error || "Erro ao atualizar o pedido.");
    }
    load();
  };

  const removerVersao = async (v: LogoVersao) => {
    if (!confirm("Remover esta versão? O cliente ainda não a avaliou.")) return;
    await adminFetch(`/api/admin/logo-versoes/${v.id}`, { method: "DELETE" });
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
        Pedidos de logo e site feitos pelos parceiros ({abertos} em aberto). Com logo: anexe as versões, o cliente aprova uma pelo portal (as outras são descartadas) e só então o site pode entrar em produção. <strong>Entregue</strong> publica o site da pousada.
      </div>
      {pedidos.length === 0 && !error ? (
        <div className="text-center py-16 border border-dashed border-zinc-300 rounded-2xl text-editorial-muted text-xs"><Globe className="h-7 w-7 mx-auto mb-2" />Nenhum pedido ainda.</div>
      ) : (
        <div className="space-y-3">
          {pedidos.map(p => {
            const tone = STATUS.find(s => s.id === p.status)?.tone || "";
            const wa = waLink(p.contatoTelefone);
            const comLogo = incluiLogo(p.servico);
            return (
              <div key={p.id} className="bg-white border border-zinc-200 rounded-2xl p-4 text-xs space-y-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-bold text-sm text-zinc-900">{p.pousadaName} <span className="ml-1 text-[10px] uppercase tracking-widest text-editorial-primary">{SERVICO_LABEL[p.servico || "site"]}</span></p>
                    <p className="text-editorial-muted">Pedido em {new Date(p.createdAt).toLocaleString("pt-BR")}{p.sitePublicado ? " · site publicado" : ""}{p.customDomain ? ` · ${p.customDomain}` : ""}</p>
                    <p className="mt-1 text-zinc-700">{p.contatoNome || "Gestor sem nome cadastrado"}{p.contatoTelefone ? ` · ${p.contatoTelefone}` : ""}{p.contatoEmail ? ` · ${p.contatoEmail}` : ""}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full border ${tone}`}>{STATUS.find(s => s.id === p.status)?.label}</span>
                    <label className="sr-only" htmlFor={`st-${p.id}`}>Status do pedido</label>
                    <select id={`st-${p.id}`} value={p.status} disabled={savingId === p.id} onChange={e => update(p, { status: e.target.value as PedidoSite["status"] })} className="border border-zinc-200 rounded p-1.5 bg-zinc-50 cursor-pointer">
                      {STATUS.filter(s => incluiSite(p.servico) || s.id !== "em_producao").map(s => <option key={s.id} value={s.id} disabled={!!podeMudarStatus(p, s.id) && s.id !== p.status}>{s.label}</option>)}
                    </select>
                  </div>
                </div>

                {comLogo && (
                  <section className="border border-zinc-200 rounded-lg p-3 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="font-bold text-zinc-800 flex items-center gap-1.5"><PenTool className="h-3.5 w-3.5" /> {LOGO_LABEL[p.logoStatus || "novo"]}</p>
                      {p.logoStatus !== "aprovada" && (
                        <label className="flex items-center gap-1.5">
                          <span className="text-zinc-500">Etapa:</span>
                          <select value={p.logoStatus || "novo"} disabled={savingId === p.id} onChange={e => update(p, { logoStatus: e.target.value })} className="border border-zinc-200 rounded p-1 bg-zinc-50 cursor-pointer">
                            <option value="novo">Novo</option>
                            <option value="em_criacao">Em criação</option>
                            <option value="aguardando_aprovacao">Aguardando o cliente</option>
                            <option value="ajustes">Ajustes pedidos</option>
                          </select>
                        </label>
                      )}
                    </div>
                    {p.versoes.length > 0 && (
                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
                        {p.versoes.map((v, i) => (
                          <figure key={v.id} className={`border rounded-md p-2 ${v.status === "aprovada" ? "border-emerald-500 ring-1 ring-emerald-500" : "border-zinc-200"}`}>
                            <img src={v.imageUrl} alt={`Versão ${i + 1}`} className={`w-full aspect-square object-contain bg-zinc-50 rounded ${v.status === "rejeitada" ? "opacity-50" : ""}`} />
                            <figcaption className="mt-1.5 space-y-0.5">
                              <span className={`block font-bold uppercase text-[10px] ${VERSAO_TONE[v.status]}`}>V{i + 1} · {v.status}</span>
                              {v.descricao && <span className="block text-zinc-500">{v.descricao}</span>}
                              {v.clienteComentario && <span className="block text-zinc-800 italic">Cliente: "{v.clienteComentario}"</span>}
                              {v.status === "pendente" && (
                                <button type="button" onClick={() => removerVersao(v)} className="flex items-center gap-1 text-red-600 cursor-pointer"><Trash2 className="h-3 w-3" /> Remover</button>
                              )}
                            </figcaption>
                          </figure>
                        ))}
                      </div>
                    )}
                    {p.logoStatus !== "aprovada" && p.status !== "cancelado" && <NovaVersao pedidoId={p.id} onDone={load} />}
                  </section>
                )}

                <div className="flex flex-wrap items-center gap-3">
                  {wa && <a href={wa} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 font-bold text-emerald-700"><MessageSquare className="h-3.5 w-3.5" /> WhatsApp</a>}
                  {p.contatoEmail && <a href={`mailto:${p.contatoEmail}?subject=${encodeURIComponent(`${SERVICO_LABEL[p.servico || "site"]} — ${p.pousadaName}`)}`} className="flex items-center gap-1 font-bold text-editorial-primary"><Mail className="h-3.5 w-3.5" /> E-mail</a>}
                </div>
                <textarea
                  aria-label="Anotações internas"
                  defaultValue={p.notes || ""}
                  placeholder="Anotações internas (valor combinado, prazo, domínio...)"
                  onBlur={e => { if (e.target.value !== (p.notes || "")) update(p, { notes: e.target.value }); }}
                  rows={2}
                  className="w-full border border-zinc-200 rounded p-2 bg-zinc-50 resize-none"
                />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
