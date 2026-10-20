import React, { useEffect, useState } from "react";
import { LoaderCircle, Check, X, MessageCircle, UserRoundCheck, Phone, Mail, Copy } from "lucide-react";
import { adminFetch } from "../lib/adminFetch";
import { useToast } from "../lib/ToastProvider";

interface Colaborador {
  id: string;
  name: string;
  email: string;
  phone: string;
  age?: number;
  services: string[];
  languages: string[];
  specialties: string[];
  bio?: string;
  status: "pendente" | "aprovado" | "reprovado";
  decisionNote?: string;
  createdAt: string;
}

const STATUS_STYLE: Record<Colaborador["status"], string> = {
  pendente: "bg-amber-50 text-amber-800 border-amber-200",
  aprovado: "bg-emerald-50 text-emerald-800 border-emerald-200",
  reprovado: "bg-red-50 text-red-700 border-red-200",
};

// Análise dos colaboradores que se cadastraram escolhendo esta pousada.
// Aprovar/reprovar avisa a pessoa por email; o link do WhatsApp com a mesma
// mensagem aparece pronto pro gestor enviar com um clique.
export default function PousadaColaboradoresManager({ pousadaId }: { pousadaId: string }) {
  const { showToast } = useToast();
  const [list, setList] = useState<Colaborador[] | null>(null);
  const [loadError, setLoadError] = useState("");
  const [filter, setFilter] = useState<"pendente" | "aprovado" | "reprovado">("pendente");
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [acting, setActing] = useState<string | null>(null);
  const [whatsappLinks, setWhatsappLinks] = useState<Record<string, string>>({});

  const fetchList = () => {
    adminFetch(`/api/pousadas/${pousadaId}/colaboradores`)
      .then(async res => {
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body.error || "Erro ao carregar colaboradores.");
        setList(body);
        setLoadError("");
      })
      .catch(err => setLoadError(err.message));
  };

  useEffect(() => { fetchList(); }, [pousadaId]);

  const decide = async (c: Colaborador, decision: "aprovado" | "reprovado") => {
    if (decision === "reprovado" && !confirm(`Reprovar o cadastro de ${c.name}?`)) return;
    setActing(c.id);
    try {
      const res = await adminFetch(`/api/pousadas/${pousadaId}/colaboradores/${c.id}/decisao`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision, note: notes[c.id] || "" }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        showToast(body.error || "Erro ao registrar a decisão.", "error");
        return;
      }
      showToast(`${c.name}: ${decision}. ${body.emailSent ? "Email enviado." : "Email não pôde ser enviado — use o WhatsApp."}`, body.emailSent ? "success" : "error");
      if (body.whatsappLink) setWhatsappLinks(w => ({ ...w, [c.id]: body.whatsappLink }));
      fetchList();
    } finally {
      setActing(null);
    }
  };

  const counts = (list || []).reduce<Record<string, number>>((acc, c) => ({ ...acc, [c.status]: (acc[c.status] || 0) + 1 }), {});
  const signupLink = `${window.location.origin}/seja-parceiro?tipo=colaborador&pousada=${encodeURIComponent(pousadaId)}`;

  return (
    <div className="bg-white border border-editorial-border rounded-lg p-6 space-y-4">
      <div>
        <h3 className="text-[10px] uppercase tracking-[0.15em] font-bold text-editorial-primary flex items-center gap-2">
          <UserRoundCheck className="h-3.5 w-3.5" /> Colaboradores
        </h3>
        <p className="text-editorial-muted text-[11px] mt-1">Camareiras, cozinheiras, piloteiros, músicos, fotógrafos e outros prestadores que pediram para trabalhar com esta pousada.</p>
      </div>

      <div className="bg-editorial-secondary/60 border border-editorial-border rounded-md p-3 text-xs flex flex-wrap items-center gap-2">
        <span className="font-semibold">Link de cadastro para enviar à equipe:</span>
        <code className="text-[11px] break-all flex-1 min-w-0">{signupLink}</code>
        <button type="button" onClick={() => { navigator.clipboard.writeText(signupLink); showToast("Link copiado.", "success"); }} className="flex items-center gap-1 border border-editorial-border px-2 py-1 rounded cursor-pointer">
          <Copy className="h-3 w-3" /> Copiar
        </button>
      </div>

      <div className="flex gap-1 border-b border-editorial-border" role="tablist">
        {(["pendente", "aprovado", "reprovado"] as const).map(s => (
          <button key={s} type="button" role="tab" aria-selected={filter === s} onClick={() => setFilter(s)} className={`px-3 py-2 text-[11px] uppercase tracking-widest font-bold border-b-2 cursor-pointer ${filter === s ? "border-editorial-primary text-editorial-primary" : "border-transparent text-editorial-muted"}`}>
            {s === "pendente" ? "Aguardando" : s === "aprovado" ? "Aprovados" : "Reprovados"} ({counts[s] || 0})
          </button>
        ))}
      </div>

      {loadError ? (
        <p className="bg-amber-50 border border-amber-200 text-amber-900 text-xs px-3 py-2 rounded-md">{loadError}</p>
      ) : list === null ? (
        <div className="flex justify-center py-6"><LoaderCircle className="h-5 w-5 text-editorial-primary animate-spin" /></div>
      ) : (
        <ul className="space-y-3">
          {list.filter(c => c.status === filter).map(c => (
            <li key={c.id} className="border border-editorial-border rounded-md p-4 text-xs space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-semibold text-sm">{c.name}{c.age ? `, ${c.age} anos` : ""}</p>
                  <p className="text-editorial-primary font-semibold">{c.services.join(" · ")}</p>
                </div>
                <span className={`text-[9px] uppercase tracking-widest font-bold px-2 py-0.5 rounded-full border ${STATUS_STYLE[c.status]}`}>{c.status}</span>
              </div>
              <p className="text-editorial-muted flex flex-wrap gap-x-4 gap-y-1">
                <span className="flex items-center gap-1"><Mail className="h-3 w-3" /> {c.email}</span>
                <span className="flex items-center gap-1"><Phone className="h-3 w-3" /> {c.phone}</span>
              </p>
              {c.languages.length > 0 && <p><span className="text-editorial-muted">Idiomas:</span> {c.languages.join(", ")}</p>}
              {c.specialties.length > 0 && <p><span className="text-editorial-muted">Especialidades:</span> {c.specialties.join(", ")}</p>}
              {c.bio && <p className="text-editorial-text whitespace-pre-line">{c.bio}</p>}
              {c.decisionNote && <p className="text-editorial-muted italic">Observação: {c.decisionNote}</p>}

              {c.status === "pendente" && (
                <div className="space-y-2 pt-1">
                  <input type="text" maxLength={500} value={notes[c.id] || ""} onChange={e => setNotes(n => ({ ...n, [c.id]: e.target.value }))} placeholder="Mensagem para a pessoa (opcional — enviada junto com a resposta)" aria-label="Mensagem para o colaborador" className="w-full border border-editorial-border rounded-md px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-editorial-primary" />
                  <div className="flex gap-2">
                    <button type="button" disabled={acting === c.id} onClick={() => decide(c, "aprovado")} className="flex items-center gap-1 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-800 font-bold px-3 py-1.5 rounded text-[11px] disabled:opacity-60 cursor-pointer">
                      <Check className="h-3.5 w-3.5" /> Aprovar
                    </button>
                    <button type="button" disabled={acting === c.id} onClick={() => decide(c, "reprovado")} className="flex items-center gap-1 bg-red-50 hover:bg-red-100 border border-red-200 text-red-700 font-bold px-3 py-1.5 rounded text-[11px] disabled:opacity-60 cursor-pointer">
                      <X className="h-3.5 w-3.5" /> Reprovar
                    </button>
                  </div>
                </div>
              )}
              {whatsappLinks[c.id] && (
                <a href={whatsappLinks[c.id]} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 bg-emerald-600 text-white font-bold px-3 py-1.5 rounded text-[11px]">
                  <MessageCircle className="h-3.5 w-3.5" /> Avisar pelo WhatsApp
                </a>
              )}
            </li>
          ))}
          {list.filter(c => c.status === filter).length === 0 && <li className="text-editorial-muted text-xs italic">Nada por aqui.</li>}
        </ul>
      )}
    </div>
  );
}
