import React, { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

interface Props {
  value: string[]; // datas bloqueadas, formato YYYY-MM-DD
  onChange: (dates: string[]) => void;
}

const WEEKDAYS = ["D", "S", "T", "Q", "Q", "S", "S"];
const MONTHS = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

function toISODate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

// Agenda real do guia — em vez de só um liga/desliga geral, deixa bloquear
// datas específicas (uma viagem marcada, uma folga) clicando num calendário
// de verdade, mês a mês.
export default function GuideAvailabilityCalendar({ value, onChange }: Props) {
  const today = startOfToday();
  const [cursor, setCursor] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));

  const blocked = new Set(value);
  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const startWeekday = new Date(year, month, 1).getDay();

  const cells: (Date | null)[] = [];
  for (let i = 0; i < startWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d));

  const toggleDate = (d: Date) => {
    const iso = toISODate(d);
    onChange(blocked.has(iso) ? value.filter(x => x !== iso) : [...value, iso].sort());
  };

  return (
    <div className="max-w-[240px]">
      <div className="flex items-center justify-between mb-2">
        <button type="button" onClick={() => setCursor(new Date(year, month - 1, 1))} className="p-1 text-editorial-muted hover:text-editorial-primary transition cursor-pointer" aria-label="Mês anterior">
          <ChevronLeft className="h-3.5 w-3.5" />
        </button>
        <span className="text-[11px] font-bold text-editorial-text uppercase tracking-wider">{MONTHS[month]} {year}</span>
        <button type="button" onClick={() => setCursor(new Date(year, month + 1, 1))} className="p-1 text-editorial-muted hover:text-editorial-primary transition cursor-pointer" aria-label="Próximo mês">
          <ChevronRight className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="grid grid-cols-7 gap-0.5 text-center">
        {WEEKDAYS.map((w, i) => (
          <div key={i} className="text-[8px] font-bold text-editorial-muted uppercase py-0.5">{w}</div>
        ))}
        {cells.map((d, i) => {
          if (!d) return <div key={`blank-${i}`} />;
          const iso = toISODate(d);
          const isPast = d < today;
          const isBlocked = blocked.has(iso);
          return (
            <button
              type="button"
              key={iso}
              disabled={isPast}
              onClick={() => toggleDate(d)}
              title={isBlocked ? "Indisponível — clique para liberar" : "Disponível — clique para bloquear"}
              className={`aspect-square w-full rounded text-[10px] font-medium transition cursor-pointer disabled:cursor-not-allowed leading-none ${
                isPast
                  ? "text-editorial-border"
                  : isBlocked
                  ? "bg-red-100 text-red-700 hover:bg-red-200 font-bold"
                  : "text-editorial-text hover:bg-editorial-secondary"
              }`}
            >
              {d.getDate()}
            </button>
          );
        })}
      </div>

      <div className="flex items-center gap-1.5 mt-2 text-[9px] text-editorial-muted">
        <span className="w-2.5 h-2.5 rounded bg-red-100 border border-red-200 inline-block flex-shrink-0" />
        <span>Indisponível — clique pra bloquear/liberar</span>
      </div>
    </div>
  );
}
