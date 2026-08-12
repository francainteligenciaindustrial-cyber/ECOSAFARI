import React, { useState, useEffect } from "react";
import { Compass, LoaderCircle, ShieldCheck, Lock, Check, X } from "lucide-react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseClient } from "../lib/supabaseClient";
import { navigate } from "../lib/router";

interface AuthorizationDetails {
  authorization_id: string;
  redirect_uri: string;
  client: { name: string; uri: string; logo_uri: string };
  user: { id: string; email: string };
  scope: string;
}

const SCOPE_LABELS: Record<string, string> = {
  openid: "Confirmar sua identidade",
  profile: "Ver seu nome e perfil",
  email: "Ver seu email",
};

// Consent screen for Supabase's OAuth 2.1 Authorization Server — this is
// what makes "Entrar com EcoSafari" possible from an external app (the
// mobile app being planned): the external app redirects here with an
// authorization_id, the user (already logged in or logging in right here)
// approves or denies, and the browser is sent back to the external app with
// an authorization code (or an access_denied error). Configured in Supabase
// as: Site URL = https://<domínio>/parceiro, Authorization Path =
// /oauth/consent — the two together are why this page lives at exactly
// /parceiro/oauth/consent.
export default function PartnerOAuthConsentPage() {
  const [supabase, setSupabase] = useState<SupabaseClient | null>(null);
  const [checkingSession, setCheckingSession] = useState(true);
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [loggingIn, setLoggingIn] = useState(false);

  const [authorizationId] = useState<string | null>(() => new URLSearchParams(window.location.search).get("authorization_id"));
  const [details, setDetails] = useState<AuthorizationDetails | null | undefined>(undefined);
  const [detailsError, setDetailsError] = useState("");
  const [deciding, setDeciding] = useState<"approve" | "deny" | null>(null);

  useEffect(() => {
    let subscription: { unsubscribe: () => void } | null = null;
    getSupabaseClient().then(client => {
      setSupabase(client);
      client.auth.getSession().then(({ data }) => {
        setIsLoggedIn(!!data.session);
        setCheckingSession(false);
      });
      const { data } = client.auth.onAuthStateChange((_event, session) => {
        setIsLoggedIn(!!session);
      });
      subscription = data.subscription;
    });
    return () => subscription?.unsubscribe();
  }, []);

  useEffect(() => {
    if (!supabase || !isLoggedIn || !authorizationId) return;
    let cancelled = false;
    setDetails(undefined);
    setDetailsError("");
    supabase.auth.oauth.getAuthorizationDetails(authorizationId).then(({ data, error }) => {
      if (cancelled) return;
      if (error || !data) {
        setDetailsError(error?.message || "Não foi possível carregar os detalhes da autorização.");
        setDetails(null);
        return;
      }
      if ("redirect_url" in data) {
        // Already consented to these exact scopes before — nothing to ask again.
        window.location.href = data.redirect_url;
        return;
      }
      setDetails(data as AuthorizationDetails);
    });
    return () => { cancelled = true; };
  }, [supabase, isLoggedIn, authorizationId]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase) return;
    setLoggingIn(true);
    setLoginError("");
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) setLoginError("Email ou senha inválidos.");
    setLoggingIn(false);
  };

  const handleDecision = async (decision: "approve" | "deny") => {
    if (!supabase || !authorizationId) return;
    setDeciding(decision);
    try {
      const { data, error } = decision === "approve"
        ? await supabase.auth.oauth.approveAuthorization(authorizationId, { skipBrowserRedirect: true })
        : await supabase.auth.oauth.denyAuthorization(authorizationId, { skipBrowserRedirect: true });
      if (error || !data) {
        setDetailsError(error?.message || "Não foi possível concluir a solicitação.");
        setDeciding(null);
        return;
      }
      window.location.href = data.redirect_url;
    } catch {
      setDetailsError("Não foi possível concluir a solicitação.");
      setDeciding(null);
    }
  };

  const header = (
    <header className="h-16 flex items-center px-6 md:px-10 border-b border-editorial-border bg-white">
      <a href="/" onClick={e => { e.preventDefault(); navigate("/"); }} className="flex items-center gap-2 cursor-pointer">
        <div className="bg-editorial-primary p-1.5 rounded-lg text-white flex items-center justify-center">
          <Compass className="h-4 w-4" />
        </div>
        <span className="font-serif italic font-bold text-editorial-primary">EcoSafari<span className="text-zinc-400 not-italic">.</span></span>
      </a>
    </header>
  );

  const shell = (content: React.ReactNode) => (
    <div className="min-h-screen bg-editorial-bg font-sans">
      {header}
      <div className="flex items-center justify-center px-6 py-16">
        <div className="max-w-sm w-full bg-white border border-editorial-border rounded-lg p-8 shadow-sm">
          {content}
        </div>
      </div>
    </div>
  );

  if (!authorizationId) {
    return shell(
      <div className="text-center">
        <h1 className="text-lg font-serif font-bold text-editorial-primary mb-2">Link inválido</h1>
        <p className="text-editorial-muted text-xs">Esta página só funciona quando aberta a partir de um aplicativo pedindo autorização — o link que trouxe você aqui está incompleto.</p>
      </div>
    );
  }

  if (checkingSession || !supabase) {
    return shell(
      <div className="flex items-center justify-center py-6">
        <LoaderCircle className="h-6 w-6 text-editorial-primary animate-spin" />
      </div>
    );
  }

  if (!isLoggedIn) {
    return shell(
      <>
        <div className="flex items-center gap-2 mb-1">
          <Lock className="h-4 w-4 text-editorial-primary" />
          <h1 className="text-xs uppercase tracking-[0.2em] font-bold text-editorial-primary">Entrar com EcoSafari</h1>
        </div>
        <p className="text-editorial-muted text-xs mb-6">Entre com sua conta EcoSafari pra continuar autorizando o aplicativo.</p>
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
            type="submit" disabled={loggingIn}
            className="mt-2 bg-editorial-primary text-white text-xs uppercase tracking-widest font-semibold py-2.5 rounded-md flex items-center justify-center gap-2 hover:opacity-90 transition disabled:opacity-60 cursor-pointer"
          >
            {loggingIn ? <LoaderCircle className="h-4 w-4 animate-spin" /> : "Entrar"}
          </button>
        </form>
      </>
    );
  }

  if (details === undefined) {
    return shell(
      <div className="flex items-center justify-center py-6">
        <LoaderCircle className="h-6 w-6 text-editorial-primary animate-spin" />
      </div>
    );
  }

  if (!details) {
    return shell(
      <div className="text-center">
        <h1 className="text-lg font-serif font-bold text-editorial-primary mb-2">Não foi possível continuar</h1>
        <p className="text-editorial-muted text-xs">{detailsError || "Esta solicitação de autorização pode ter expirado. Volte ao aplicativo e tente novamente."}</p>
      </div>
    );
  }

  const scopes = details.scope.split(" ").filter(Boolean);

  return shell(
    <>
      <div className="flex items-center gap-3 mb-4">
        {details.client.logo_uri ? (
          <img src={details.client.logo_uri} alt={details.client.name} referrerPolicy="no-referrer" className="w-10 h-10 rounded-lg object-cover border border-editorial-border" />
        ) : (
          <div className="w-10 h-10 rounded-lg bg-editorial-secondary border border-editorial-border flex items-center justify-center">
            <ShieldCheck className="h-5 w-5 text-editorial-primary" />
          </div>
        )}
        <div>
          <h1 className="text-sm font-bold text-editorial-text">{details.client.name}</h1>
          <p className="text-[11px] text-editorial-muted">quer acessar sua conta EcoSafari</p>
        </div>
      </div>

      <p className="text-editorial-muted text-xs mb-3">
        Conectado como <span className="font-semibold text-editorial-text">{details.user.email}</span>. Este app vai poder:
      </p>
      <ul className="space-y-1.5 mb-6">
        {scopes.map(scope => (
          <li key={scope} className="flex items-center gap-2 text-xs text-editorial-text">
            <Check className="h-3.5 w-3.5 text-emerald-600 flex-shrink-0" /> {SCOPE_LABELS[scope] || scope}
          </li>
        ))}
      </ul>

      {detailsError && <p className="text-red-600 text-xs font-medium mb-3">{detailsError}</p>}

      <div className="flex flex-col gap-2">
        <button
          onClick={() => handleDecision("approve")}
          disabled={deciding !== null}
          className="bg-editorial-primary text-white text-xs uppercase tracking-widest font-semibold py-2.5 rounded-md flex items-center justify-center gap-2 hover:opacity-90 transition disabled:opacity-60 cursor-pointer"
        >
          {deciding === "approve" ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
          Permitir
        </button>
        <button
          onClick={() => handleDecision("deny")}
          disabled={deciding !== null}
          className="bg-white border border-editorial-border text-editorial-muted text-xs uppercase tracking-widest font-semibold py-2.5 rounded-md flex items-center justify-center gap-2 hover:bg-zinc-50 transition disabled:opacity-60 cursor-pointer"
        >
          {deciding === "deny" ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />}
          Negar
        </button>
      </div>
    </>
  );
}
