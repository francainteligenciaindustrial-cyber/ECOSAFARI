import React, { useEffect, useState } from "react";
import { Mail, CheckCircle2, AlertTriangle } from "lucide-react";
import { adminFetch } from "../lib/adminFetch";

interface Info { from: string; replyTo: string | null; ownDomain: boolean; status: string }

// Mostra exatamente como os e-mails de reserva desta pousada chegam ao
// hóspede: remetente e "responder para". "reloadKey" força nova consulta.
export default function RemetenteEmailStatus({ pousadaId, reloadKey }: { pousadaId: string; reloadKey?: unknown }) {
  const [info, setInfo] = useState<Info | null>(null);

  useEffect(() => {
    adminFetch(`/api/pousadas/${encodeURIComponent(pousadaId)}/email-remetente`)
      .then(res => (res.ok ? res.json() : null))
      .then(setInfo)
      .catch(() => setInfo(null));
  }, [pousadaId, reloadKey]);

  if (!info) return null;
  const problem = info.ownDomain && (info.status === "pending" || info.status === "not_found");

  return (
    <div className={`text-[11px] border rounded-md px-3 py-2 space-y-1 ${problem ? "text-amber-900 bg-amber-50 border-amber-200" : "text-zinc-700 bg-zinc-50 border-zinc-200"}`}>
      <p className="flex items-start gap-1.5"><Mail className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
        <span>E-mails de reserva chegam ao hóspede como <strong className="break-all">{info.from}</strong></span>
      </p>
      <p className="pl-5">
        {info.replyTo
          ? <>Respostas do hóspede vão para <strong className="break-all">{info.replyTo}</strong>.</>
          : <>Sem e-mail de contato: as respostas vão para a equipe EcoSafari. Preencha "E-mail para respostas dos hóspedes".</>}
      </p>
      {info.ownDomain && info.status === "verified" && (
        <p className="pl-5 flex items-center gap-1 text-emerald-700"><CheckCircle2 className="h-3 w-3" /> Domínio próprio verificado no Resend.</p>
      )}
      {problem && (
        <p className="pl-5 flex items-start gap-1"><AlertTriangle className="h-3 w-3 mt-0.5 flex-shrink-0" /> Domínio próprio ainda não verificado no Resend — até lá os e-mails saem pelo remetente do EcoSafari.</p>
      )}
    </div>
  );
}
