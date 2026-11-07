import React, { useEffect, useState } from "react";
import { CheckCircle2, LoaderCircle, MailX } from "lucide-react";
import InfoPageLayout from "./InfoPageLayout";

// /descadastrar?e=<email>&t=<token> — link do rodapé dos e-mails de
// novidades. Desliga só as novidades; e-mails de reserva e de segurança
// continuam chegando.
export default function UnsubscribePage() {
  const params = new URLSearchParams(window.location.search);
  const email = params.get("e") || "";
  const token = params.get("t") || "";
  const [state, setState] = useState<"loading" | "done" | "error">("loading");

  useEffect(() => {
    if (!email || !token) {
      setState("error");
      return;
    }
    fetch(`/api/email/unsubscribe?e=${encodeURIComponent(email)}&t=${encodeURIComponent(token)}`)
      .then(res => setState(res.ok ? "done" : "error"))
      .catch(() => setState("error"));
  }, [email, token]);

  return (
    <InfoPageLayout kicker="Sua conta" title="Novidades por email">
      <div className="max-w-md mx-auto text-center bg-white border border-editorial-border rounded-3xl p-10">
        {state === "loading" && <LoaderCircle className="h-8 w-8 text-editorial-primary animate-spin mx-auto" />}
        {state === "done" && (
          <>
            <CheckCircle2 className="h-10 w-10 text-editorial-accent mx-auto mb-4" />
            <h2 className="font-serif text-2xl font-semibold text-editorial-primary mb-2">Pronto, descadastrado</h2>
            <p className="text-sm text-editorial-muted">
              <span className="font-semibold text-editorial-text">{email}</span> não vai mais receber as novidades do Ipantanal. Emails de reservas e de segurança da sua conta continuam chegando normalmente.
            </p>
            <p className="text-xs text-editorial-muted mt-4">Mudou de ideia? Ative de novo no seu perfil, em "Privacidade e dados".</p>
          </>
        )}
        {state === "error" && (
          <>
            <MailX className="h-10 w-10 text-editorial-muted mx-auto mb-4" />
            <h2 className="font-serif text-2xl font-semibold text-editorial-primary mb-2">Link inválido</h2>
            <p className="text-sm text-editorial-muted">Não foi possível confirmar o descadastro por este link. Você também pode desligar as novidades no seu perfil, em "Privacidade e dados".</p>
          </>
        )}
      </div>
    </InfoPageLayout>
  );
}
