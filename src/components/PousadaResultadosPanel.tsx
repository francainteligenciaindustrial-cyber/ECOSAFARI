import React, { useEffect, useState } from "react";
import { LoaderCircle, TrendingUp } from "lucide-react";
import { adminFetch } from "../lib/adminFetch";

interface Resultados {
  meses: { month: string; occupancy: number; revenue: number; bookings: number }[];
  totais: { receita12m: number; reservas12m: number; ticketMedio: number; estadiaMedia: number; taxaCancelamento: number; reservasFuturas: number };
  origem: { label: string; count: number }[];
  nacionalidade: { label: string; count: number }[];
  canaisDoSite: { label: string; count: number }[];
}

const money = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const monthLabel = (key: string) => new Date(`${key}-01T12:00:00`).toLocaleDateString("pt-BR", { month: "short", year: "2-digit" }).replace(".", "");
const currentMonth = new Date().toISOString().slice(0, 7);

// Barras verticais de série única: uma cor, base zero, rótulo só no maior
// valor e no mês atual; o valor de cada barra aparece ao passar o mouse/foco.
function MonthBars({ title, data, format }: { title: string; data: { month: string; value: number }[]; format: (v: number) => string }) {
  const max = Math.max(...data.map(d => d.value), 0) || 1;
  const peak = data.reduce((a, b) => (b.value > a.value ? b : a), data[0]);
  return (
    <figure className="bg-white border border-editorial-border rounded-lg p-4">
      <figcaption className="text-[10px] uppercase tracking-widest font-bold text-editorial-muted mb-3">{title}</figcaption>
      <div className="flex items-end gap-1 h-40 border-b border-editorial-border" role="list">
        {data.map(d => {
          const future = d.month > currentMonth;
          const showLabel = d === peak || d.month === currentMonth;
          const text = `${monthLabel(d.month)}: ${format(d.value)}`;
          return (
            <div key={d.month} role="listitem" tabIndex={0} title={text} aria-label={text} className="group flex-1 h-full flex flex-col justify-end items-center">
              {showLabel && d.value > 0 && <span className="text-[9px] font-bold text-editorial-text mb-0.5 whitespace-nowrap">{format(d.value)}</span>}
              <span
                className={`w-full max-w-[28px] rounded-t-[4px] ${future ? "bg-editorial-primary/35" : "bg-editorial-primary"} group-hover:opacity-80`}
                style={{ height: `${Math.max(d.value > 0 ? 2 : 0, (d.value / max) * 100)}%` }}
              />
            </div>
          );
        })}
      </div>
      <div className="flex gap-1 mt-1" aria-hidden="true">
        {data.map(d => <span key={d.month} className="flex-1 text-center text-[9px] text-editorial-muted truncate">{monthLabel(d.month)}</span>)}
      </div>
      <p className="text-[10px] text-editorial-muted mt-2">Barras claras = meses à frente (reservas já feitas).</p>
    </figure>
  );
}

function RankBars({ title, data }: { title: string; data: { label: string; count: number }[] }) {
  const total = data.reduce((a, b) => a + b.count, 0) || 1;
  return (
    <figure className="bg-white border border-editorial-border rounded-lg p-4">
      <figcaption className="text-[10px] uppercase tracking-widest font-bold text-editorial-muted mb-3">{title}</figcaption>
      {data.length === 0 ? <p className="text-xs text-editorial-muted">Sem dados ainda.</p> : (
        <ul className="space-y-2">
          {data.map(d => (
            <li key={d.label} className="text-xs">
              <div className="flex justify-between gap-2 mb-0.5"><span className="text-editorial-text truncate">{d.label}</span><span className="text-editorial-muted whitespace-nowrap">{d.count} · {Math.round((d.count / total) * 100)}%</span></div>
              <div className="h-2 bg-editorial-secondary rounded-full overflow-hidden"><div className="h-full bg-editorial-primary rounded-full" style={{ width: `${(d.count / total) * 100}%` }} /></div>
            </li>
          ))}
        </ul>
      )}
    </figure>
  );
}

// Aba "Resultados" do portal do parceiro: ocupação, receita e origem das
// reservas da própria pousada (GET /api/pousadas/:id/resultados).
export default function PousadaResultadosPanel({ pousadaId }: { pousadaId: string }) {
  const [data, setData] = useState<Resultados | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    adminFetch(`/api/pousadas/${encodeURIComponent(pousadaId)}/resultados`)
      .then(async res => {
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body.error || "Não foi possível carregar os resultados.");
        setData(body);
      })
      .catch(err => setError(err.message));
  }, [pousadaId]);

  if (error) return <p className="bg-amber-50 border border-amber-200 text-amber-900 text-xs px-4 py-3 rounded-lg">{error}</p>;
  if (!data) return <div className="flex justify-center py-16"><LoaderCircle className="h-5 w-5 text-editorial-primary animate-spin" /></div>;

  const t = data.totais;
  const tiles = [
    { label: "Receita (12 meses)", value: money(t.receita12m) },
    { label: "Reservas (12 meses)", value: String(t.reservas12m) },
    { label: "Ticket médio", value: money(t.ticketMedio) },
    { label: "Estadia média", value: `${t.estadiaMedia.toLocaleString("pt-BR")} noites` },
    { label: "Cancelamentos", value: `${t.taxaCancelamento}%` },
    { label: "Reservas futuras", value: String(t.reservasFuturas) },
  ];

  return (
    <div className="space-y-6">
      <h2 className="font-serif text-xl font-bold text-editorial-primary flex items-center gap-2"><TrendingUp className="h-5 w-5" /> Resultados da pousada</h2>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {tiles.map(tile => (
          <div key={tile.label} className="bg-white border border-editorial-border rounded-lg p-3">
            <p className="text-[10px] uppercase tracking-widest font-bold text-editorial-muted">{tile.label}</p>
            <p className="font-serif text-xl font-bold text-editorial-text mt-1">{tile.value}</p>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <MonthBars title="Ocupação por mês" data={data.meses.map(m => ({ month: m.month, value: Math.round(m.occupancy * 100) }))} format={v => `${v}%`} />
        <MonthBars title="Receita por mês (pelo check-in)" data={data.meses.map(m => ({ month: m.month, value: m.revenue }))} format={money} />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <RankBars title="Origem das reservas" data={data.origem} />
        <RankBars title="Nacionalidade dos hóspedes" data={data.nacionalidade} />
        <RankBars title="Como os visitantes chegam ao site (todo o EcoSafari)" data={data.canaisDoSite} />
      </div>
      <details className="bg-white border border-editorial-border rounded-lg p-4 text-xs">
        <summary className="cursor-pointer font-bold text-editorial-primary">Ver tabela mês a mês</summary>
        <div className="overflow-x-auto mt-3">
          <table className="w-full min-w-[420px]">
            <thead className="text-left text-[10px] uppercase tracking-widest text-editorial-muted">
              <tr><th className="py-1">Mês</th><th>Ocupação</th><th>Reservas</th><th>Receita</th></tr>
            </thead>
            <tbody>
              {data.meses.map(m => (
                <tr key={m.month} className="border-t border-editorial-border">
                  <td className="py-1">{monthLabel(m.month)}</td><td>{Math.round(m.occupancy * 100)}%</td><td>{m.bookings}</td><td>{money(m.revenue)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
