import React, { useEffect, useState } from "react";
import { LoaderCircle, CalendarDays, CreditCard } from "lucide-react";
import { adminFetch } from "../lib/adminFetch";

interface MinhaReserva {
  id: string;
  pousadaName: string;
  checkIn: string;
  checkOut: string;
  adults: number;
  children: number;
  roomType?: string;
  totalPrice: number;
  status: string;
}

const STATUS_LABEL: Record<string, string> = {
  pendente_pagamento: "Aguardando pagamento",
  pago: "Pago — aguardando confirmação da pousada",
  confirmado_pousada: "Quarto confirmado",
  confirmado_guia: "Guia confirmado",
  confirmado_total: "Confirmada",
  cancelado: "Cancelada",
};

const formatBR = (iso: string) => new Date(iso.slice(0, 10) + "T12:00:00").toLocaleDateString("pt-BR");

export default function MinhasReservas() {
  const [reservas, setReservas] = useState<MinhaReserva[] | null>(null);
  const [payingId, setPayingId] = useState<string | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    adminFetch("/api/turista/bookings")
      .then(res => (res.ok ? res.json() : []))
      .then(data => setReservas(Array.isArray(data) ? data : []))
      .catch(() => setReservas([]));
  }, []);

  const pagar = async (id: string) => {
    setError("");
    setPayingId(id);
    try {
      const res = await adminFetch(`/api/turista/bookings/${encodeURIComponent(id)}/pagar`, { method: "POST" });
      const body = await res.json().catch(() => ({}));
      if (res.ok && typeof body.url === "string" && body.url.startsWith("https://checkout.stripe.com/")) {
        window.location.assign(body.url);
        return;
      }
      setError(body.error || "Não foi possível abrir o pagamento.");
    } finally {
      setPayingId(null);
    }
  };

  return (
    <section className="mt-6 border-t border-editorial-border pt-5">
      <h2 className="text-xs uppercase tracking-[0.2em] font-bold text-editorial-primary flex items-center gap-2 mb-3">
        <CalendarDays className="h-4 w-4" /> Minhas reservas
      </h2>
      {reservas === null ? (
        <div className="flex justify-center py-4"><LoaderCircle className="h-4 w-4 text-editorial-primary animate-spin" /></div>
      ) : reservas.length === 0 ? (
        <p className="text-editorial-muted text-xs">Você ainda não tem reservas. Escolha uma pousada no catálogo e clique em "Reservar online".</p>
      ) : (
        <ul className="space-y-2">
          {reservas.map(r => (
            <li key={r.id} className="border border-editorial-border rounded-md p-3 text-xs">
              <p className="font-semibold text-sm">{r.pousadaName}</p>
              <p className="text-editorial-muted">{formatBR(r.checkIn)} a {formatBR(r.checkOut)} · {r.adults + (r.children || 0)} hóspede(s){r.roomType ? ` · ${r.roomType}` : ""}</p>
              <div className="flex items-center justify-between gap-2 mt-2">
                <span className={`text-[10px] uppercase tracking-widest font-bold ${r.status === "cancelado" ? "text-red-600" : r.status === "pendente_pagamento" ? "text-amber-700" : "text-emerald-700"}`}>
                  {STATUS_LABEL[r.status] || r.status}
                </span>
                <span className="font-semibold">R$ {Number(r.totalPrice).toLocaleString("pt-BR")}</span>
              </div>
              {r.status === "pendente_pagamento" && (
                <button type="button" onClick={() => pagar(r.id)} disabled={payingId === r.id} className="mt-2 w-full flex items-center justify-center gap-1.5 bg-editorial-primary text-white text-[10px] uppercase tracking-widest font-bold py-2 rounded-md disabled:opacity-60 cursor-pointer">
                  {payingId === r.id ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <CreditCard className="h-3.5 w-3.5" />} Pagar agora
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {error && <p role="alert" className="text-red-600 text-xs mt-2">{error}</p>}
    </section>
  );
}
