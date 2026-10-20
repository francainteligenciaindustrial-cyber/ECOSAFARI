import React, { useState } from "react";
import { Plus, Search, ShieldCheck } from "lucide-react";
import { Pousada, Guide, Booking } from "../types";
import { adminFetch } from "../lib/adminFetch";
import Pagination from "./Pagination";
import NewBookingForm from "./NewBookingForm";
import { usePagination } from "../lib/usePagination";


// Aba "Reservas & Confirmações" do painel de Gestão — extraída do AdminDashboard.tsx.
interface AdminReservasTabProps {
  pousadas: Pousada[];
  onRefreshData: () => void;
  fetchBookings: () => Promise<void>;
  guides: Guide[];
  bookings: Booking[];
}

export default function AdminReservasTab({ pousadas, onRefreshData, fetchBookings, guides, bookings }: AdminReservasTabProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [showNewBooking, setShowNewBooking] = useState(false);

  // Actions for reservation statuses (simulating Guide & Pousada confirmations)
  const handleConfirmPousada = async (bookingId: string) => {
    try {
      const response = await adminFetch(`/api/bookings/${bookingId}/status`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "confirmado_pousada" })
      });
      if (response.ok) { onRefreshData(); fetchBookings(); }
    } catch (err) {
      console.error(err);
    }
  };

  const handleConfirmGuide = async (bookingId: string, guideId: string) => {
    try {
      const response = await adminFetch(`/api/bookings/${bookingId}/status`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "confirmado_guia", guideId })
      });
      if (response.ok) { onRefreshData(); fetchBookings(); }
    } catch (err) {
      console.error(err);
    }
  };

  // Marca uma reserva como paga sem passar pelo Stripe — pra fechamentos
  // combinados fora do checkout (Pix, transferência, dinheiro na recepção,
  // reserva por telefone/WhatsApp) e pra testar o resto do fluxo de
  // confirmação (aprovar quarto → vincular guia → sincronizar agenda) sem
  // precisar de um pagamento real configurado.
  const handleMarkAsPaid = async (bookingId: string) => {
    try {
      const response = await adminFetch(`/api/bookings/${bookingId}/status`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "pago" })
      });
      if (response.ok) { onRefreshData(); fetchBookings(); }
    } catch (err) {
      console.error(err);
    }
  };

  const handleCancelBooking = async (bookingId: string) => {
    try {
      const response = await adminFetch(`/api/bookings/${bookingId}/status`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "cancelado" })
      });
      if (response.ok) { onRefreshData(); fetchBookings(); }
    } catch (err) {
      console.error(err);
    }
  };

  // Filters bookings list
  const filteredBookings = bookings.filter(b => {
    const matchesSearch = b.customerName.toLowerCase().includes(searchQuery.toLowerCase()) || b.pousadaName.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesSearch;
  });
  const bookingsPagination = usePagination(filteredBookings, 20);

  return (
          <div className="space-y-6">
            
            {/* Search and filters */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-white p-4 border border-zinc-200 rounded-2xl">
              <div className="relative w-full sm:max-w-xs">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-zinc-400" />
                <input
                  type="text"
                  placeholder="Buscar reserva..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="w-full bg-zinc-50 border border-zinc-200 rounded-lg pl-9 pr-4 py-2 text-xs focus:outline-none focus:border-emerald-500"
                />
              </div>
              <div className="flex items-center gap-4">
                <span className="text-zinc-500 text-xs font-semibold whitespace-nowrap">{filteredBookings.length} reservas filtradas</span>
                <button
                  onClick={() => setShowNewBooking(v => !v)}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-4 py-2 rounded-lg transition flex items-center gap-1.5 shadow-sm whitespace-nowrap"
                >
                  <Plus className="h-4 w-4" /> Nova Reserva
                </button>
              </div>
            </div>

            {showNewBooking && (
              <NewBookingForm
                pousadas={pousadas}
                onClose={() => setShowNewBooking(false)}
                onCreated={() => { fetchBookings(); onRefreshData(); }}
              />
            )}

            {/* List of active bookings */}
            <div className="bg-white border border-zinc-200 rounded-2xl overflow-hidden shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-zinc-100 text-zinc-500 uppercase font-bold border-b border-zinc-200 text-[10px] tracking-wider">
                      <th className="p-4">Cód / Cliente</th>
                      <th className="p-4">Pousada / Experiência</th>
                      <th className="p-4">Período</th>
                      <th className="p-4">Valor</th>
                      <th className="p-4">Status</th>
                      <th className="p-4 text-right">Ações de Confirmação</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-200">
                    {bookingsPagination.pageItems.map((b) => (
                      <tr key={b.id} className="hover:bg-zinc-50/50">
                        <td className="p-4">
                          <span className="font-mono text-[10px] bg-zinc-100 text-zinc-600 px-1.5 py-0.5 rounded font-semibold">#{b.id.split("_")[1] || b.id}</span>
                          <span className="block font-bold text-zinc-900 mt-1">{b.customerName}</span>
                          <span className="text-[10px] text-zinc-500 block">{b.customerEmail} • {b.nationality}</span>
                        </td>
                        <td className="p-4">
                          <span className="font-bold text-zinc-800">{b.pousadaName}</span>
                          <span className="block text-[11px] text-emerald-700 font-semibold mt-0.5">{b.experienceType}</span>
                        </td>
                        <td className="p-4 font-medium text-zinc-700">
                          {b.checkIn} <span className="text-zinc-400">até</span> {b.checkOut}
                        </td>
                        <td className="p-4 font-extrabold text-zinc-900">
                          R$ {b.totalPrice.toLocaleString('pt-BR')}
                        </td>
                        <td className="p-4">
                          {/* Rich Status Badges */}
                          {b.status === "pendente_pagamento" && <span className="bg-zinc-100 text-zinc-700 border border-zinc-200 px-2 py-1 rounded-full font-bold">Pendente Pagamento</span>}
                          {b.status === "pago" && <span className="bg-blue-50 text-blue-700 border border-blue-200 px-2 py-1 rounded-full font-bold animate-pulse">Pago (Aguardando ADM)</span>}
                          {b.status === "confirmado_pousada" && <span className="bg-amber-50 text-amber-700 border border-amber-200 px-2 py-1 rounded-full font-bold">Confirmado Pousada</span>}
                          {b.status === "confirmado_guia" && <span className="bg-indigo-50 text-indigo-700 border border-indigo-200 px-2 py-1 rounded-full font-bold">Confirmado Guia</span>}
                          {b.status === "confirmado_total" && <span className="bg-emerald-50 text-emerald-800 border border-emerald-200 px-2 py-1 rounded-full font-bold flex items-center gap-1 w-max"><ShieldCheck className="h-3.5 w-3.5" /> Confirmado Total</span>}
                          {b.status === "cancelado" && <span className="bg-red-50 text-red-600 border border-red-200 px-2 py-1 rounded-full font-bold">Cancelado</span>}
                        </td>
                        <td className="p-4 text-right space-y-1.5">
                          {/* Admin interaction tools */}
                          {b.status === "pendente_pagamento" && (
                            <div className="flex justify-end gap-1.5">
                              <button
                                onClick={() => handleMarkAsPaid(b.id)}
                                title="Pra fechamentos fora do Stripe (Pix, transferência, dinheiro) ou pra testar o fluxo de confirmação"
                                className="bg-blue-50 hover:bg-blue-100 border border-blue-300 text-blue-800 font-bold px-2.5 py-1.5 rounded transition text-[10px]"
                              >
                                Marcar como Paga
                              </button>
                            </div>
                          )}
                          {(b.status === "pago" || b.status === "confirmado_guia") && (
                            <div className="flex justify-end gap-1.5">
                              <button
                                onClick={() => handleConfirmPousada(b.id)}
                                title={b.status === "confirmado_guia" ? "O guia já foi vinculado sem esse passo — aprovar agora fecha a confirmação total e sincroniza o calendário." : undefined}
                                className="bg-amber-50 hover:bg-amber-100 border border-amber-300 text-amber-800 font-bold px-2.5 py-1.5 rounded transition text-[10px]"
                              >
                                Aprovar Quarto Pousada
                              </button>
                            </div>
                          )}

                          {/* Allocation of available guides */}
                          {(b.status === "pago" || b.status === "confirmado_pousada") && !b.guideId && (
                            <div className="flex items-center justify-end gap-1.5 mt-1.5">
                              <span className="text-[10px] text-zinc-500 font-semibold">Vincular Guia:</span>
                              <select
                                onChange={(e) => {
                                  if (e.target.value) handleConfirmGuide(b.id, e.target.value);
                                }}
                                className="bg-zinc-50 border border-zinc-200 rounded p-1 text-[10px]"
                                defaultValue=""
                              >
                                <option value="" disabled>Selecione...</option>
                                {guides.filter(g => g.status === "disponivel").map(g => (
                                  <option key={g.id} value={g.id}>{g.name}{g.specialty?.[0] ? ` (${g.specialty[0]})` : ""}</option>
                                ))}
                              </select>
                            </div>
                          )}

                          {b.guideName && (
                            <span className="block text-[10px] text-indigo-700 font-semibold text-right">🧭 Guia Alocado: {b.guideName}</span>
                          )}

                          {b.status !== "cancelado" && b.status !== "confirmado_total" && (
                            <button
                              onClick={() => handleCancelBooking(b.id)}
                              className="text-red-400 hover:text-red-600 font-bold text-[10px] hover:underline"
                            >
                              Cancelar Reserva
                            </button>
                          )}
                          
                          {b.status === "confirmado_total" && b.googleCalendarEventId && (
                            <span className="text-[9px] text-emerald-600 bg-emerald-50 border border-emerald-100 px-1.5 py-0.5 rounded font-mono block text-right w-max ml-auto">
                              📅 Google Calendar Evento: {b.googleCalendarEventId}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                    {filteredBookings.length === 0 && (
                      <tr>
                        <td colSpan={6} className="text-center p-8 text-zinc-400">Nenhuma reserva encontrada.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              <Pagination
                page={bookingsPagination.page}
                totalPages={bookingsPagination.totalPages}
                totalItems={bookingsPagination.totalItems}
                onPageChange={bookingsPagination.setPage}
              />
            </div>
          </div>
        );
}
