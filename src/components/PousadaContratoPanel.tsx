import React, { useEffect, useState } from "react";
import { FileSignature, LoaderCircle, Check, Download, Wallet, ShieldCheck } from "lucide-react";
import { adminFetch } from "../lib/adminFetch";
import { documentoValido, cpfValido, pixChaveValida, type PixTipo } from "../lib/documentos";

interface Assinado { id: string; versao: string; aceitoEm: string; comissaoPct: number; comissaoLancamentoAte?: string | null; razaoSocial: string; documento: string; responsavelNome: string; pixTipo: string; pixChave: string; hash: string }
interface ContratoResp { assinado: Assinado | null; comissaoPct?: number; comissaoAtual?: number; lancamento?: { pct: number; ate: string } | null; versao?: string; error?: string }
interface Extrato {
  reservas: { id: string; ref: string; hospede: string; checkIn: string; total: number; comissao: number; comissaoPct?: number; repasse: number; status: string; previsao?: string | null; pagoEm?: string | null; cancelado: boolean; taxaCancelamento?: number | null }[];
  lotes: { id: string; valor: number; status: string; criadoEm: string; pagoEm?: string | null; comprovanteUrl?: string | null; reservas: number }[];
}

const br = (iso?: string | null) => (iso ? String(iso).slice(0, 10).split("-").reverse().join("/") : "—");
const brl = (n: number) => Number(n || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const field = "w-full border border-editorial-border rounded-md p-2.5 bg-white text-sm focus:outline-none focus:ring-1 focus:ring-editorial-primary";
const STATUS: Record<string, { label: string; cls: string }> = {
  custodia: { label: "Em custódia", cls: "bg-zinc-100 text-zinc-700" },
  garantido: { label: "Garantido", cls: "bg-sky-50 text-sky-800" },
  liberado: { label: "Liberado", cls: "bg-amber-50 text-amber-800" },
  em_lote: { label: "Em pagamento", cls: "bg-amber-50 text-amber-800" },
  pago: { label: "Pago", cls: "bg-emerald-50 text-emerald-800" },
  reembolsado: { label: "Reembolsado", cls: "bg-zinc-100 text-zinc-500" },
  sem_repasse: { label: "Sem repasse", cls: "bg-zinc-100 text-zinc-500" },
  disputa: { label: "Em disputa", cls: "bg-red-50 text-red-700" },
};

// Portal da pousada → Contrato e repasses: assinatura do contrato de
// parceria (comissão, cancelamento, repasse por Pix) e extrato.
export default function PousadaContratoPanel({ pousadaId }: { pousadaId: string }) {
  const [info, setInfo] = useState<ContratoResp | null>(null);
  const [extrato, setExtrato] = useState<Extrato | null>(null);
  const [form, setForm] = useState({ razaoSocial: "", documento: "", endereco: "", responsavelNome: "", responsavelCpf: "", responsavelCargo: "Proprietário(a)", pixTipo: "cnpj" as PixTipo, pixChave: "" });
  const [texto, setTexto] = useState("");
  const [aceite, setAceite] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");

  const load = () => {
    adminFetch(`/api/pousadas/${encodeURIComponent(pousadaId)}/contrato`).then(r => r.json()).then(setInfo).catch(() => setInfo({ assinado: null, error: "Erro ao carregar." }));
    adminFetch(`/api/pousadas/${encodeURIComponent(pousadaId)}/extrato`).then(r => (r.ok ? r.json() : null)).then(setExtrato).catch(() => {});
  };
  useEffect(load, [pousadaId]);

  // Pré-visualização do contrato com os dados preenchidos.
  useEffect(() => {
    if (!info || info.assinado) return;
    const t = setTimeout(() => {
      adminFetch(`/api/pousadas/${encodeURIComponent(pousadaId)}/contrato/previa`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) })
        .then(r => (r.ok ? r.json() : null)).then(b => b && setTexto(b.texto)).catch(() => {});
    }, 400);
    return () => clearTimeout(t);
  }, [form, info, pousadaId]);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm(f => ({ ...f, [k]: e.target.value }));

  const assinar = async (e: React.FormEvent) => {
    e.preventDefault();
    setErro("");
    if (!documentoValido(form.documento)) return setErro("CNPJ ou CPF da pousada inválido.");
    if (!cpfValido(form.responsavelCpf)) return setErro("CPF de quem assina inválido.");
    if (!pixChaveValida(form.pixTipo, form.pixChave)) return setErro("Chave Pix inválida para o tipo escolhido.");
    if (!aceite) return setErro("Marque que leu e aceita o contrato.");
    setSalvando(true);
    try {
      const r = await adminFetch(`/api/pousadas/${encodeURIComponent(pousadaId)}/contrato/assinar`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...form, aceite: true }) });
      const body = await r.json().catch(() => ({}));
      if (!r.ok) return setErro(body.error || "Não foi possível assinar.");
      load();
    } finally {
      setSalvando(false);
    }
  };

  const baixarPdf = async () => {
    const r = await adminFetch(`/api/pousadas/${encodeURIComponent(pousadaId)}/contrato/pdf`);
    if (!r.ok) return;
    const url = URL.createObjectURL(await r.blob());
    window.open(url, "_blank", "noopener");
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  };

  if (!info) return <div className="flex justify-center py-10"><LoaderCircle className="h-6 w-6 animate-spin" /></div>;
  if (info.error) return <p className="bg-amber-50 border border-amber-200 text-amber-900 text-sm rounded-xl px-4 py-3">{info.error}</p>;

  const aReceber = (extrato?.reservas || []).filter(r => ["custodia", "garantido", "liberado", "em_lote"].includes(r.status)).reduce((a, r) => a + r.repasse, 0);
  const recebido = (extrato?.lotes || []).filter(l => l.status === "pago").reduce((a, l) => a + l.valor, 0);

  return (
    <div className="space-y-6">
      {!info.assinado ? (
        <section className="bg-white border border-editorial-border rounded-2xl p-5 space-y-4">
          <div>
            <h2 className="text-sm font-bold text-editorial-text flex items-center gap-2"><FileSignature className="h-4 w-4 text-editorial-accent" /> Contrato de parceria</h2>
            <p className="text-xs text-editorial-muted mt-1">Para receber reservas e pagamentos online pelo Ipantanal, assine o contrato abaixo. Ele define a comissão, a política de cancelamento do hóspede e como você recebe (Pix, 1 dia depois do check-in de cada reserva).</p>
          </div>
          <div className="grid sm:grid-cols-3 gap-3 text-center">
            <div className="bg-editorial-secondary rounded-xl p-3"><p className="text-[10px] uppercase tracking-widest font-bold text-editorial-muted">Comissão</p><p className="text-lg font-bold">{info.lancamento ? `${info.lancamento.pct}%` : `${info.comissaoPct}%`}</p><p className="text-[11px] text-editorial-muted">{info.lancamento ? `até ${br(info.lancamento.ate)}, depois ${info.comissaoPct}%` : "por reserva paga"}</p></div>
            <div className="bg-editorial-secondary rounded-xl p-3"><p className="text-[10px] uppercase tracking-widest font-bold text-editorial-muted">Você recebe</p><p className="text-lg font-bold">1 dia após o check-in</p><p className="text-[11px] text-editorial-muted">por Pix, com extrato</p></div>
            <div className="bg-editorial-secondary rounded-xl p-3"><p className="text-[10px] uppercase tracking-widest font-bold text-editorial-muted">Cancelamentos</p><p className="text-lg font-bold">70% da taxa</p><p className="text-[11px] text-editorial-muted">fica com você</p></div>
          </div>
          <form onSubmit={assinar} className="space-y-3">
            <div className="grid sm:grid-cols-2 gap-3 text-xs">
              <label className="block"><span className="block font-semibold mb-1">Razão social (ou nome completo)</span><input required value={form.razaoSocial} onChange={set("razaoSocial")} className={field} /></label>
              <label className="block"><span className="block font-semibold mb-1">CNPJ (ou CPF)</span><input required inputMode="numeric" value={form.documento} onChange={set("documento")} className={field} /></label>
              <label className="block sm:col-span-2"><span className="block font-semibold mb-1">Endereço</span><input value={form.endereco} onChange={set("endereco")} className={field} /></label>
              <label className="block"><span className="block font-semibold mb-1">Quem assina (nome completo)</span><input required value={form.responsavelNome} onChange={set("responsavelNome")} className={field} /></label>
              <label className="block"><span className="block font-semibold mb-1">CPF de quem assina</span><input required inputMode="numeric" value={form.responsavelCpf} onChange={set("responsavelCpf")} className={field} /></label>
              <label className="block"><span className="block font-semibold mb-1">Cargo</span><input value={form.responsavelCargo} onChange={set("responsavelCargo")} className={field} /></label>
              <div className="grid grid-cols-[110px_1fr] gap-2">
                <label className="block"><span className="block font-semibold mb-1">Tipo de Pix</span>
                  <select value={form.pixTipo} onChange={set("pixTipo")} className={field}>
                    <option value="cnpj">CNPJ</option><option value="cpf">CPF</option><option value="email">E-mail</option><option value="telefone">Telefone</option><option value="aleatoria">Aleatória</option>
                  </select>
                </label>
                <label className="block"><span className="block font-semibold mb-1">Chave Pix para repasses</span><input required value={form.pixChave} onChange={set("pixChave")} className={field} /></label>
              </div>
            </div>
            <p className="text-[11px] text-editorial-muted">A chave Pix de CPF/CNPJ precisa ser do mesmo titular do contrato.</p>
            <div className="border border-editorial-border rounded-xl bg-editorial-secondary/40 p-4 max-h-80 overflow-y-auto text-[11px] leading-relaxed whitespace-pre-wrap font-mono" aria-label="Texto do contrato">
              {texto || "Carregando o contrato…"}
            </div>
            <label className="flex items-start gap-2 text-xs cursor-pointer">
              <input type="checkbox" checked={aceite} onChange={e => setAceite(e.target.checked)} className="accent-editorial-primary h-4 w-4 mt-0.5" />
              <span>Li o contrato inteiro e, como representante da pousada, aceito os termos. Entendo que este aceite eletrônico tem validade jurídica e fica registrado com data, hora, IP e o código do texto aceito.</span>
            </label>
            {erro && <p role="alert" className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{erro}</p>}
            <button type="submit" disabled={salvando} className="bg-editorial-primary text-white text-[11px] uppercase tracking-widest font-bold px-5 py-3 rounded-full disabled:opacity-60 cursor-pointer inline-flex items-center gap-2">
              {salvando ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <FileSignature className="h-4 w-4" />} Assinar contrato
            </button>
          </form>
        </section>
      ) : (
        <section className="bg-white border border-editorial-border rounded-2xl p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-sm font-bold text-editorial-text flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-emerald-600" /> Contrato assinado</h2>
              <p className="text-xs text-editorial-muted mt-1">{info.assinado.razaoSocial} · {info.assinado.documento} · assinado por {info.assinado.responsavelNome} em {br(info.assinado.aceitoEm)} (versão {info.assinado.versao})</p>
              <p className="text-xs mt-2">Comissão atual: <strong>{info.comissaoAtual}%</strong>{info.assinado.comissaoLancamentoAte ? ` (lançamento até ${br(info.assinado.comissaoLancamentoAte)}, depois ${info.assinado.comissaoPct}%)` : ""} · Pix ({info.assinado.pixTipo}): <strong>{info.assinado.pixChave}</strong></p>
            </div>
            <button type="button" onClick={baixarPdf} className="inline-flex items-center gap-1.5 border border-editorial-border text-xs font-semibold px-3 py-2 rounded-full cursor-pointer"><Download className="h-4 w-4" /> Contrato (PDF)</button>
          </div>
        </section>
      )}

      <section className="bg-white border border-editorial-border rounded-2xl p-5">
        <h2 className="text-sm font-bold text-editorial-text flex items-center gap-2"><Wallet className="h-4 w-4 text-editorial-accent" /> Extrato de repasses</h2>
        <div className="grid grid-cols-2 gap-3 my-4">
          <div className="bg-editorial-secondary rounded-xl p-3"><p className="text-[10px] uppercase tracking-widest font-bold text-editorial-muted">A receber</p><p className="text-lg font-bold">{brl(aReceber)}</p></div>
          <div className="bg-editorial-secondary rounded-xl p-3"><p className="text-[10px] uppercase tracking-widest font-bold text-editorial-muted">Já recebido</p><p className="text-lg font-bold">{brl(recebido)}</p></div>
        </div>
        {!extrato || extrato.reservas.length === 0 ? (
          <p className="text-sm text-editorial-muted">Nenhuma reserva paga ainda.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead><tr className="text-left text-editorial-muted"><th className="py-2 pr-3">Reserva</th><th className="py-2 pr-3">Check-in</th><th className="py-2 pr-3 text-right">Total</th><th className="py-2 pr-3 text-right">Comissão</th><th className="py-2 pr-3 text-right">Você recebe</th><th className="py-2">Situação</th></tr></thead>
              <tbody>
                {extrato.reservas.map(r => (
                  <tr key={r.id} className="border-t border-editorial-border">
                    <td className="py-2 pr-3">{r.ref} · {r.hospede}{r.cancelado ? " (cancelada)" : ""}</td>
                    <td className="py-2 pr-3">{br(r.checkIn)}</td>
                    <td className="py-2 pr-3 text-right">{brl(r.total)}</td>
                    <td className="py-2 pr-3 text-right">{r.cancelado ? "—" : `${brl(r.comissao)}${r.comissaoPct != null ? ` (${r.comissaoPct}%)` : ""}`}</td>
                    <td className="py-2 pr-3 text-right font-semibold">{brl(r.repasse)}</td>
                    <td className="py-2"><span className={`px-2 py-0.5 rounded-full font-bold text-[10px] ${STATUS[r.status]?.cls || ""}`}>{STATUS[r.status]?.label || r.status}</span>{r.previsao && <span className="block text-[10px] text-editorial-muted mt-0.5">previsto {br(r.previsao)}</span>}{r.pagoEm && <span className="block text-[10px] text-editorial-muted mt-0.5">pago {br(r.pagoEm)}</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {extrato && extrato.lotes.length > 0 && (
          <div className="mt-5">
            <h3 className="text-[10px] uppercase tracking-widest font-bold text-editorial-muted mb-2">Pagamentos</h3>
            <ul className="text-xs divide-y divide-editorial-border">
              {extrato.lotes.map(l => (
                <li key={l.id} className="py-2 flex items-center justify-between gap-2">
                  <span>{brl(l.valor)} · {l.reservas} reserva(s)</span>
                  <span className="flex items-center gap-2">{l.status === "pago" ? <><Check className="h-3.5 w-3.5 text-emerald-600" /> pago em {br(l.pagoEm)}</> : "em pagamento"}{l.comprovanteUrl && <a href={l.comprovanteUrl} target="_blank" rel="noopener noreferrer" className="underline">comprovante</a>}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>
    </div>
  );
}
