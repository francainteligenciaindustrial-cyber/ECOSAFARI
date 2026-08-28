import React, { useState, useEffect } from "react";
import { CalendarClock, LoaderCircle, Check, X, AlertTriangle } from "lucide-react";
import { Booking } from "../types";
import { adminFetch } from "../lib/adminFetch";
import { useToast } from "../lib/ToastProvider";

interface Props {
  partnerType: "pousada" | "guia";
  partnerId: string;
}

const STATUS_LABELS: Record<string, { label: string; className: string }> = {
  pendente_pagamento: { label: "Pendente Pagamento", className: "bg-zinc-100 text-zinc-700 border-zinc-200" },
  pago: { label: "Pago — aguardando confirmação", className: "bg-blue-50 text-blue-700 border-blue-200" },
  confirmado_pousada: { label: "Quarto confirmado", className: "bg-amber-50 text-amber-700 border-amber-200" },
  confirmado_guia: { label: "Guia confirmado", className: "bg-indigo-50 text-indigo-700 border-indigo-200" },
  confirmado_total: { label: "Confirmado Total", className: "bg-emerald-50 text-emerald-800 border-emerald-200" },
  cancelado: { label: "Cancelado", className: "bg-red-50 text-red-600 border-red-200" },
};

// Self-atendimento da própria agenda — pousada e guia confirmam/cancelam a
// própria reserva direto do próprio portal, sem depender do admin fazer
// isso por eles. Cancelar uma reserva já confirmada fora do prazo mínimo de
// 45 dias aciona a política de penalidade (calculada e registrada no
// servidor — aqui só avisa antes de confirmar a ação).
export default function PartnerBookingsCalendar({ partnerType, partnerId }: Props) {
  const { showToast } = useToast();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [actingOn, setActingOn] = useState<string | null>(null);

  const apiBase = partnerType === "pousada" ? "pousadas" : "guides";
  const confirmStatus = partnerType === "pousada" ? "confirmado_pousada" : "confirmado_guia";
  const confirmLabel = partnerType === "pousada" ? "Aprovar Quarto" : "Confirmar Participação";
  const canConfirmFrom = partnerType === "pousada"
    ? (s: string) => s === "pago"
    : (s: string) => s === "pago" || s === "confirmado_pousada";

  const fetchBookings = () => {
    setLoading(true);
    adminFetch(`/api/${apiBase}/${partnerId}/bookings`)
      .then(res => (res.ok ? res.json() : []))
      .then(setBookings)
      .catch(() => setBookings([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchBookings(); }, [partnerId]);

  const diasAteCheckIn = (checkIn: string) => {
    const hoje = new Date(new Date().toISOString().slice(0, 10));
    return Math.round((new Date(checkIn).getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24));
  };

  const handleUpdateStatus = async (booking: Booking, status: string) => {
    if (status === "cancelado" && ["confirmado_pousada", "confirmado_guia", "confirmado_total"].includes(booking.status)) {
      const dias = diasAteCheckIn(booking.checkIn);
      const dentroDoPrazo = dias >= 45;
      const aviso = dentroDoPrazo
        ? `Cancelar esta reserva confirmada (${dias} dias antes do check-in) — dentro do prazo mínimo de 45 dias, sem penalidade. Confirma?`
        : `Atenção: cancelar esta reserva confirmada com apenas ${dias} dias de antecedência (abaixo do mínimo de 45) aciona a política de cancelamento — perda de estrela de confiabilidade e/ou multa em dinheiro, dependendo do prazo. Confirma o cancelamento mesmo assim?`;
      if (!confirm(aviso)) return;
    }

    setActingOn(booking.id);
    try {
      const res = await adminFetch(`/api/${apiBase}/${partnerId}/bookings/${booking.id}/status`, {
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
      setActingOn(null);
    }
  };

  return (
    <div className="bg-white border border-editorial-border rounded-lg p-6 space-y-4">
      <div>
        <h3 className="font-bold text-sm text-editorial-text flex items-center gap-2 mb-1">
          <CalendarClock className="h-4 w-4 text-editorial-primary" /> Minha Agenda de Reservas
        </h3>
        <p className="text-editorial-muted text-xs flex items-start gap-1.5">
          <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0 mt-0.5 text-amber-600" />
          Cancelar uma reserva já confirmada com menos de 45 dias de antecedência gera penalidade (estrela de confiabilidade e/ou multa, conforme o prazo).
        </p>
      </div>

      {loading ? (
        <div className="flex justify-center py-6"><LoaderCircle className="h-5 w-5 text-editorial-primary animate-spin" /></div>
      ) : (
        <div className="space-y-2">
          {bookings.map(b => {
            const statusInfo = STATUS_LABELS[b.status] || { label: b.status, className: "bg-zinc-100 text-zinc-600 border-zinc-200" };
            const canConfirm = canConfirmFrom(b.status);
            const canCancel = b.status !== "cancelado" && b.status !== "confirmado_total";
            return (
              <div key={b.id} className="border border-editorial-border rounded-md p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-editorial-text">{b.checkIn} até {b.checkOut}</p>
                  <p className="text-editorial-muted text-[11px] truncate">{b.customerName} — {b.experienceType}</p>
                  <span className={`inline-block mt-1 text-[9px] uppercase tracking-widest font-bold px-2 py-0.5 rounded-full border ${statusInfo.className}`}>{statusInfo.label}</span>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {canConfirm && (
                    <button
                      onClick={() => handleUpdateStatus(b, confirmStatus)}
                      disabled={actingOn === b.id}
                      className="flex items-center gap-1 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-800 font-bold px-2.5 py-1.5 rounded text-[10px] disabled:opacity-60 cursor-pointer"
                    >
                      <Check className="h-3 w-3" /> {confirmLabel}
                    </button>
                  )}
                  {canCancel && (
                    <button
                      onClick={() => handleUpdateStatus(b, "cancelado")}
                      disabled={actingOn === b.id}
                      className="flex items-center gap-1 bg-red-50 hover:bg-red-100 border border-red-200 text-red-700 font-bold px-2.5 py-1.5 rounded text-[10px] disabled:opacity-60 cursor-pointer"
                    >
                      <X className="h-3 w-3" /> Cancelar
                    </button>
                  )}
                </div>
              </div>
            );
          })}
          {bookings.length === 0 && <p className="text-editorial-muted text-xs italic">Nenhuma reserva encontrada.</p>}
        </div>
      )}
    </div>
  );
}
