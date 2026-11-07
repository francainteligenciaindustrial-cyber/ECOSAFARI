import React, { useEffect, useState } from "react";
import { Star, LoaderCircle, UserCheck, Lock, ChevronDown } from "lucide-react";
import { adminFetch } from "../lib/adminFetch";

// Avaliação de hóspedes pelos prestadores (pousada, guia, colaborador).
// Só prestadores veem estas notas — o turista não tem acesso.

interface Resumo {
  total: number;
  media: number | null;
  comunicacao: number | null;
  regras: number | null;
  cuidado: number | null;
  comentarios: { nota: number; comentario: string; autorTipo: string; autorNome: string | null; createdAt: string }[];
  podeAvaliar: boolean;
  jaAvaliei: boolean;
  motivo: string | null;
}

const CRITERIA = [
  { key: "notaComunicacao", label: "Comunicação", hint: "Respondeu, avisou horários e mudanças" },
  { key: "notaRegras", label: "Respeito às regras", hint: "Horários, regras da casa e do passeio" },
  { key: "notaCuidado", label: "Cuidado", hint: "Com o local, os equipamentos e a natureza" },
] as const;

const TIPO: Record<string, string> = { pousada: "Pousada", guia: "Guia", colaborador: "Equipe" };

function StarsInput({ value, onChange, label }: { value: number; onChange: (n: number) => void; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="flex items-center gap-1">
      {[1, 2, 3, 4, 5].map(n => (
        <button
          key={n}
          type="button"
          role="radio"
          aria-checked={value === n}
          aria-label={`${n} de 5`}
          onClick={() => onChange(n)}
          className="p-0.5 cursor-pointer"
        >
          <Star className={`h-6 w-6 ${n <= value ? "fill-amber-400 text-amber-400" : "text-zinc-300"}`} />
        </button>
      ))}
    </div>
  );
}

export function GuestRatingSummary({ bookingId, guestName, onRated }: { bookingId: string; guestName?: string; onRated?: () => void }) {
  const [data, setData] = useState<Resumo | null>(null);
  const [error, setError] = useState("");
  const [scores, setScores] = useState<Record<string, number>>({ notaComunicacao: 0, notaRegras: 0, notaCuidado: 0 });
  const [comentario, setComentario] = useState("");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");

  const load = () => {
    setError("");
    adminFetch(`/api/avaliacoes-turistas/resumo?bookingId=${encodeURIComponent(bookingId)}`)
      .then(async res => {
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body.error || "Não foi possível carregar a avaliação do hóspede.");
        setData(body);
      })
      .catch(err => setError(err.message));
  };
  useEffect(load, [bookingId]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (Object.values(scores).some(v => !v)) return setFormError("Dê uma nota de 1 a 5 em cada critério.");
    setSaving(true);
    setFormError("");
    try {
      const res = await adminFetch("/api/avaliacoes-turistas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bookingId, ...scores, comentario }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) return setFormError(body.error || "Não foi possível salvar.");
      load();
      onRated?.();
    } finally {
      setSaving(false);
    }
  };

  if (error) return <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">{error}</p>;
  if (!data) return <div className="py-3 flex justify-center"><LoaderCircle className="h-4 w-4 animate-spin text-zinc-400" /></div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-semibold text-zinc-900 flex items-center gap-2">
          <UserCheck className="h-4 w-4 text-emerald-700" /> Avaliação do hóspede
        </p>
        <span className="inline-flex items-center gap-1 text-[10px] text-zinc-500" title="Só pousadas, guias e equipes veem estas notas. O turista não vê.">
          <Lock className="h-3 w-3" /> Só prestadores veem
        </span>
      </div>

      {data.total > 0 ? (
        <div className="bg-zinc-50 border border-zinc-200 rounded-2xl p-4 space-y-2">
          <p className="flex items-center gap-2">
            <Star className="h-5 w-5 fill-amber-400 text-amber-400" />
            <span className="text-xl font-bold text-zinc-900">{data.media?.toFixed(1)}</span>
            <span className="text-xs text-zinc-500">{data.total} avaliação(ões) de prestadores</span>
          </p>
          <div className="grid grid-cols-3 gap-2 text-[11px] text-zinc-600">
            <span>Comunicação <b className="text-zinc-900">{data.comunicacao?.toFixed(1)}</b></span>
            <span>Regras <b className="text-zinc-900">{data.regras?.toFixed(1)}</b></span>
            <span>Cuidado <b className="text-zinc-900">{data.cuidado?.toFixed(1)}</b></span>
          </div>
          {data.comentarios.map((c, i) => (
            <blockquote key={i} className="text-xs text-zinc-700 border-l-2 border-zinc-300 pl-3">
              “{c.comentario}” <span className="text-zinc-500">— {TIPO[c.autorTipo] || c.autorTipo}{c.autorNome ? ` · ${c.autorNome}` : ""}, ★ {c.nota.toFixed(1)}</span>
            </blockquote>
          ))}
        </div>
      ) : (
        <p className="text-xs text-zinc-500">{guestName ? `${guestName} ainda` : "Este hóspede ainda"} não foi avaliado por nenhum prestador.</p>
      )}

      {data.podeAvaliar ? (
        <form onSubmit={submit} className="border border-emerald-200 bg-emerald-50/40 rounded-2xl p-4 space-y-3">
          <p className="text-sm font-semibold text-zinc-900">Avaliar {guestName || "o hóspede"}</p>
          {CRITERIA.map(c => (
            <div key={c.key} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1">
              <span className="text-xs">
                <span className="font-semibold text-zinc-800">{c.label}</span>
                <span className="block text-zinc-500">{c.hint}</span>
              </span>
              <StarsInput label={c.label} value={scores[c.key]} onChange={n => setScores(s => ({ ...s, [c.key]: n }))} />
            </div>
          ))}
          <label className="block text-xs text-zinc-600">
            Comentário para outros prestadores (opcional)
            <textarea rows={2} maxLength={1000} value={comentario} onChange={e => setComentario(e.target.value)} className="mt-1 w-full border border-zinc-200 bg-white rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-emerald-500 resize-none" placeholder="Seja objetivo e respeitoso — fatos, não ofensas." />
          </label>
          {formError && <p role="alert" className="text-xs text-red-700">{formError}</p>}
          <button type="submit" disabled={saving} className="inline-flex items-center gap-2 bg-zinc-900 text-white text-xs font-semibold px-4 py-2 rounded-full hover:opacity-90 disabled:opacity-60 cursor-pointer">
            {saving ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <Star className="h-3.5 w-3.5" />} Enviar avaliação
          </button>
        </form>
      ) : data.motivo ? (
        <p className="text-[11px] text-zinc-500">{data.motivo}</p>
      ) : null}
    </div>
  );
}

// Lista "Hóspedes para avaliar" (estadias dos últimos 30 dias ainda não
// avaliadas por esta pessoa). Mesma tela para pousada, guia e colaborador.
export default function GuestRatingsPanel() {
  const [items, setItems] = useState<{ bookingId: string; customerName: string; pousadaName?: string; checkIn: string; checkOut: string }[] | null>(null);
  const [error, setError] = useState("");
  const [open, setOpen] = useState<string | null>(null);

  const load = () => {
    adminFetch("/api/avaliacoes-turistas/pendentes")
      .then(async res => {
        const body = await res.json().catch(() => []);
        if (!res.ok) throw new Error(body.error || "Não foi possível carregar.");
        setItems(body);
      })
      .catch(err => setError(err.message));
  };
  useEffect(load, []);

  const fmt = (d: string) => new Date(`${d.slice(0, 10)}T12:00:00`).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });

  return (
    <div className="bg-white border border-zinc-200 rounded-2xl p-5 space-y-4">
      <div>
        <h3 className="text-sm font-bold text-zinc-900 flex items-center gap-2"><Star className="h-4 w-4 text-amber-500" /> Avaliar hóspedes</h3>
        <p className="text-xs text-zinc-500 mt-1">Avalie quem você atendeu nos últimos 30 dias. As notas ajudam outras pousadas, guias e equipes — o turista não vê.</p>
      </div>
      {error && <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">{error}</p>}
      {!error && items === null && <div className="flex justify-center py-4"><LoaderCircle className="h-4 w-4 animate-spin text-zinc-400" /></div>}
      {items && items.length === 0 && <p className="text-xs text-zinc-500">Nenhum hóspede para avaliar agora.</p>}
      {items && items.length > 0 && (
        <ul className="divide-y divide-zinc-100">
          {items.map(it => (
            <li key={it.bookingId} className="py-3">
              <button
                type="button"
                aria-expanded={open === it.bookingId}
                onClick={() => setOpen(o => (o === it.bookingId ? null : it.bookingId))}
                className="w-full flex items-center justify-between gap-3 text-left cursor-pointer"
              >
                <span>
                  <span className="block text-sm font-semibold text-zinc-900">{it.customerName}</span>
                  <span className="block text-xs text-zinc-500">{it.pousadaName ? `${it.pousadaName} · ` : ""}{fmt(it.checkIn)} – {fmt(it.checkOut)}</span>
                </span>
                <ChevronDown className={`h-4 w-4 text-zinc-400 transition ${open === it.bookingId ? "rotate-180" : ""}`} />
              </button>
              {open === it.bookingId && (
                <div className="mt-3">
                  <GuestRatingSummary bookingId={it.bookingId} guestName={it.customerName} onRated={() => setTimeout(load, 1200)} />
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
