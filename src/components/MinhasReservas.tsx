import React, { useEffect, useState } from "react";
import { LoaderCircle, CalendarDays, CreditCard, FileDown, WifiOff, Map as MapIcon, ChevronDown, ChevronUp } from "lucide-react";
import { adminFetch } from "../lib/adminFetch";

interface MinhaReserva {
  id: string;
  pousadaId?: string;
  pousadaName: string;
  checkIn: string;
  checkOut: string;
  adults: number;
  children: number;
  roomType?: string;
  experienceType?: string;
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

// No Pantanal o sinal some. A lista de reservas fica salva no aparelho a
// cada carregamento, e o voucher (PDF) vai para o Cache Storage quando o
// turista abre/baixa — dá pra mostrar na pousada mesmo sem internet.
const OFFLINE_LIST_KEY = "ecosafari_offline_reservas";
const OFFLINE_CACHE = "ecosafari-offline";
const voucherCacheKey = (id: string) => `/offline/voucher/${encodeURIComponent(id)}.pdf`;
const hasVoucher = (status: string) => !["pendente_pagamento", "cancelado"].includes(status);

const formatBR = (iso: string) => new Date(iso.slice(0, 10) + "T12:00:00").toLocaleDateString("pt-BR");
const formatDia = (d: Date) => d.toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit" });

function saveOffline(items: MinhaReserva[]) {
  try { localStorage.setItem(OFFLINE_LIST_KEY, JSON.stringify({ savedAt: new Date().toISOString(), items })); } catch { /* cheio/bloqueado */ }
}

function loadOffline(): { savedAt: string; items: MinhaReserva[] } | null {
  try {
    const raw = localStorage.getItem(OFFLINE_LIST_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

async function cachedVoucher(id: string): Promise<Blob | null> {
  if (typeof caches === "undefined") return null;
  try {
    const hit = await (await caches.open(OFFLINE_CACHE)).match(voucherCacheKey(id));
    return hit ? await hit.blob() : null;
  } catch {
    return null;
  }
}

// Roteiro dia a dia montado a partir da própria reserva: chegada, dias de
// atividades na pousada e saída, com lembretes do que levar.
function Roteiro({ r }: { r: MinhaReserva }) {
  const start = new Date(r.checkIn.slice(0, 10) + "T12:00:00");
  const end = new Date(r.checkOut.slice(0, 10) + "T12:00:00");
  const days: { date: Date; text: string }[] = [];
  for (let d = new Date(start); d <= end; d = new Date(d.getTime() + 86400000)) {
    const first = d.getTime() === start.getTime();
    const last = d.getTime() === end.getTime();
    days.push({
      date: d,
      text: first
        ? `Chegada e check-in em ${r.pousadaName}${r.roomType ? ` (${r.roomType})` : ""}. Apresente o voucher na recepção.`
        : last
          ? "Café da manhã, check-out e retorno. Confira consumos pendentes na recepção."
          : `Dia de atividades na pousada${r.experienceType && !/hospedagem|padr[aã]o/i.test(r.experienceType) ? ` — ${r.experienceType}` : ""}. Saídas de barco e focagem costumam ser cedo e ao entardecer.`,
    });
  }
  return (
    <div className="mt-2 border-t border-editorial-border pt-2">
      <ol className="space-y-1.5">
        {days.map(d => (
          <li key={d.date.toISOString()} className="flex gap-2">
            <span className="font-bold text-editorial-primary whitespace-nowrap w-20 flex-shrink-0">{formatDia(d.date)}</span>
            <span className="text-editorial-muted">{d.text}</span>
          </li>
        ))}
      </ol>
      <p className="text-[10px] text-editorial-muted mt-2">Leve: repelente, protetor solar, chapéu, binóculo, roupas de cores neutras e capa de chuva. Este roteiro fica salvo no aparelho.</p>
    </div>
  );
}

export default function MinhasReservas() {
  const [reservas, setReservas] = useState<MinhaReserva[] | null>(null);
  const [offlineSince, setOfflineSince] = useState<string | null>(null);
  const [savedVouchers, setSavedVouchers] = useState<Set<string>>(new Set());
  const [openRoteiro, setOpenRoteiro] = useState<string | null>(null);
  const [payingId, setPayingId] = useState<string | null>(null);
  const [voucherId, setVoucherId] = useState<string | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    adminFetch("/api/turista/bookings")
      .then(res => {
        if (!res.ok) throw new Error(String(res.status));
        return res.json();
      })
      .then(data => {
        const items = Array.isArray(data) ? data : [];
        setReservas(items);
        saveOffline(items);
      })
      .catch(() => {
        const cached = loadOffline();
        setReservas(cached?.items || []);
        if (cached) setOfflineSince(cached.savedAt);
      });
  }, []);

  useEffect(() => {
    if (!reservas) return;
    Promise.all(reservas.filter(r => hasVoucher(r.status)).map(async r => ((await cachedVoucher(r.id)) ? r.id : null)))
      .then(ids => setSavedVouchers(new Set(ids.filter((x): x is string => !!x))));
  }, [reservas]);

  // Download em vez de window.open: o celular bloqueia pop-up aberto depois
  // de um await, e o arquivo baixado fica no aparelho de qualquer forma.
  const openBlob = (blob: Blob, id: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `voucher-ecosafari-${id}.pdf`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  };

  // Baixa da rede (e guarda no aparelho); sem rede, abre a cópia salva.
  const abrirVoucher = async (id: string) => {
    setError("");
    setVoucherId(id);
    try {
      const res = await adminFetch(`/api/bookings/${encodeURIComponent(id)}/voucher.pdf`);
      if (!res.ok) throw new Error(String(res.status));
      const blob = await res.blob();
      if (typeof caches !== "undefined") {
        try {
          await (await caches.open(OFFLINE_CACHE)).put(voucherCacheKey(id), new Response(blob, { headers: { "Content-Type": "application/pdf" } }));
          setSavedVouchers(prev => new Set(prev).add(id));
        } catch { /* sem espaço — só não fica offline */ }
      }
      openBlob(blob, id);
    } catch {
      const cached = await cachedVoucher(id);
      if (cached) openBlob(cached, id);
      else setError("Sem conexão e o voucher ainda não foi salvo neste aparelho. Abra-o uma vez com internet para guardá-lo.");
    } finally {
      setVoucherId(null);
    }
  };

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
    } catch {
      setError("Sem conexão. O pagamento precisa de internet.");
    } finally {
      setPayingId(null);
    }
  };

  return (
    <section className="mt-6 border-t border-editorial-border pt-5">
      <h2 className="text-xs uppercase tracking-[0.2em] font-bold text-editorial-primary flex items-center gap-2 mb-3">
        <CalendarDays className="h-4 w-4" /> Minhas reservas
      </h2>
      {offlineSince && (
        <p className="flex items-center gap-1.5 text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-md px-3 py-2 mb-3">
          <WifiOff className="h-3.5 w-3.5 flex-shrink-0" /> Sem internet — mostrando as reservas salvas em {new Date(offlineSince).toLocaleString("pt-BR")}.
        </p>
      )}
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
              {r.status !== "cancelado" && (
                <div className="flex flex-wrap gap-2 mt-2">
                  {hasVoucher(r.status) && (
                    <button type="button" onClick={() => abrirVoucher(r.id)} disabled={voucherId === r.id} className="flex items-center gap-1.5 border border-editorial-primary text-editorial-primary text-[10px] uppercase tracking-widest font-bold px-3 py-1.5 rounded-md disabled:opacity-60 cursor-pointer">
                      {voucherId === r.id ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <FileDown className="h-3.5 w-3.5" />}
                      Voucher{savedVouchers.has(r.id) ? " · salvo offline" : ""}
                    </button>
                  )}
                  <button type="button" aria-expanded={openRoteiro === r.id} onClick={() => setOpenRoteiro(openRoteiro === r.id ? null : r.id)} className="flex items-center gap-1.5 border border-editorial-border text-editorial-text text-[10px] uppercase tracking-widest font-bold px-3 py-1.5 rounded-md cursor-pointer">
                    <MapIcon className="h-3.5 w-3.5" /> Roteiro {openRoteiro === r.id ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                  </button>
                </div>
              )}
              {openRoteiro === r.id && <Roteiro r={r} />}
            </li>
          ))}
        </ul>
      )}
      {error && <p role="alert" className="text-red-600 text-xs mt-2">{error}</p>}
    </section>
  );
}
