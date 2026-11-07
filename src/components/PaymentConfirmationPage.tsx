import React, { useState, useEffect } from "react";
import { Compass, CheckCircle2, XCircle, LoaderCircle, Download, MessageSquare, ArrowLeft } from "lucide-react";
import { Booking } from "../types";
import { navigate } from "../lib/router";
import BrandLogo from "./BrandLogo";
import { clearCart } from "../lib/cart";

interface PedidoResumo {
  id: string;
  bookings: { id: string; pousadaName: string; checkIn: string; checkOut: string; totalPrice: number; status: string; customerEmail?: string }[];
  refunded: string[];
}
const refOf = (id: string) => String(id || "").replace(/^(b_|ped_)/, "").slice(0, 8).toUpperCase();
const br = (iso: string) => String(iso || "").slice(0, 10).split("-").reverse().join("/");

const WHATSAPP_NUMBER = "5565999868334";

export default function PaymentConfirmationPage() {
  const [status, setStatus] = useState<"loading" | "success" | "success-consumo" | "error">("loading");
  const [booking, setBooking] = useState<Booking | null>(null);
  const [pedido, setPedido] = useState<PedidoResumo | null>(null);
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
        if (data.pedido) {
          setPedido(data.pedido);
          clearCart();
          setStatus("success");
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
          <h1 className="flex items-center">
            <BrandLogo />
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

        {status === "success" && pedido && (() => {
          const pagas = pedido.bookings.filter(b => !pedido.refunded.includes(b.id) && b.status !== "cancelado");
          const devolvidas = pedido.bookings.filter(b => pedido.refunded.includes(b.id));
          const total = pagas.reduce((acc, b) => acc + Number(b.totalPrice || 0), 0);
          return (
            <div className="bg-white border border-editorial-border p-8 rounded-2xl text-left">
              <CheckCircle2 className="h-12 w-12 text-emerald-600 mx-auto mb-4" />
              <h1 className="text-2xl font-serif font-bold text-editorial-primary mb-2 text-center">Pedido confirmado!</h1>
              <p className="text-editorial-muted text-sm mb-5 text-center">
                {pagas.length} reserva(s) garantida(s). Enviamos os vouchers e os contatos de cada uma para {pagas[0]?.customerEmail || "o seu email"}.
              </p>
              <p className="text-[10px] uppercase tracking-widest font-bold text-editorial-muted">Nº do pedido</p>
              <p className="text-xl font-bold tracking-widest mb-4">{refOf(pedido.id)}</p>
              <ul className="space-y-2 mb-4">
                {pagas.map(b => (
                  <li key={b.id} className="border border-editorial-border rounded-xl p-3 text-sm flex items-center justify-between gap-3">
                    <span className="min-w-0">
                      <span className="block font-semibold truncate">{b.pousadaName}</span>
                      <span className="block text-xs text-editorial-muted">Nº {refOf(b.id)} · {br(b.checkIn)} a {br(b.checkOut)} · R$ {Number(b.totalPrice).toLocaleString("pt-BR")}</span>
                    </span>
                    <a href={`/api/bookings/${b.id}/voucher.pdf?session_id=${encodeURIComponent(sessionId)}`} target="_blank" rel="noopener noreferrer" aria-label={`Baixar voucher da ${b.pousadaName}`} className="flex-shrink-0 inline-flex items-center gap-1 text-xs font-bold text-editorial-primary border border-editorial-border rounded-full px-3 py-1.5">
                      <Download className="h-3.5 w-3.5" /> Voucher
                    </a>
                  </li>
                ))}
              </ul>
              {devolvidas.length > 0 && (
                <p className="bg-amber-50 border border-amber-200 text-amber-900 text-xs rounded-xl px-3 py-2 mb-4">
                  A vaga de {devolvidas.map(b => b.pousadaName).join(", ")} acabou antes do pagamento ser concluído — esse valor foi devolvido no mesmo meio de pagamento.
                </p>
              )}
              <p className="text-sm mb-5"><strong>Total pago:</strong> R$ {total.toLocaleString("pt-BR")}</p>
              <button type="button" onClick={() => navigate("/turista")} className="w-full bg-editorial-primary text-white text-xs uppercase tracking-widest font-bold py-3 rounded-full hover:opacity-90 transition mb-3 cursor-pointer">
                Ver minhas reservas
              </button>
              <a href="/" onClick={(e) => { e.preventDefault(); navigate("/"); }} className="flex items-center justify-center gap-2 text-xs uppercase tracking-widest font-bold text-editorial-muted hover:text-editorial-primary transition cursor-pointer">
                <ArrowLeft className="h-4 w-4" /> Voltar ao site
              </a>
            </div>
          );
        })()}

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
