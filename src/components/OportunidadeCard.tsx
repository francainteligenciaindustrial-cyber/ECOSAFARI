import React from "react";
import { CalendarDays, Users, MapPin, Compass, Phone, CheckCircle2, XCircle, LoaderCircle, Globe } from "lucide-react";

export interface Oportunidade {
  id: string;
  servico: string;
  status: "aberta" | "preenchida" | "cancelada" | "expirada" | "aceita_por_voce";
  checkIn: string;
  checkOut: string;
  pessoas: number;
  experiencia?: string | null;
  idioma?: string | null;
  reserva: string;
  pousada: { nome: string; local?: string; imagem?: string | null };
  distanciaKm?: number | null;
  prestador?: { nome: string };
  resposta?: "aceitou" | "recusou" | null;
  hospede?: { nome: string; telefone?: string | null; whatsapp?: string | null; pais?: string | null } | null;
  token?: string;
}

const br = (iso: string) => String(iso || "").slice(0, 10).split("-").reverse().join("/");

// Um passeio oferecido ao prestador: detalhes + Aceitar/Recusar, ou o
// contato do hóspede quando o serviço já é dele.
export default function OportunidadeCard({
  op, onResponder, respondendo, destaque,
}: {
  op: Oportunidade;
  onResponder?: (resposta: "aceitar" | "recusar") => void;
  respondendo?: "aceitar" | "recusar" | null;
  destaque?: "aceitar" | "recusar" | null;
}) {
  const aberta = op.status === "aberta" && op.resposta !== "recusou";
  return (
    <article className="bg-white border border-editorial-border rounded-2xl overflow-hidden">
      {op.pousada.imagem && <img src={op.pousada.imagem} alt="" className="w-full h-36 object-cover" onError={e => { e.currentTarget.style.display = "none"; }} />}
      <div className="p-5 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10px] uppercase tracking-widest font-bold text-editorial-accent flex items-center gap-1"><Compass className="h-3.5 w-3.5" /> {op.servico}</p>
            <h3 className="font-serif text-lg font-bold text-editorial-text">{op.pousada.nome}</h3>
            {op.pousada.local && <p className="text-xs text-editorial-muted flex items-center gap-1"><MapPin className="h-3.5 w-3.5" /> {op.pousada.local}{typeof op.distanciaKm === "number" ? ` · ~${op.distanciaKm} km de você` : ""}</p>}
          </div>
          <span className="text-[10px] text-editorial-muted whitespace-nowrap">Reserva {op.reserva}</span>
        </div>
        <ul className="text-sm space-y-1">
          <li className="flex items-center gap-2"><CalendarDays className="h-4 w-4 text-editorial-muted" /> {br(op.checkIn)} a {br(op.checkOut)}</li>
          <li className="flex items-center gap-2"><Users className="h-4 w-4 text-editorial-muted" /> {op.pessoas} pessoa(s)</li>
          {op.idioma && <li className="flex items-center gap-2"><Globe className="h-4 w-4 text-editorial-muted" /> {op.idioma}</li>}
          {op.experiencia && <li className="text-editorial-muted text-xs">Passeio: {op.experiencia}</li>}
        </ul>

        {op.status === "aceita_por_voce" ? (
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-sm space-y-1">
            <p className="font-semibold text-emerald-900 flex items-center gap-1.5"><CheckCircle2 className="h-4 w-4" /> O serviço é seu</p>
            {op.hospede && (
              <>
                <p>Hóspede: <strong>{op.hospede.nome}</strong>{op.hospede.pais ? ` (${op.hospede.pais})` : ""}</p>
                {op.hospede.whatsapp && (
                  <a href={op.hospede.whatsapp} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 bg-emerald-600 text-white text-xs font-bold px-3 py-1.5 rounded-full mt-1">
                    <Phone className="h-3.5 w-3.5" /> WhatsApp do hóspede
                  </a>
                )}
              </>
            )}
          </div>
        ) : op.status === "preenchida" ? (
          <p className="bg-editorial-secondary rounded-xl px-3 py-2 text-sm text-editorial-muted">Outro prestador já aceitou este passeio.</p>
        ) : op.status === "cancelada" || op.status === "expirada" ? (
          <p className="bg-editorial-secondary rounded-xl px-3 py-2 text-sm text-editorial-muted">Este passeio não está mais disponível.</p>
        ) : op.resposta === "recusou" ? (
          <p className="bg-editorial-secondary rounded-xl px-3 py-2 text-sm text-editorial-muted flex items-center gap-1.5"><XCircle className="h-4 w-4" /> Você recusou este passeio.</p>
        ) : null}

        {aberta && onResponder && (
          <div className="flex gap-2 pt-1">
            <button type="button" disabled={!!respondendo} onClick={() => onResponder("aceitar")} className={`flex-1 inline-flex items-center justify-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs uppercase tracking-widest font-bold py-3 rounded-full disabled:opacity-60 cursor-pointer ${destaque === "aceitar" ? "ring-4 ring-emerald-200" : ""}`}>
              {respondendo === "aceitar" ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} Aceitar
            </button>
            <button type="button" disabled={!!respondendo} onClick={() => onResponder("recusar")} className={`flex-1 inline-flex items-center justify-center gap-1.5 border border-editorial-border bg-white text-editorial-text text-xs uppercase tracking-widest font-bold py-3 rounded-full disabled:opacity-60 cursor-pointer ${destaque === "recusar" ? "ring-4 ring-zinc-200" : ""}`}>
              {respondendo === "recusar" ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />} Recusar
            </button>
          </div>
        )}
        {aberta && <p className="text-[11px] text-editorial-muted">O primeiro prestador que aceitar fica com o serviço. O contato do hóspede aparece depois de aceitar.</p>}
      </div>
    </article>
  );
}
