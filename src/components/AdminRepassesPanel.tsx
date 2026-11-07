import React, { useEffect, useState } from "react";
import { Wallet, LoaderCircle, RefreshCw, Copy, Check, FileSignature } from "lucide-react";
import { adminFetch } from "../lib/adminFetch";
import ImageUploadButton from "./ImageUploadButton";

interface Lote {
  id: string; pousadaId: string; pousadaName: string; valor: number; status: "pendente" | "pago"; pixTipo?: string; pixChave?: string; titular?: string; documento?: string;
  criadoEm: string; pagoEm?: string | null; comprovanteUrl?: string | null; reservas: { ref: string; hospede: string; checkIn: string; repasse: number }[];
}
interface Dados { provedor: string; resumo: { custodia: number; garantido: number; liberado: number; emLote: number; disputa: number; pagoMes: number }; lotes: Lote[]; error?: string }
interface Contrato { id: string; pousadaId: string; versao: string; status: string; comissaoPct: number; comissaoLancamentoPct?: number | null; razaoSocial: string; responsavelNome: string; aceitoEm: string; pixTipo: string; pixChave: string }

const brl = (n: number) => Number(n || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const br = (iso?: string | null) => (iso ? String(iso).slice(0, 10).split("-").reverse().join("/") : "—");

// Gestão → Repasses: dinheiro em custódia, lotes do dia por pousada (Pix
// pronto para copiar) e "Marcar como pago" com comprovante. A rotina diária
// monta os lotes; o botão "Processar agora" adianta.
export default function AdminRepassesPanel() {
  const [dados, setDados] = useState<Dados | null>(null);
  const [contratos, setContratos] = useState<Contrato[]>([]);
  const [processando, setProcessando] = useState(false);
  const [copiado, setCopiado] = useState<string | null>(null);
  const [comprovantes, setComprovantes] = useState<Record<string, string>>({});
  const [pagando, setPagando] = useState<string | null>(null);

  const load = () => {
    adminFetch("/api/admin/repasses").then(r => r.json()).then(setDados).catch(() => setDados({ error: "Erro ao carregar." } as any));
    adminFetch("/api/admin/contratos").then(r => (r.ok ? r.json() : [])).then(setContratos).catch(() => {});
  };
  useEffect(load, []);

  const processar = async () => {
    setProcessando(true);
    await adminFetch("/api/admin/repasses/processar", { method: "POST" }).catch(() => {});
    setProcessando(false);
    load();
  };

  const pagar = async (l: Lote) => {
    if (!window.confirm(`Confirmar que ${brl(l.valor)} foi pago por Pix para ${l.titular || l.pousadaName}? A pousada recebe o extrato por e-mail.`)) return;
    setPagando(l.id);
    const r = await adminFetch(`/api/admin/repasses/lotes/${l.id}/pagar`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ comprovanteUrl: comprovantes[l.id] }) });
    const body = await r.json().catch(() => ({}));
    setPagando(null);
    if (!r.ok) window.alert(body.error || "Não foi possível marcar como pago.");
    load();
  };

  const copiar = async (id: string, texto: string) => {
    try { await navigator.clipboard.writeText(texto); setCopiado(id); setTimeout(() => setCopiado(null), 1500); } catch { /* sem clipboard */ }
  };

  if (!dados) return <div className="flex justify-center py-10"><LoaderCircle className="h-6 w-6 animate-spin" /></div>;
  if (dados.error) return <p className="bg-amber-50 border border-amber-200 text-amber-900 text-sm rounded-xl px-4 py-3">{dados.error}</p>;

  const pendentes = dados.lotes.filter(l => l.status === "pendente");
  const pagos = dados.lotes.filter(l => l.status === "pago").slice(0, 20);
  const cards: [string, number, string][] = [
    ["Em custódia", dados.resumo.custodia, "Pago pelo hóspede, ainda reembolsável"],
    ["Garantido", dados.resumo.garantido, "Passou das 48 h, aguardando check-in"],
    ["A pagar hoje", dados.resumo.emLote + dados.resumo.liberado, "Lotes prontos para Pix"],
    ["Pago no mês", dados.resumo.pagoMes, "Repasses já enviados"],
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-zinc-900 flex items-center gap-2"><Wallet className="h-5 w-5 text-emerald-600" /> Repasses às pousadas</h2>
          <p className="text-sm text-zinc-500 mt-1">A parte da pousada fica em custódia e é liberada 1 dia depois do check-in. Pagamento: <strong>{dados.provedor === "manual" ? "Pix manual (pague e marque como pago)" : dados.provedor}</strong>.</p>
        </div>
        <button type="button" onClick={processar} disabled={processando} className="inline-flex items-center gap-1.5 border border-zinc-200 bg-white text-xs font-bold px-3 py-2 rounded-full cursor-pointer disabled:opacity-60">
          <RefreshCw className={`h-4 w-4 ${processando ? "animate-spin" : ""}`} /> Processar agora
        </button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {cards.map(([t, v, s]) => (
          <div key={t} className="bg-white border border-zinc-200 rounded-2xl p-4">
            <p className="text-[10px] uppercase tracking-widest font-bold text-zinc-500">{t}</p>
            <p className="text-xl font-bold text-zinc-900 mt-1">{brl(v)}</p>
            <p className="text-[11px] text-zinc-500">{s}</p>
          </div>
        ))}
      </div>
      {dados.resumo.disputa > 0 && <p className="bg-red-50 border border-red-200 text-red-800 text-sm rounded-xl px-4 py-3">{brl(dados.resumo.disputa)} segurado por contestação de cartão.</p>}

      <section className="space-y-3">
        <h3 className="text-sm font-bold text-zinc-900">A pagar ({pendentes.length})</h3>
        {pendentes.length === 0 && <p className="text-sm text-zinc-500">Nenhum repasse pendente.</p>}
        {pendentes.map(l => (
          <article key={l.id} className="bg-white border border-amber-200 rounded-2xl p-4 space-y-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-bold text-zinc-900">{l.pousadaName} · {brl(l.valor)}</p>
                <p className="text-xs text-zinc-500">{l.titular} {l.documento ? `· ${l.documento}` : ""} · gerado em {br(l.criadoEm)}</p>
              </div>
              <button type="button" onClick={() => copiar(l.id, l.pixChave || "")} className="inline-flex items-center gap-1.5 bg-zinc-100 text-xs font-semibold px-3 py-2 rounded-full cursor-pointer">
                {copiado === l.id ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />} Pix ({l.pixTipo}): {l.pixChave}
              </button>
            </div>
            <ul className="text-xs text-zinc-600 grid sm:grid-cols-2 gap-x-4">
              {l.reservas.map(r => <li key={r.ref}>{r.ref} · {r.hospede} · check-in {br(r.checkIn)} · <strong>{brl(r.repasse)}</strong></li>)}
            </ul>
            <div className="flex flex-wrap items-center gap-3">
              <ImageUploadButton label={comprovantes[l.id] ? "Trocar comprovante" : "Anexar comprovante"} onUploaded={url => setComprovantes(c => ({ ...c, [l.id]: url }))} />
              {comprovantes[l.id] && <a href={comprovantes[l.id]} target="_blank" rel="noopener noreferrer" className="text-xs underline">ver comprovante</a>}
              <button type="button" onClick={() => pagar(l)} disabled={pagando === l.id} className="ml-auto bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-4 py-2 rounded-full cursor-pointer disabled:opacity-60">
                {pagando === l.id ? "Salvando…" : "Marcar como pago"}
              </button>
            </div>
          </article>
        ))}
      </section>

      {pagos.length > 0 && (
        <section>
          <h3 className="text-sm font-bold text-zinc-900 mb-2">Pagos recentemente</h3>
          <ul className="bg-white border border-zinc-200 rounded-2xl divide-y divide-zinc-100 text-sm">
            {pagos.map(l => (
              <li key={l.id} className="px-4 py-2.5 flex flex-wrap justify-between gap-2">
                <span>{l.pousadaName} · {brl(l.valor)} · {l.reservas.length} reserva(s)</span>
                <span className="text-xs text-zinc-500">pago em {br(l.pagoEm)}{l.comprovanteUrl && <> · <a href={l.comprovanteUrl} target="_blank" rel="noopener noreferrer" className="underline">comprovante</a></>}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <h3 className="text-sm font-bold text-zinc-900 mb-2 flex items-center gap-2"><FileSignature className="h-4 w-4" /> Contratos assinados ({contratos.filter(c => c.status === "ativo").length})</h3>
        {contratos.length === 0 ? <p className="text-sm text-zinc-500">Nenhuma pousada assinou ainda. Elas assinam no portal do parceiro → "Contrato e repasses".</p> : (
          <ul className="bg-white border border-zinc-200 rounded-2xl divide-y divide-zinc-100 text-sm">
            {contratos.map(c => (
              <li key={c.id} className="px-4 py-2.5 flex flex-wrap justify-between gap-2">
                <span>{c.razaoSocial} · {c.comissaoLancamentoPct ? `${c.comissaoLancamentoPct}% (lançamento) → ` : ""}{c.comissaoPct}% · Pix {c.pixTipo}</span>
                <span className="text-xs text-zinc-500">{c.responsavelNome} · {br(c.aceitoEm)} · v{c.versao}{c.status !== "ativo" ? " (substituído)" : ""}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
