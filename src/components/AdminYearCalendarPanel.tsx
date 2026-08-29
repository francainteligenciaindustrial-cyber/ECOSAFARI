import React, { useState, useMemo } from "react";
import { ChevronLeft, ChevronRight, CalendarDays, X, User, Compass, ShieldCheck } from "lucide-react";
import { Booking } from "../types";

interface Props {
  bookings: Booking[];
}

const WEEKDAYS = ["D", "S", "T", "Q", "Q", "S", "S"];
const MONTHS = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

const STATUS_LABELS: Record<Booking["status"], { label: string; className: string }> = {
  pendente_pagamento: { label: "Pendente Pagamento", className: "bg-zinc-100 text-zinc-700" },
  pago: { label: "Pago", className: "bg-blue-50 text-blue-700" },
  confirmado_pousada: { label: "Confirmado Pousada", className: "bg-amber-50 text-amber-700" },
  confirmado_guia: { label: "Confirmado Guia", className: "bg-indigo-50 text-indigo-700" },
  confirmado_total: { label: "Confirmado Total", className: "bg-emerald-50 text-emerald-800" },
  cancelado: { label: "Cancelado", className: "bg-red-50 text-red-600" },
};

function toISODate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// Cada dia entre check-in e check-out (inclusive), como string YYYY-MM-DD —
// pra marcar todo o intervalo da estadia no calendário, não só o dia de
// chegada.
function eachDateInRange(startISO: string, endISO: string): string[] {
  const out: string[] = [];
  const start = new Date(`${startISO}T00:00:00`);
  const end = new Date(`${endISO}T00:00:00`);
  if (isNaN(start.getTime()) || isNaN(end.getTime()) || start > end) return out;
  const d = new Date(start);
  while (d <= end) {
    out.push(toISODate(d));
    d.setDate(d.getDate() + 1);
  }
  return out;
}

function MiniMonth({
  year, month, bookingsByDate, selectedDate, onSelectDate,
}: {
  year: number; month: number; bookingsByDate: Map<string, Booking[]>;
  selectedDate: string | null; onSelectDate: (iso: string) => void;
}) {
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const startWeekday = new Date(year, month, 1).getDay();
  const todayISO = toISODate(new Date());

  const cells: (Date | null)[] = [];
  for (let i = 0; i < startWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d));

  return (
    <div className="border border-zinc-200 rounded-xl p-3">
      <h4 className="text-[11px] font-bold text-zinc-800 uppercase tracking-wider mb-2 text-center">{MONTHS[month]}</h4>
      <div className="grid grid-cols-7 gap-0.5 text-center">
        {WEEKDAYS.map((w, i) => (
          <div key={i} className="text-[8px] font-bold text-zinc-400 uppercase py-0.5">{w}</div>
        ))}
        {cells.map((d, i) => {
          if (!d) return <div key={`blank-${i}`} />;
          const iso = toISODate(d);
          const dayBookings = bookingsByDate.get(iso) || [];
          const hasBookings = dayBookings.length > 0;
          const isToday = iso === todayISO;
          const isSelected = iso === selectedDate;
          return (
            <button
              type="button"
              key={iso}
              onClick={() => hasBookings && onSelectDate(iso)}
              disabled={!hasBookings}
              title={hasBookings ? `${dayBookings.length} reserva(s) — clique pra ver` : undefined}
              className={`relative aspect-square w-full rounded text-[9px] leading-none transition ${
                hasBookings ? "cursor-pointer font-bold" : "cursor-default"
              } ${
                isSelected
                  ? "bg-editorial-primary text-white"
                  : hasBookings
                  ? "bg-emerald-100 text-emerald-800 hover:bg-emerald-200"
                  : isToday
                  ? "text-editorial-primary font-bold"
                  : "text-zinc-500"
              }`}
            >
              {d.getDate()}
              {hasBookings && dayBookings.length > 1 && !isSelected && (
                <span className="absolute -top-0.5 -right-0.5 bg-emerald-600 text-white rounded-full text-[6px] w-2.5 h-2.5 flex items-center justify-center leading-none">
                  {dayBookings.length > 9 ? "9+" : dayBookings.length}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// Visão de calendário de verdade (igual ao Google Calendar, só que os 12
// meses do ano numa tela só, em escala menor) — em vez de uma lista, mostra
// os dias com reserva marcados direto na grade de cada mês. Clicar num dia
// marcado abre o detalhe: quem, onde, com qual guia, qual status.
export default function AdminYearCalendarPanel({ bookings }: Props) {
  const [year, setYear] = useState(() => new Date().getFullYear());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const activeBookings = useMemo(() => bookings.filter(b => b.status !== "cancelado"), [bookings]);

  const bookingsByDate = useMemo(() => {
    const map = new Map<string, Booking[]>();
    for (const b of activeBookings) {
      for (const iso of eachDateInRange(b.checkIn, b.checkOut)) {
        if (!map.has(iso)) map.set(iso, []);
        map.get(iso)!.push(b);
      }
    }
    return map;
  }, [activeBookings]);

  const selectedBookings = selectedDate ? bookingsByDate.get(selectedDate) || [] : [];

  return (
    <div className="bg-white border border-zinc-200 rounded-2xl p-6 shadow-sm space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h3 className="font-bold text-base text-zinc-900 flex items-center gap-1.5">
          <CalendarDays className="h-5 w-5 text-emerald-600" /> Calendário Anual
        </h3>
        <div className="flex items-center gap-2">
          <button onClick={() => { setYear(y => y - 1); setSelectedDate(null); }} className="p-1.5 text-zinc-400 hover:text-editorial-primary transition cursor-pointer" aria-label="Ano anterior">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="text-sm font-bold text-zinc-900 w-14 text-center">{year}</span>
          <button onClick={() => { setYear(y => y + 1); setSelectedDate(null); }} className="p-1.5 text-zinc-400 hover:text-editorial-primary transition cursor-pointer" aria-label="Próximo ano">
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>
      <p className="text-zinc-500 text-xs -mt-3">Dias com reserva ficam marcados em verde — clique num dia marcado pra ver quem, onde e com qual guia.</p>

      {selectedDate && (
        <div className="bg-editorial-secondary/40 border border-editorial-border rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-bold text-editorial-text">{new Date(`${selectedDate}T00:00:00`).toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" })}</h4>
            <button onClick={() => setSelectedDate(null)} className="text-zinc-400 hover:text-zinc-700 transition cursor-pointer">
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="space-y-2">
            {selectedBookings.map(b => {
              const statusInfo = STATUS_LABELS[b.status];
              return (
                <div key={b.id} className="bg-white border border-editorial-border rounded-lg p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-zinc-900 flex items-center gap-1.5"><User className="h-3 w-3 text-zinc-400" /> {b.customerName}</p>
                    <p className="text-[11px] text-zinc-500 mt-0.5">{b.pousadaName} · {b.checkIn} até {b.checkOut}</p>
                    <p className="text-[11px] text-zinc-500 mt-0.5 flex items-center gap-1">
                      <Compass className="h-3 w-3 text-zinc-400" /> {b.guideName ? `Guia: ${b.guideName}` : "Nenhum guia alocado"}
                    </p>
                  </div>
                  <span className={`text-[9px] uppercase tracking-widest font-bold px-2 py-1 rounded-full flex-shrink-0 flex items-center gap-1 w-max ${statusInfo.className}`}>
                    {b.status === "confirmado_total" && <ShieldCheck className="h-3 w-3" />} {statusInfo.label}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
        {MONTHS.map((_, month) => (
          <MiniMonth
            key={month}
            year={year}
            month={month}
            bookingsByDate={bookingsByDate}
            selectedDate={selectedDate}
            onSelectDate={setSelectedDate}
          />
        ))}
      </div>
    </div>
  );
}
