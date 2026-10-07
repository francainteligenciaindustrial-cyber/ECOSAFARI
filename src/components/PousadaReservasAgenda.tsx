import React, { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, LoaderCircle, X, Check, AlertTriangle, Users, Mail, Phone, BedDouble, Utensils, Accessibility, CalendarDays } from "lucide-react";
import { Booking } from "../types";
import { adminFetch } from "../lib/adminFetch";
import { useToast } from "../lib/ToastProvider";
import PousadaConsumoManager from "./PousadaConsumoManager";
import ErrorBoundary from "./ErrorBoundary";

interface Props {
  pousadaId: string;
  unavailableDates?: string[];
}

const STATUS_STYLE: Record<Booking["status"], { label: string; bar: string; badge: string }> = {
  pendente_pagamento: { label: "Pendente pagamento", bar: "bg-zinc-400 text-white", badge: "bg-zinc-100 text-zinc-700 border-zinc-200" },
  pago: { label: "Pago — aguardando sua aprovação", bar: "bg-blue-600 text-white", badge: "bg-blue-50 text-blue-700 border-blue-200" },
  confirmado_pousada: { label: "Quarto confirmado", bar: "bg-amber-500 text-white", badge: "bg-amber-50 text-amber-700 border-amber-200" },
  confirmado_guia: { label: "Guia confirmado", bar: "bg-indigo-500 text-white", badge: "bg-indigo-50 text-indigo-700 border-indigo-200" },
  confirmado_total: { label: "Confirmado total", bar: "bg-emerald-600 text-white", badge: "bg-emerald-50 text-emerald-800 border-emerald-200" },
  cancelado: { label: "Cancelado", bar: "bg-red-200 text-red-800 line-through", badge: "bg-red-50 text-red-600 border-red-200" },
};

const WEEKDAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const DAY_MS = 24 * 60 * 60 * 1000;

const parseDay = (s: string) => {
  const [y, m, d] = s.slice(0, 10).split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
};
const dayKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const diffDays = (a: Date, b: Date) => Math.round((b.getTime() - a.getTime()) / DAY_MS);
const formatBR = (s: string) => parseDay(s).toLocaleDateString("pt-BR");

interface Bar {
  booking: Booking;
  startCol: number;
  span: number;
  lane: number;
  continuesBefore: boolean;
  continuesAfter: boolean;
}

// Agenda em formato de calendário mensal (tipo Google Agenda): cada barra é
// uma reserva ocupando do check-in até o check-out; clicar abre o detalhe da
// reserva com o consumo do hóspede.
export default function PousadaReservasAgenda({ pousadaId, unavailableDates = [] }: Props) {
  const { showToast } = useToast();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [month, setMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [showCancelled, setShowCancelled] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [acting, setActing] = useState(false);

  const fetchBookings = () => {
    setLoading(true);
    adminFetch(`/api/pousadas/${pousadaId}/bookings`)
      .then(res => (res.ok ? res.json() : []))
      .then(data => setBookings(Array.isArray(data) ? data : []))
      .catch(() => setBookings([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    setSelectedId(null);
    fetchBookings();
  }, [pousadaId]);

  const visible = useMemo(
    () => bookings.filter(b => b.checkIn && b.checkOut && (showCancelled || b.status !== "cancelado")),
    [bookings, showCancelled]
  );

  const weeks = useMemo(() => {
    const gridStart = addDays(month, -month.getDay());
    const lastOfMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0);
    const gridEnd = addDays(lastOfMonth, 6 - lastOfMonth.getDay());
    const result: { days: Date[]; bars: Bar[]; lanes: number }[] = [];
    for (let start = gridStart; start <= gridEnd; start = addDays(start, 7)) {
      const end = addDays(start, 6);
      const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
      const overlapping = visible
        .map(b => ({ b, ci: parseDay(b.checkIn), co: parseDay(b.checkOut) }))
        .filter(({ ci, co }) => ci <= end && co >= start)
        .sort((x, y) => x.ci.getTime() - y.ci.getTime() || y.co.getTime() - x.co.getTime());
      const laneEnds: number[] = [];
      const bars: Bar[] = overlapping.map(({ b, ci, co }) => {
        const s = Math.max(0, diffDays(start, ci));
        const e = Math.min(6, diffDays(start, co));
        let lane = laneEnds.findIndex(endCol => endCol < s);
        if (lane === -1) {
          lane = laneEnds.length;
          laneEnds.push(e);
        } else {
          laneEnds[lane] = e;
        }
        return { booking: b, startCol: s, span: Math.max(1, e - s + 1), lane, continuesBefore: ci < start, continuesAfter: co > end };
      });
      result.push({ days, bars, lanes: laneEnds.length });
    }
    return result;
  }, [month, visible]);

  const blocked = useMemo(() => new Set(unavailableDates), [unavailableDates]);
  const todayKey = dayKey(new Date());
  const selected = bookings.find(b => b.id === selectedId) || null;

  const monthStats = useMemo(() => {
    const first = month;
    const last = new Date(month.getFullYear(), month.getMonth() + 1, 0);
    const inMonth = bookings.filter(b => b.status !== "cancelado" && b.checkIn && parseDay(b.checkIn) <= last && parseDay(b.checkOut) >= first);
    return {
      count: inMonth.length,
      pendingApproval: inMonth.filter(b => b.status === "pago").length,
      guests: inMonth.reduce((sum, b) => sum + (b.adults || 0) + (b.children || 0), 0),
    };
  }, [bookings, month]);

  const handleStatus = async (booking: Booking, status: "confirmado_pousada" | "cancelado") => {
    if (status === "cancelado") {
      const dias = diffDays(parseDay(todayKey), parseDay(booking.checkIn));
      const jaConfirmada = ["confirmado_pousada", "confirmado_guia", "confirmado_total"].includes(booking.status);
      const aviso = jaConfirmada && dias < 45
        ? `Atenção: cancelar esta reserva confirmada com apenas ${dias} dias de antecedência (abaixo do mínimo de 45) aciona a política de cancelamento — perda de estrela de confiabilidade e/ou multa. Confirma mesmo assim?`
        : `Cancelar a reserva de ${booking.customerName}?`;
      if (!confirm(aviso)) return;
    }
    setActing(true);
    try {
      const res = await adminFetch(`/api/pousadas/${pousadaId}/bookings/${booking.id}/status`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        showToast(body.error || "Erro ao atualizar a reserva.", "error");
        return;
      }
      showToast("Reserva atualizada.", "success");
      fetchBookings();
    } finally {
      setActing(false);
    }
  };

  const monthLabel = month.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });

  return (
    <div className="bg-white border border-editorial-border rounded-lg overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 md:px-5 py-3 border-b border-editorial-border">
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => { const n = new Date(); setMonth(new Date(n.getFullYear(), n.getMonth(), 1)); }} className="text-[11px] font-bold uppercase tracking-widest border border-editorial-border px-3 py-1.5 rounded-md hover:bg-editorial-secondary transition cursor-pointer">
            Hoje
          </button>
          <button type="button" aria-label="Mês anterior" onClick={() => setMonth(m => new Date(m.getFullYear(), m.getMonth() - 1, 1))} className="p-1.5 rounded-full hover:bg-editorial-secondary transition cursor-pointer">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button type="button" aria-label="Próximo mês" onClick={() => setMonth(m => new Date(m.getFullYear(), m.getMonth() + 1, 1))} className="p-1.5 rounded-full hover:bg-editorial-secondary transition cursor-pointer">
            <ChevronRight className="h-4 w-4" />
          </button>
          <h3 className="font-serif text-lg font-bold text-editorial-primary capitalize ml-1">{monthLabel}</h3>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-[11px] text-editorial-muted">
          <span><strong className="text-editorial-text">{monthStats.count}</strong> reservas</span>
          <span><strong className="text-editorial-text">{monthStats.guests}</strong> hóspedes</span>
          {monthStats.pendingApproval > 0 && (
            <span className="text-blue-700 font-semibold">{monthStats.pendingApproval} aguardando aprovação</span>
          )}
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input type="checkbox" checked={showCancelled} onChange={e => setShowCancelled(e.target.checked)} className="accent-editorial-primary" />
            Mostrar canceladas
          </label>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-24"><LoaderCircle className="h-6 w-6 text-editorial-primary animate-spin" /></div>
      ) : (
        <div>
          <div className="grid grid-cols-7 border-b border-editorial-border bg-editorial-secondary/40">
            {WEEKDAYS.map(d => (
              <div key={d} className="text-center text-[10px] uppercase tracking-widest font-bold text-editorial-muted py-2">{d}</div>
            ))}
          </div>
          {weeks.map(week => (
            <div key={dayKey(week.days[0])} className="relative border-b border-editorial-border last:border-b-0" style={{ minHeight: `${Math.max(112, 34 + week.lanes * 24)}px` }}>
              <div className="absolute inset-0 grid grid-cols-7">
                {week.days.map(day => {
                  const key = dayKey(day);
                  const outside = day.getMonth() !== month.getMonth();
                  const isBlocked = blocked.has(key);
                  return (
                    <div
                      key={key}
                      title={isBlocked ? "Data bloqueada" : undefined}
                      className={`border-r border-editorial-border last:border-r-0 px-1.5 pt-1 ${outside ? "bg-zinc-50/70" : ""} ${isBlocked ? "bg-[repeating-linear-gradient(45deg,#f4f4f5,#f4f4f5_6px,#ffffff_6px,#ffffff_12px)]" : ""}`}
                    >
                      <span className={`inline-flex items-center justify-center text-[11px] w-6 h-6 rounded-full ${key === todayKey ? "bg-editorial-primary text-white font-bold" : outside ? "text-zinc-400" : "text-editorial-text"}`}>
                        {day.getDate()}
                      </span>
                    </div>
                  );
                })}
              </div>
              <div className="relative grid grid-cols-7 gap-y-1 pt-8 pb-2" style={{ gridAutoRows: "20px" }}>
                {week.bars.map(bar => {
                  const style = STATUS_STYLE[bar.booking.status] || STATUS_STYLE.pendente_pagamento;
                  return (
                    <button
                      key={bar.booking.id}
                      type="button"
                      onClick={() => setSelectedId(bar.booking.id)}
                      title={`${bar.booking.customerName} — ${formatBR(bar.booking.checkIn)} a ${formatBR(bar.booking.checkOut)} (${style.label})`}
                      style={{ gridColumn: `${bar.startCol + 1} / span ${bar.span}`, gridRow: bar.lane + 1 }}
                      className={`mx-0.5 h-5 px-2 text-left text-[10px] font-semibold truncate shadow-sm hover:brightness-110 transition cursor-pointer ${style.bar} ${bar.continuesBefore ? "rounded-l-none" : "rounded-l-md"} ${bar.continuesAfter ? "rounded-r-none" : "rounded-r-md"} ${selectedId === bar.booking.id ? "ring-2 ring-offset-1 ring-editorial-primary" : ""}`}
                    >
                      {bar.continuesBefore ? "← " : ""}{bar.booking.customerName}{bar.booking.roomType ? ` · ${bar.booking.roomType}` : ""}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
          <div className="flex flex-wrap gap-3 px-4 py-3 border-t border-editorial-border text-[10px] text-editorial-muted">
            {(Object.keys(STATUS_STYLE) as Booking["status"][]).filter(s => s !== "cancelado" || showCancelled).map(s => (
              <span key={s} className="flex items-center gap-1.5">
                <span className={`inline-block w-3 h-3 rounded-sm ${STATUS_STYLE[s].bar}`} /> {STATUS_STYLE[s].label}
              </span>
            ))}
            <span className="flex items-center gap-1.5">
              <span className="inline-block w-3 h-3 rounded-sm border border-zinc-300 bg-[repeating-linear-gradient(45deg,#e4e4e7,#e4e4e7_2px,#ffffff_2px,#ffffff_4px)]" /> Data bloqueada
            </span>
          </div>
        </div>
      )}

      {selected && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/30" onClick={() => setSelectedId(null)}>
          <div className="w-full max-w-lg h-full bg-white shadow-2xl overflow-y-auto animate-fadeIn" onClick={e => e.stopPropagation()}>
            <div className="sticky top-0 bg-white border-b border-editorial-border px-5 py-4 flex items-start justify-between gap-3 z-10">
              <div className="min-w-0">
                <p className="text-[10px] uppercase tracking-widest font-bold text-editorial-muted">Reserva</p>
                <h3 className="font-serif text-xl font-bold text-editorial-primary truncate">{selected.customerName}</h3>
                <span className={`inline-block mt-1 text-[9px] uppercase tracking-widest font-bold px-2 py-0.5 rounded-full border ${STATUS_STYLE[selected.status]?.badge || ""}`}>
                  {STATUS_STYLE[selected.status]?.label || selected.status}
                </span>
              </div>
              <button type="button" aria-label="Fechar" onClick={() => setSelectedId(null)} className="p-1.5 rounded-full hover:bg-editorial-secondary cursor-pointer">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="px-5 py-5 space-y-5 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div className="border border-editorial-border rounded-md p-3">
                  <p className="text-[10px] uppercase tracking-widest text-editorial-muted font-bold mb-1">Check-in</p>
                  <p className="font-semibold text-sm">{formatBR(selected.checkIn)}</p>
                </div>
                <div className="border border-editorial-border rounded-md p-3">
                  <p className="text-[10px] uppercase tracking-widest text-editorial-muted font-bold mb-1">Check-out</p>
                  <p className="font-semibold text-sm">{formatBR(selected.checkOut)}</p>
                </div>
              </div>

              <ul className="space-y-2 text-editorial-text">
                <li className="flex items-center gap-2"><Users className="h-3.5 w-3.5 text-editorial-primary" /> {selected.adults} adulto(s){selected.children ? `, ${selected.children} criança(s)${selected.childAges ? ` (${selected.childAges})` : ""}` : ""}</li>
                {selected.roomType && <li className="flex items-center gap-2"><BedDouble className="h-3.5 w-3.5 text-editorial-primary" /> {selected.roomType}</li>}
                <li className="flex items-center gap-2"><CalendarDays className="h-3.5 w-3.5 text-editorial-primary" /> {selected.experienceType || "—"}</li>
                <li className="flex items-center gap-2"><Mail className="h-3.5 w-3.5 text-editorial-primary" /> <a href={`mailto:${selected.customerEmail}`} className="underline">{selected.customerEmail}</a></li>
                {selected.customerPhone && <li className="flex items-center gap-2"><Phone className="h-3.5 w-3.5 text-editorial-primary" /> {selected.customerPhone}</li>}
                {selected.nationality && <li className="text-editorial-muted">Nacionalidade: {selected.nationality}</li>}
                {selected.dietaryRestrictions && <li className="flex items-start gap-2"><Utensils className="h-3.5 w-3.5 text-editorial-primary mt-0.5" /> {selected.dietaryRestrictions}</li>}
                {selected.specialNeeds && <li className="flex items-start gap-2"><Accessibility className="h-3.5 w-3.5 text-editorial-primary mt-0.5" /> {selected.specialNeeds}</li>}
                {selected.guideName && <li className="text-editorial-muted">Guia: {selected.guideName}</li>}
                <li className="font-semibold">Valor da reserva: R$ {Number(selected.totalPrice || 0).toLocaleString("pt-BR")}</li>
              </ul>

              <div className="flex flex-wrap gap-2">
                {selected.status === "pago" && (
                  <button type="button" disabled={acting} onClick={() => handleStatus(selected, "confirmado_pousada")} className="flex items-center gap-1 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-800 font-bold px-3 py-2 rounded-md text-[11px] disabled:opacity-60 cursor-pointer">
                    <Check className="h-3.5 w-3.5" /> Aprovar quarto
                  </button>
                )}
                {selected.status !== "cancelado" && selected.status !== "confirmado_total" && (
                  <button type="button" disabled={acting} onClick={() => handleStatus(selected, "cancelado")} className="flex items-center gap-1 bg-red-50 hover:bg-red-100 border border-red-200 text-red-700 font-bold px-3 py-2 rounded-md text-[11px] disabled:opacity-60 cursor-pointer">
                    <X className="h-3.5 w-3.5" /> Cancelar reserva
                  </button>
                )}
              </div>
              <p className="text-editorial-muted text-[11px] flex items-start gap-1.5">
                <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0 mt-0.5 text-amber-600" />
                Cancelar uma reserva já confirmada com menos de 45 dias de antecedência gera penalidade.
              </p>

              <div className="border-t border-editorial-border pt-5">
                <ErrorBoundary variant="section" sectionLabel="o consumo do hóspede">
                  <PousadaConsumoManager pousadaId={pousadaId} bookingId={selected.id} guestName={selected.customerName} />
                </ErrorBoundary>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
