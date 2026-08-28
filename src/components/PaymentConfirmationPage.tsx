import React, { useState, useEffect } from "react";
import { Compass, CheckCircle2, XCircle, LoaderCircle, Download, MessageSquare, ArrowLeft } from "lucide-react";
import { Booking } from "../types";
import { navigate } from "../lib/router";

const WHATSAPP_NUMBER = "5565999868334";

export default function PaymentConfirmationPage() {
  const [status, setStatus] = useState<"loading" | "success" | "success-consumo" | "error">("loading");
  const [booking, setBooking] = useState<Booking | null>(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [sessionId, setSessionId] = useState("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const sid = params.get("session_id");
    if (!sid) {
      setStatus("error");
      setErrorMsg("Sessão de pagamento não encontrada.");
      return;
    }
    setSessionId(sid);

    fetch(`/api/payments/confirm?session_id=${encodeURIComponent(sid)}`)
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Erro ao confirmar pagamento");
        if (data.consumo) {
          setStatus("success-consumo");
          return;
        }
        setBooking(data.booking);
        setStatus("success");
      })
      .catch((err) => {
        setErrorMsg(err.message || "Erro ao confirmar pagamento");
        setStatus("error");
      });
  }, []);

  return (
    <div className="min-h-screen bg-editorial-bg font-sans text-editorial-text">
      <header className="h-20 bg-editorial-bg border-b border-editorial-border flex items-center px-6 md:px-10">
        <a href="/" onClick={(e) => { e.preventDefault(); navigate("/"); }} className="flex items-center gap-3 cursor-pointer">
          <div className="bg-editorial-primary p-2 rounded-lg text-white shadow-sm flex items-center justify-center">
            <Compass className="h-5 w-5" />
          </div>
          <h1 className="text-2xl font-serif italic tracking-tighter font-bold text-editorial-primary">
            EcoSafari<span className="text-zinc-400 not-italic">.</span>
          </h1>
        </a>
      </header>

      <main className="max-w-md mx-auto px-6 py-16 text-center">
        {status === "loading" && (
          <div className="flex flex-col items-center gap-3">
            <LoaderCircle className="h-10 w-10 text-editorial-primary animate-spin" />
            <p className="text-editorial-muted text-xs uppercase tracking-widest font-bold">Confirmando pagamento...</p>
          </div>
        )}

        {status === "error" && (
          <div className="bg-white border border-editorial-border p-10 rounded-lg">
            <XCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
            <h1 className="text-xl font-serif font-bold text-editorial-primary mb-2">Não foi possível confirmar</h1>
            <p className="text-editorial-muted text-sm mb-6">{errorMsg}</p>
            <a href="/" onClick={(e) => { e.preventDefault(); navigate("/"); }} className="inline-flex items-center gap-2 text-xs uppercase tracking-widest font-bold text-editorial-primary hover:opacity-80 transition cursor-pointer">
              <ArrowLeft className="h-4 w-4" /> Voltar ao site
            </a>
          </div>
        )}

        {status === "success-consumo" && (
          <div className="bg-white border border-editorial-border p-10 rounded-lg">
            <CheckCircle2 className="h-12 w-12 text-emerald-600 mx-auto mb-4" />
            <h1 className="text-2xl font-serif font-bold text-editorial-primary mb-2">Pagamento confirmado!</h1>
            <p className="text-editorial-muted text-sm mb-6">
              Seu consumo na pousada foi pago com sucesso.
            </p>
            <a href="/" onClick={(e) => { e.preventDefault(); navigate("/"); }} className="inline-flex items-center gap-2 text-xs uppercase tracking-widest font-bold text-editorial-primary hover:opacity-80 transition cursor-pointer">
              <ArrowLeft className="h-4 w-4" /> Voltar ao site
            </a>
          </div>
        )}

        {status === "success" && booking && (
          <div className="bg-white border border-editorial-border p-10 rounded-lg">
            <CheckCircle2 className="h-12 w-12 text-emerald-600 mx-auto mb-4" />
            <h1 className="text-2xl font-serif font-bold text-editorial-primary mb-2">Pagamento confirmado!</h1>
            <p className="text-editorial-muted text-sm mb-6">
              Sua reserva na <strong>{booking.pousadaName}</strong> está confirmada. Enviamos os detalhes e o voucher para {booking.customerEmail || "o seu email"}.
            </p>

            <div className="text-left bg-editorial-secondary border border-editorial-border p-4 text-xs mb-6 space-y-1">
              <p><strong>Reserva:</strong> #{booking.id}</p>
              <p><strong>Check-in:</strong> {booking.checkIn}</p>
              <p><strong>Check-out:</strong> {booking.checkOut}</p>
              <p><strong>Total pago:</strong> R$ {booking.totalPrice.toLocaleString('pt-BR')}</p>
            </div>

            <a
              href={`/api/bookings/${booking.id}/voucher.pdf?session_id=${encodeURIComponent(sessionId)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 w-full bg-editorial-primary text-white text-xs uppercase tracking-widest font-bold py-3 rounded-md hover:opacity-90 transition mb-3"
            >
              <Download className="h-4 w-4" /> Baixar Voucher (PDF)
            </a>

            <a
              href={`https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(`Olá! Acabei de confirmar o pagamento da minha reserva #${booking.id} na ${booking.pousadaName}.`)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 w-full bg-emerald-600 hover:bg-emerald-700 text-white text-xs uppercase tracking-widest font-bold py-3 rounded-md transition mb-4"
            >
              <MessageSquare className="h-4 w-4" /> Falar no WhatsApp
            </a>

            <a href="/" onClick={(e) => { e.preventDefault(); navigate("/"); }} className="inline-flex items-center gap-2 text-xs uppercase tracking-widest font-bold text-editorial-muted hover:text-editorial-primary transition cursor-pointer">
              <ArrowLeft className="h-4 w-4" /> Voltar ao site
            </a>
          </div>
        )}
      </main>
    </div>
  );
}
