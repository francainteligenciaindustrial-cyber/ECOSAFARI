import React, { useState } from "react";
import { Calendar, Search, ShieldCheck, CalendarClock } from "lucide-react";
import { Pousada, Booking } from "../types";
import { adminFetch } from "../lib/adminFetch";
import Pagination from "./Pagination";
import PousadaCalendarsPanel from "./PousadaCalendarsPanel";
import EcosystemAvailabilityPanel from "./EcosystemAvailabilityPanel";
import AdminConfiabilidadePanel from "./AdminConfiabilidadePanel";
import AdminYearCalendarPanel from "./AdminYearCalendarPanel";
import { usePagination } from "../lib/usePagination";


// Aba "Agenda Integrada" do painel de Gestão — extraída do AdminDashboard.tsx.
interface AdminAgendaTabProps {
  pousadas: Pousada[];
  onRefreshData: () => void;
  googleCalendarStatus: { connected: boolean; email: string; };
  bookings: Booking[];
  fetchGoogleCalendarStatus: () => Promise<void>;
}

export default function AdminAgendaTab({ pousadas, onRefreshData, googleCalendarStatus, bookings, fetchGoogleCalendarStatus }: AdminAgendaTabProps) {

  const [connectingGoogle, setConnectingGoogle] = useState(false);
  const [disconnectingGoogle, setDisconnectingGoogle] = useState(false);

  // Both now go through adminFetch (an authenticated call) instead of a
  // plain <a href> — the backend route requires an admin session, since an
  // unauthenticated GET here used to let anyone hijack or drop the site's
  // Google Calendar connection.
  const handleConnectGoogleCalendar = async () => {
    setConnectingGoogle(true);
    try {
      const response = await adminFetch("/api/auth/google");
      const data = await response.json();
      if (response.ok && data.authUrl) {
        window.location.href = data.authUrl;
      } else {
        alert(data.error || "Erro ao iniciar conexão com o Google Calendar.");
      }
    } catch (err) {
      console.error("Erro ao iniciar conexão com o Google Calendar:", err);
    } finally {
      setConnectingGoogle(false);
    }
  };

  const handleDisconnectGoogleCalendar = async () => {
    setDisconnectingGoogle(true);
    try {
      const response = await adminFetch("/api/auth/google/disconnect", { method: "POST" });
      if (response.ok) await fetchGoogleCalendarStatus();
    } catch (err) {
      console.error("Erro ao desconectar Google Calendar:", err);
    } finally {
      setDisconnectingGoogle(false);
    }
  };

  // Agenda Anual (aba "Agenda Integrada"): visão de todo o ano — quem vai
  // pra onde, quando e com quem — em vez do recorte de poucos dias que a
  // "Agenda do Ecossistema" mostra. Reaproveita o mesmo "bookings" já
  // buscado pra tela de Reservas & Confirmações, só filtrado/ordenado de
  // outro jeito, sem precisar de uma chamada nova ao servidor.
  const [agendaSearch, setAgendaSearch] = useState("");
  const agendaBookings = bookings
    .filter(b => b.status !== "cancelado")
    .filter(b => {
      if (!agendaSearch) return true;
      const q = agendaSearch.toLowerCase();
      return b.customerName.toLowerCase().includes(q) || b.pousadaName.toLowerCase().includes(q) || (b.guideName || "").toLowerCase().includes(q);
    })
    .sort((a, b) => a.checkIn.localeCompare(b.checkIn));
  const agendaPagination = usePagination(agendaBookings, 15);

  return (
          <div className="bg-white border border-zinc-200 p-6 rounded-2xl shadow-sm space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-zinc-200 pb-4">
              <div>
                <h3 className="font-serif font-bold text-editorial-primary text-xl mb-1 flex items-center gap-1.5"><Calendar className="h-5 w-5 text-editorial-primary" /> Agenda Geral de Expedições</h3>
                <p className="text-zinc-500 text-xs">Sincronização integrada em tempo real com o Google Calendar para todas as expedições confirmadas.</p>
              </div>
            </div>

            {/* Google Calendar Connection Status Banner */}
            <div className="bg-editorial-secondary border border-editorial-border p-5 rounded-none flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="flex-1">
                <h4 className="font-serif font-bold text-editorial-primary text-sm flex items-center gap-2">
                  <span className="relative flex h-2 w-2">
                    <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${googleCalendarStatus.connected ? "bg-emerald-500" : "bg-amber-500"}`}></span>
                    <span className={`relative inline-flex rounded-full h-2 w-2 ${googleCalendarStatus.connected ? "bg-emerald-600" : "bg-amber-600"}`}></span>
                  </span>
                  Integração Oficial Google Calendar
                </h4>
                <p className="text-editorial-muted text-[11px] mt-1 font-light">
                  {googleCalendarStatus.connected
                    ? `Sincronizado ativamente com a conta: ${googleCalendarStatus.email || "Conectada"}`
                    : "Conecte sua agenda para enviar automaticamente as reservas confirmadas para o Google Calendar em tempo real."}
                </p>
              </div>
              <div className="flex-shrink-0">
                {googleCalendarStatus.connected ? (
                  <button
                    onClick={handleDisconnectGoogleCalendar}
                    disabled={disconnectingGoogle}
                    className="bg-white border border-rose-200 text-rose-700 hover:bg-rose-50 px-4 py-2 text-xs font-bold uppercase tracking-widest transition cursor-pointer disabled:opacity-60"
                  >
                    {disconnectingGoogle ? "Desconectando..." : "Desconectar Conta"}
                  </button>
                ) : (
                  <button
                    onClick={handleConnectGoogleCalendar}
                    disabled={connectingGoogle}
                    className="bg-editorial-primary text-white hover:bg-editorial-primary/95 px-4 py-2 text-xs font-bold uppercase tracking-widest transition cursor-pointer disabled:opacity-60"
                  >
                    {connectingGoogle ? "Conectando..." : "Conectar Google Calendar"}
                  </button>
                )}
              </div>
            </div>

            <AdminYearCalendarPanel bookings={bookings} pousadas={pousadas} />

            <EcosystemAvailabilityPanel />

            <AdminConfiabilidadePanel />

            <PousadaCalendarsPanel pousadas={pousadas} connected={googleCalendarStatus.connected} onRefreshData={onRefreshData} />

            <div className="border-t border-zinc-200 pt-6">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-1">
                <h3 className="font-serif font-bold text-editorial-primary text-lg flex items-center gap-1.5">
                  <CalendarClock className="h-5 w-5 text-editorial-primary" /> Agenda Anual — Todos os Itinerários
                </h3>
                <div className="relative w-full md:w-64">
                  <Search className="h-3.5 w-3.5 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text" value={agendaSearch} onChange={e => setAgendaSearch(e.target.value)}
                    placeholder="Buscar turista, pousada ou guia..."
                    className="w-full bg-zinc-50 border border-zinc-200 rounded-lg pl-8 pr-3 py-2 text-xs focus:outline-none focus:border-editorial-primary"
                  />
                </div>
              </div>
              <p className="text-zinc-500 text-xs mb-4">
                Todas as reservas ativas (não canceladas) de todas as pousadas, ordenadas por data de check-in — quem vai, pra onde, quando e com qual guia confirmado.
              </p>

              <div className="border border-zinc-200 rounded-xl overflow-hidden divide-y divide-zinc-200">
                {agendaPagination.pageItems.map((b) => (
                  <div key={b.id} className="p-4 hover:bg-zinc-50/50 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="flex items-start gap-3">
                      <div className="bg-emerald-50 text-emerald-800 p-3 rounded-lg font-bold text-center w-20 flex-shrink-0 border border-emerald-100">
                        <span className="text-[10px] block uppercase text-emerald-600">Check-In</span>
                        <span className="text-sm block leading-none mt-1">{b.checkIn.split("-")[2]} / {b.checkIn.split("-")[1]}</span>
                      </div>
                      <div>
                        <h4 className="font-extrabold text-zinc-950 text-base">{b.pousadaName}</h4>
                        <p className="text-xs text-zinc-600 mt-1">
                          Cliente: <span className="font-bold text-zinc-800">{b.customerName}</span> ({b.adults} adultos, {b.children} crianças)
                        </p>
                        <p className="text-[11px] text-zinc-400 mt-1 flex items-center gap-1">
                          ⏱️ {b.checkIn} até {b.checkOut}
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-col items-start sm:items-end gap-1.5">
                      <div className="flex items-center gap-1.5 flex-wrap justify-end">
                        {b.status === "pendente_pagamento" && <span className="text-[10px] uppercase tracking-wider bg-zinc-100 text-zinc-700 border border-zinc-200 px-2 py-0.5 rounded-full font-bold">Pendente Pagamento</span>}
                        {b.status === "pago" && <span className="text-[10px] uppercase tracking-wider bg-blue-50 text-blue-700 border border-blue-200 px-2 py-0.5 rounded-full font-bold">Pago</span>}
                        {b.status === "confirmado_pousada" && <span className="text-[10px] uppercase tracking-wider bg-amber-50 text-amber-700 border border-amber-200 px-2 py-0.5 rounded-full font-bold">Confirmado Pousada</span>}
                        {b.status === "confirmado_guia" && <span className="text-[10px] uppercase tracking-wider bg-indigo-50 text-indigo-700 border border-indigo-200 px-2 py-0.5 rounded-full font-bold">Confirmado Guia</span>}
                        {b.status === "confirmado_total" && <span className="text-[10px] uppercase tracking-wider bg-emerald-50 text-emerald-800 border border-emerald-200 px-2 py-0.5 rounded-full font-bold flex items-center gap-1"><ShieldCheck className="h-3 w-3" /> Confirmado Total</span>}
                      </div>
                      <span className="text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-100 px-2 py-0.5 rounded">
                        🧭 {b.experienceType}
                      </span>
                      <span className="text-xs text-zinc-500">
                        {b.guideName ? `Guia: ${b.guideName}` : "⚠️ Nenhum guia alocado"}
                      </span>
                    </div>
                  </div>
                ))}
                {agendaBookings.length === 0 && (
                  <p className="text-zinc-400 text-xs p-6 text-center">
                    {agendaSearch ? "Nenhum itinerário encontrado com essa busca." : "Nenhuma reserva ativa no momento."}
                  </p>
                )}
              </div>
              <Pagination
                page={agendaPagination.page}
                totalPages={agendaPagination.totalPages}
                totalItems={agendaPagination.totalItems}
                onPageChange={agendaPagination.setPage}
              />
            </div>
          </div>
        );
}
