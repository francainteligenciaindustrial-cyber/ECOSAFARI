import React, { useState, useEffect } from "react";
import { ShieldAlert, LoaderCircle, Star, DollarSign } from "lucide-react";
import { adminFetch } from "../lib/adminFetch";

interface ResumoPrestador {
  prestadorType: "pousada" | "guia";
  prestadorId: string;
  prestadorName: string;
  totalEstrelasPerdidas: number;
  totalDevido: number;
  qtdCancelamentos: number;
}

// Selo de confiabilidade só-admin — nunca aparece no perfil público nem
// mexe na nota real de avaliação (essa continua vindo só de hóspede de
// verdade). Soma as penalidades por cancelamento tardio (política de 45
// dias) registradas em prestador_penalidades.
export default function AdminConfiabilidadePanel() {
  const [resumo, setResumo] = useState<ResumoPrestador[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    adminFetch("/api/gestao/confiabilidade")
      .then(res => (res.ok ? res.json() : { resumoPorPrestador: [] }))
      .then(data => setResumo(data.resumoPorPrestador || []))
      .catch(() => setResumo([]))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="bg-white border border-zinc-200 rounded-2xl p-6 shadow-sm flex justify-center">
        <LoaderCircle className="h-5 w-5 text-emerald-600 animate-spin" />
      </div>
    );
  }

  return (
    <div className="bg-white border border-zinc-200 rounded-2xl p-6 shadow-sm space-y-3">
      <h3 className="font-bold text-base text-zinc-900 flex items-center gap-1.5">
        <ShieldAlert className="h-5 w-5 text-amber-600" /> Confiabilidade dos Prestadores
      </h3>
      <p className="text-zinc-500 text-xs -mt-2">
        Selo interno (só visível aqui) — nunca afeta a nota pública de avaliação. Reflete cancelamentos de reserva já confirmada com menos de 45 dias de antecedência.
      </p>

      {resumo.length === 0 ? (
        <p className="text-zinc-400 text-xs italic py-2">Nenhuma penalidade registrada — ninguém cancelou fora do prazo até agora.</p>
      ) : (
        <div className="divide-y divide-zinc-100">
          {resumo
            .slice()
            .sort((a, b) => b.totalEstrelasPerdidas - a.totalEstrelasPerdidas || b.totalDevido - a.totalDevido)
            .map(r => (
              <div key={`${r.prestadorType}:${r.prestadorId}`} className="py-2.5 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-zinc-800 truncate">
                    {r.prestadorName} <span className="text-zinc-400 font-normal">({r.prestadorType === "pousada" ? "Pousada" : "Guia"})</span>
                  </p>
                  <p className="text-[10px] text-zinc-400">{r.qtdCancelamentos} cancelamento(s) fora do prazo</p>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0 text-xs font-bold">
                  {r.totalEstrelasPerdidas > 0 && (
                    <span className="flex items-center gap-1 text-amber-700"><Star className="h-3.5 w-3.5" /> -{r.totalEstrelasPerdidas}</span>
                  )}
                  {r.totalDevido > 0 && (
                    <span className="flex items-center gap-1 text-red-600"><DollarSign className="h-3.5 w-3.5" /> R$ {r.totalDevido.toLocaleString('pt-BR')}</span>
                  )}
                </div>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}
