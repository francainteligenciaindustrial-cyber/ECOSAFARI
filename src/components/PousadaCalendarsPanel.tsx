import React, { useState } from "react";
import { CalendarPlus, ExternalLink, LoaderCircle, Copy, Check } from "lucide-react";
import { adminFetch } from "../lib/adminFetch";
import { useToast } from "../lib/ToastProvider";
import { Pousada } from "../types";

interface PousadaCalendarsPanelProps {
  pousadas: Pousada[];
  connected: boolean;
  onRefreshData: () => void;
}

// Lista todas as pousadas e o calendário Google dedicado de cada uma (ou o
// botão pra criar um) — antes disso, toda reserva de toda pousada caía no
// mesmo calendário "primary" da conta conectada, sem separação nenhuma.
// Cada calendário criado aqui vive DENTRO da mesma conta já conectada (não
// é uma segunda conexão OAuth por pousada) — ver
// POST /api/pousadas/:id/google-calendar em server.ts.
export default function PousadaCalendarsPanel({ pousadas, connected, onRefreshData }: PousadaCalendarsPanelProps) {
  const { showToast } = useToast();
  const [creatingFor, setCreatingFor] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  if (!connected) return null;

  const handleCreateCalendar = async (pousada: Pousada) => {
    setCreatingFor(pousada.id);
    try {
      const res = await adminFetch(`/api/pousadas/${pousada.id}/google-calendar`, { method: "POST" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        showToast(body.error || "Erro ao criar o calendário.", "error");
        return;
      }
      showToast(`Calendário criado para ${pousada.name}.`, "success");
      onRefreshData();
    } finally {
      setCreatingFor(null);
    }
  };

  const handleCopyId = (id: string) => {
    navigator.clipboard.writeText(id);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1500);
  };

  return (
    <div className="bg-white border border-zinc-200 rounded-2xl p-6 shadow-sm space-y-1">
      <h3 className="font-bold text-base text-zinc-900 mb-1">Calendários por Pousada</h3>
      <p className="text-zinc-500 text-xs mb-4">
        Cada pousada pode ter seu próprio calendário dentro da mesma conta Google conectada acima — reservas totalmente confirmadas dessa pousada passam a sincronizar só nele, em vez de todas caírem juntas no calendário principal.
      </p>
      <div className="divide-y divide-zinc-100">
        {pousadas.map(p => (
          <div key={p.id} className="py-3 flex items-center justify-between gap-3">
            <span className="text-sm font-semibold text-zinc-800 truncate">{p.name}</span>
            {p.googleCalendarId ? (
              <div className="flex items-center gap-2 flex-shrink-0">
                <button
                  onClick={() => handleCopyId(p.googleCalendarId!)}
                  title="Copiar ID do calendário"
                  className="text-zinc-400 hover:text-zinc-600 transition cursor-pointer"
                >
                  {copiedId === p.googleCalendarId ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                </button>
                <a
                  href={`https://calendar.google.com/calendar/u/0/r?cid=${encodeURIComponent(p.googleCalendarId)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 text-emerald-700 hover:text-emerald-800 text-xs font-bold"
                >
                  Ver no Google Calendar <ExternalLink className="h-3 w-3" />
                </a>
              </div>
            ) : (
              <button
                onClick={() => handleCreateCalendar(p)}
                disabled={creatingFor === p.id}
                className="flex items-center gap-1.5 bg-zinc-50 hover:bg-zinc-100 border border-zinc-200 text-zinc-700 font-bold px-3 py-1.5 rounded text-[11px] transition disabled:opacity-60 flex-shrink-0"
              >
                {creatingFor === p.id ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <CalendarPlus className="h-3.5 w-3.5" />}
                Criar calendário
              </button>
            )}
          </div>
        ))}
        {pousadas.length === 0 && (
          <p className="text-zinc-400 text-xs py-3">Nenhuma pousada cadastrada ainda.</p>
        )}
      </div>
    </div>
  );
}
