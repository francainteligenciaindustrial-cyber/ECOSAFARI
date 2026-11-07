import React, { useEffect, useState } from "react";
import { Hourglass } from "lucide-react";
import { adminFetch } from "../lib/adminFetch";

interface Entrada { id: string; nome: string; checkIn: string; checkOut: string; adults: number; children: number; roomType?: string | null; status: "ativa" | "avisada"; createdAt: string }
const br = (iso: string) => String(iso || "").slice(0, 10).split("-").reverse().join("/");

// Agenda da pousada → quem queria vir em datas já ocupadas e não aceitou
// outra data. Mostra a demanda (sem contato: o aviso sai pelo Ipantanal,
// por e-mail, assim que a data liberar).
export default function PousadaListaEsperaPanel({ pousadaId }: { pousadaId: string }) {
  const [lista, setLista] = useState<Entrada[] | null>(null);
  useEffect(() => {
    adminFetch(`/api/pousadas/${encodeURIComponent(pousadaId)}/lista-espera`).then(r => (r.ok ? r.json() : [])).then(setLista).catch(() => setLista([]));
  }, [pousadaId]);
  if (!lista || lista.length === 0) return null;
  return (
    <section className="bg-white border border-editorial-border rounded-2xl p-5">
      <h2 className="text-sm font-bold text-editorial-text flex items-center gap-2"><Hourglass className="h-4 w-4 text-editorial-accent" /> Lista de espera ({lista.length})</h2>
      <p className="text-editorial-muted text-xs mt-1 mb-3">Hóspedes que queriam estas datas, mas estavam ocupadas. Se você liberar a data (ou uma reserva for cancelada), eles são avisados por e-mail na hora.</p>
      <ul className="divide-y divide-editorial-border text-sm">
        {lista.map(e => (
          <li key={e.id} className="py-2 flex flex-wrap items-center justify-between gap-2">
            <span><strong>{br(e.checkIn)} a {br(e.checkOut)}</strong> · {e.adults + e.children} pessoa(s){e.roomType ? ` · ${e.roomType}` : ""}{e.nome ? ` · ${e.nome}` : ""}</span>
            <span className={`text-[10px] uppercase tracking-widest font-bold px-2 py-0.5 rounded-full ${e.status === "avisada" ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-800"}`}>{e.status === "avisada" ? "Avisado" : "Esperando"}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
