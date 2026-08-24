import React, { useState, useEffect } from "react";
import { Lock, LoaderCircle } from "lucide-react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseClient } from "../lib/supabaseClient";
import { navigate } from "../lib/router";

// Login de parceiro (pousada/atração/guia) + "esqueci minha senha" — sem
// cadastro: acesso de parceiro sempre vem de convite/candidatura aprovada
// pela gestão (ver PartnerSignupPage.tsx), nunca de auto-cadastro aqui. Usada
// como aba "Parceiros" da tela unificada de login (/entrar, AuthPage.tsx).
// Depois de logar, navega pra /parceiro — onde PartnerPortalPage.tsx assume
// e mostra o painel de edição do próprio perfil.
export default function PartnerLoginPanel() {
  const [supabase, setSupabase] = useState<SupabaseClient | null>(null);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [loggingIn, setLoggingIn] = useState(false);

  const [forgotMode, setForgotMode] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotSubmitting, setForgotSubmitting] = useState(false);
  const [forgotSent, setForgotSent] = useState(false);

  useEffect(() => {
    getSupabaseClient().then(setSupabase);
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase) return;
    setLoggingIn(true);
    setLoginError("");
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error || !data.user) {
      setLoginError("Email ou senha inválidos.");
      setLoggingIn(false);
      return;
    }
    if (data.user.app_metadata?.role !== "partner") {
      await supabase.auth.signOut();
      setLoginError("Esta conta não tem acesso de parceiro. Fale com a equipe EcoSafari.");
      setLoggingIn(false);
      return;
    }
    navigate("/parceiro");
  };

  // Always reports success regardless of whether the email actually has an
  // account — revealing that would let someone probe which emails are
  // registered as partners, the same reasoning applied to the candidatura
  // status lookup elsewhere in this app.
  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase || forgotSubmitting) return;
    setForgotSubmitting(true);
    try {
      await supabase.auth.resetPasswordForEmail(forgotEmail.trim(), {
        redirectTo: `${window.location.origin}/parceiro`,
      });
    } finally {
      setForgotSubmitting(false);
      setForgotSent(true);
    }
  };

  return (
    <div className="max-w-sm w-full mx-auto bg-white border border-editorial-border rounded-lg p-8 shadow-sm">
      <div className="flex items-center gap-2 mb-1">
        <Lock className="h-4 w-4 text-editorial-primary" />
        <h1 className="text-xs uppercase tracking-[0.2em] font-bold text-editorial-primary">Portal do Parceiro</h1>
      </div>

      {!forgotMode ? (
        <>
          <p className="text-editorial-muted text-xs mb-6">Entre com o acesso que a equipe EcoSafari criou pra você editar seu próprio perfil.</p>
          <form onSubmit={handleLogin} className="flex flex-col gap-3">
            <input
              type="email" required placeholder="Email" value={email} onChange={e => setEmail(e.target.value)}
              className="w-full border border-editorial-border bg-white px-3 py-2 text-sm rounded-md focus:outline-none focus:ring-1 focus:ring-editorial-primary"
            />
            <input
              type="password" required placeholder="Senha" value={password} onChange={e => setPassword(e.target.value)}
              className="w-full border border-editorial-border bg-white px-3 py-2 text-sm rounded-md focus:outline-none focus:ring-1 focus:ring-editorial-primary"
            />
            {loginError && <p className="text-red-600 text-xs font-medium">{loginError}</p>}
            <button
              type="submit" disabled={loggingIn || !supabase}
              className="mt-2 bg-editorial-primary text-white text-xs uppercase tracking-widest font-semibold py-2.5 rounded-md flex items-center justify-center gap-2 hover:opacity-90 transition disabled:opacity-60 cursor-pointer"
            >
              {loggingIn ? <LoaderCircle className="h-4 w-4 animate-spin" /> : "Entrar"}
            </button>
            <button
              type="button"
              onClick={() => { setForgotMode(true); setForgotSent(false); setForgotEmail(email); }}
              className="text-editorial-muted hover:text-editorial-primary text-[11px] text-center transition cursor-pointer mt-1"
            >
              Esqueci minha senha
            </button>
          </form>
        </>
      ) : forgotSent ? (
        <div className="text-center py-2">
          <p className="text-editorial-text text-sm font-medium mb-1">Se esse email tiver um acesso de parceiro, enviamos um link de redefinição pra ele agora.</p>
          <p className="text-editorial-muted text-xs mb-6">Confira também a caixa de spam. O link expira em algumas horas.</p>
          <button
            type="button"
            onClick={() => setForgotMode(false)}
            className="text-editorial-primary text-[11px] uppercase tracking-widest font-bold hover:opacity-80 transition cursor-pointer"
          >
            Voltar ao login
          </button>
        </div>
      ) : (
        <>
          <p className="text-editorial-muted text-xs mb-6">Informe o email do seu acesso de parceiro — enviaremos um link pra você definir uma nova senha.</p>
          <form onSubmit={handleForgotPassword} className="flex flex-col gap-3">
            <input
              type="email" required placeholder="Email" value={forgotEmail} onChange={e => setForgotEmail(e.target.value)}
              className="w-full border border-editorial-border bg-white px-3 py-2 text-sm rounded-md focus:outline-none focus:ring-1 focus:ring-editorial-primary"
            />
            <button
              type="submit" disabled={forgotSubmitting}
              className="mt-2 bg-editorial-primary text-white text-xs uppercase tracking-widest font-semibold py-2.5 rounded-md flex items-center justify-center gap-2 hover:opacity-90 transition disabled:opacity-60 cursor-pointer"
            >
              {forgotSubmitting ? <LoaderCircle className="h-4 w-4 animate-spin" /> : "Enviar link de redefinição"}
            </button>
            <button
              type="button"
              onClick={() => setForgotMode(false)}
              className="text-editorial-muted hover:text-editorial-primary text-[11px] text-center transition cursor-pointer mt-1"
            >
              Voltar ao login
            </button>
          </form>
        </>
      )}
    </div>
  );
}
