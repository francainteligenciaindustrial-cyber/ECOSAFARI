import React, { useEffect, useState } from "react";
import { Megaphone, LoaderCircle, Send, FlaskConical, Users, Building2 } from "lucide-react";
import { adminFetch } from "../lib/adminFetch";
import { useToast } from "../lib/ToastProvider";

type Audience = "turistas" | "parceiros";

const inputClass = "w-full border border-zinc-200 bg-zinc-50 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-emerald-500";

// Gestão → Comunicados: novidades e notícias por email. Turistas recebem só
// se aceitaram (LGPD) e cada email leva o link de descadastro; parceiros
// recebem como comunicação da plataforma. Sempre dá para mandar um teste
// para o próprio email antes do envio real.
export default function AdminComunicadosPanel() {
  const { showToast } = useToast();
  const [counts, setCounts] = useState<{ turistas: number; parceiros: number; avisos: string[] } | null>(null);
  const [audience, setAudience] = useState<Audience>("turistas");
  const [subject, setSubject] = useState("");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [ctaLabel, setCtaLabel] = useState("");
  const [ctaUrl, setCtaUrl] = useState("");
  const [sending, setSending] = useState<"teste" | "real" | null>(null);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    adminFetch("/api/admin/comunicados/publico")
      .then(res => (res.ok ? res.json() : null))
      .then(setCounts)
      .catch(() => setCounts(null));
  }, []);

  const total = counts ? counts[audience] : 0;

  const send = async (teste: boolean) => {
    if (!subject.trim() || !body.trim()) return showToast("Preencha o assunto e o texto.", "error");
    setSending(teste ? "teste" : "real");
    try {
      const res = await adminFetch("/api/admin/comunicados", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject, title, body, ctaLabel, ctaUrl, audience, teste }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return showToast(data.error || "Não foi possível enviar.", "error");
      showToast(teste ? "Teste enviado para o seu email." : `Comunicado enviado para ${data.enviados} de ${data.total} pessoas.`, "success");
      if (!teste) {
        setConfirming(false);
        setSubject(""); setTitle(""); setBody(""); setCtaLabel(""); setCtaUrl("");
      }
    } finally {
      setSending(null);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-zinc-900 flex items-center gap-2"><Megaphone className="h-5 w-5 text-emerald-600" /> Comunicados</h2>
        <p className="text-sm text-zinc-500 mt-1">Novidades e notícias da plataforma por email. Mande um teste para você antes do envio real.</p>
      </div>

      {counts?.avisos?.length ? (
        <div className="bg-amber-50 border border-amber-200 text-amber-900 text-sm rounded-xl px-4 py-3">{counts.avisos.join(" ")}</div>
      ) : null}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3" role="radiogroup" aria-label="Para quem">
        {([
          { id: "turistas" as Audience, label: "Turistas", hint: "Só quem aceitou receber novidades", Icon: Users },
          { id: "parceiros" as Audience, label: "Parceiros", hint: "Gestores de pousadas, atrações e guias", Icon: Building2 },
        ]).map(({ id, label, hint, Icon }) => (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={audience === id}
            onClick={() => setAudience(id)}
            className={`text-left border rounded-2xl p-4 transition cursor-pointer ${audience === id ? "border-emerald-500 bg-emerald-50" : "border-zinc-200 bg-white hover:bg-zinc-50"}`}
          >
            <span className="flex items-center gap-2 font-semibold text-zinc-900"><Icon className="h-4 w-4" /> {label}</span>
            <span className="block text-xs text-zinc-500 mt-1">{hint}</span>
            <span className="block text-sm font-semibold text-zinc-900 mt-2">{counts ? `${counts[id]} pessoa(s)` : "…"}</span>
          </button>
        ))}
      </div>

      <div className="bg-white border border-zinc-200 rounded-2xl p-5 space-y-4">
        <div>
          <label htmlFor="com-assunto" className="block text-xs font-semibold text-zinc-700 mb-1">Assunto do email</label>
          <input id="com-assunto" maxLength={150} value={subject} onChange={e => setSubject(e.target.value)} placeholder="Ex.: A temporada das onças começou" className={inputClass} />
        </div>
        <div>
          <label htmlFor="com-titulo" className="block text-xs font-semibold text-zinc-700 mb-1">Título dentro do email (opcional — usa o assunto)</label>
          <input id="com-titulo" maxLength={150} value={title} onChange={e => setTitle(e.target.value)} className={inputClass} />
        </div>
        <div>
          <label htmlFor="com-texto" className="block text-xs font-semibold text-zinc-700 mb-1">Texto</label>
          <textarea id="com-texto" rows={9} maxLength={8000} value={body} onChange={e => setBody(e.target.value)} placeholder={"Escreva normalmente. Deixe uma linha em branco entre parágrafos.\nLinks (https://...) viram clicáveis."} className={`${inputClass} resize-y`} />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label htmlFor="com-botao" className="block text-xs font-semibold text-zinc-700 mb-1">Texto do botão (opcional)</label>
            <input id="com-botao" maxLength={60} value={ctaLabel} onChange={e => setCtaLabel(e.target.value)} placeholder="Ex.: Ver pousadas" className={inputClass} />
          </div>
          <div>
            <label htmlFor="com-link" className="block text-xs font-semibold text-zinc-700 mb-1">Link do botão</label>
            <input id="com-link" type="url" maxLength={500} value={ctaUrl} onChange={e => setCtaUrl(e.target.value)} placeholder="https://www.ipantanal.com.br/..." className={inputClass} />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 pt-2">
          <button type="button" onClick={() => send(true)} disabled={sending !== null} className="inline-flex items-center gap-2 border border-zinc-300 text-zinc-800 text-sm font-semibold px-4 py-2.5 rounded-full hover:bg-zinc-50 disabled:opacity-60 cursor-pointer">
            {sending === "teste" ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <FlaskConical className="h-4 w-4" />} Enviar teste para mim
          </button>
          {!confirming ? (
            <button type="button" onClick={() => setConfirming(true)} disabled={sending !== null || !total} className="inline-flex items-center gap-2 bg-zinc-900 text-white text-sm font-semibold px-4 py-2.5 rounded-full hover:opacity-90 disabled:opacity-50 cursor-pointer">
              <Send className="h-4 w-4" /> Enviar para {total} pessoa(s)
            </button>
          ) : (
            <span className="inline-flex flex-wrap items-center gap-2 text-sm">
              <span className="text-zinc-700">Confirmar o envio para {total} {audience}?</span>
              <button type="button" onClick={() => send(false)} disabled={sending !== null} className="inline-flex items-center gap-2 bg-emerald-600 text-white font-semibold px-4 py-2 rounded-full hover:bg-emerald-700 disabled:opacity-60 cursor-pointer">
                {sending === "real" ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Sim, enviar
              </button>
              <button type="button" onClick={() => setConfirming(false)} className="text-zinc-500 hover:text-zinc-800 font-semibold px-2 cursor-pointer">Cancelar</button>
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
