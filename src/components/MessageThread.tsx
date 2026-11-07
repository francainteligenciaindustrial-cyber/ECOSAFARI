import React, { useEffect, useRef, useState } from "react";
import { LoaderCircle, Send, ShieldCheck } from "lucide-react";

export interface Msg {
  id: string;
  autor: "turista" | "guia";
  texto: string;
  ocultado?: boolean;
  createdAt: string;
}

// Conversa (bolhas) + campo de envio. Usada pelo turista e pelo guia.
export default function MessageThread({ mensagens, me, onSend, locked, placeholder }: {
  mensagens: Msg[];
  me: "turista" | "guia";
  onSend: (texto: string) => Promise<boolean>;
  locked: boolean; // contato direto ainda bloqueado (sem reserva paga)
  placeholder?: string;
}) {
  const [texto, setTexto] = useState("");
  const [sending, setSending] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => { endRef.current?.scrollIntoView({ block: "end" }); }, [mensagens.length]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const t = texto.trim();
    if (!t || sending) return;
    setSending(true);
    try {
      if (await onSend(t)) setTexto("");
    } finally {
      setSending(false);
    }
  };

  const hora = (d: string) => new Date(d).toLocaleString("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });

  return (
    <div className="flex flex-col h-full min-h-[420px]">
      {locked && (
        <p className="flex items-start gap-2 text-[11px] text-editorial-muted bg-editorial-secondary rounded-xl px-3 py-2 mb-3">
          <ShieldCheck className="h-4 w-4 flex-shrink-0 text-editorial-accent" />
          Para sua segurança, telefones, emails e links ficam ocultos até a reserva ser paga. Depois disso o contato direto é liberado. Combine tudo por aqui — assim a equipe Ipantanal consegue ajudar se houver qualquer problema.
        </p>
      )}
      <div className="flex-1 overflow-y-auto space-y-3 pr-1" aria-live="polite">
        {mensagens.length === 0 && <p className="text-sm text-editorial-muted text-center py-8">Nenhuma mensagem ainda.</p>}
        {mensagens.map(m => {
          const mine = m.autor === me;
          return (
            <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm whitespace-pre-line ${mine ? "bg-editorial-primary text-white rounded-br-md" : "bg-editorial-secondary text-editorial-text rounded-bl-md"}`}>
                {m.texto}
                <span className={`block text-[10px] mt-1 ${mine ? "text-white/60" : "text-editorial-muted"}`}>
                  {hora(m.createdAt)}{m.ocultado ? " · contato ocultado" : ""}
                </span>
              </div>
            </div>
          );
        })}
        <div ref={endRef} />
      </div>
      <form onSubmit={submit} className="flex gap-2 pt-3 mt-3 border-t border-editorial-border">
        <label htmlFor="nova-mensagem" className="sr-only">Mensagem</label>
        <textarea
          id="nova-mensagem"
          rows={2}
          maxLength={2000}
          value={texto}
          onChange={e => setTexto(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(e as any); } }}
          placeholder={placeholder || "Escreva sua mensagem…"}
          className="flex-1 border border-editorial-border rounded-2xl px-3 py-2 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-editorial-primary"
        />
        <button type="submit" disabled={sending || !texto.trim()} aria-label="Enviar" className="w-11 h-11 self-end rounded-full bg-editorial-primary text-white flex items-center justify-center disabled:opacity-40 cursor-pointer">
          {sending ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </button>
      </form>
    </div>
  );
}
