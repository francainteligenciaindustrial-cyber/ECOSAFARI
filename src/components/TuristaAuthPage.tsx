import React, { useState, useEffect } from "react";
import { Compass, LoaderCircle, User, LogOut, ArrowLeft } from "lucide-react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseClient } from "../lib/supabaseClient";
import { adminFetch } from "../lib/adminFetch";
import { Turista } from "../types";
import { navigate } from "../lib/router";

// Self-service signup/login for a "perfil de turista" — the account a
// visitor now needs before leaving a review on a pousada, atração or guia
// (enforced server-side by requireTourist in server.ts). Unlike partners/
// admins (invite-only, provisioned by an admin), anyone can create a
// tourist profile here — the point isn't vetting, it's making sure a real
// name/contact stands behind every avaliação instead of a free-typed string.
export default function TuristaAuthPage() {
  const [supabase, setSupabase] = useState<SupabaseClient | null>(null);
  const [checkingSession, setCheckingSession] = useState(true);
  const [isTourist, setIsTourist] = useState(false);
  const [profile, setProfile] = useState<Turista | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(false);

  const [mode, setMode] = useState<"login" | "signup">("signup");

  // Login
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [loggingIn, setLoggingIn] = useState(false);

  // Signup — every field is required, matching the "campos obrigatórios no
  // cadastro" requirement: a tourist profile only counts as one if it's
  // actually filled in.
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [country, setCountry] = useState("");
  const [language, setLanguage] = useState("");
  const [age, setAge] = useState("");
  const [preferences, setPreferences] = useState("");
  const [signupError, setSignupError] = useState("");
  const [signingUp, setSigningUp] = useState(false);

  useEffect(() => {
    let subscription: { unsubscribe: () => void } | null = null;
    getSupabaseClient().then(client => {
      setSupabase(client);
      client.auth.getSession().then(({ data }) => {
        setIsTourist(data.session?.user?.app_metadata?.role === "tourist");
        setCheckingSession(false);
      });
      const { data } = client.auth.onAuthStateChange((_event, session) => {
        setIsTourist(session?.user?.app_metadata?.role === "tourist");
      });
      subscription = data.subscription;
    });
    return () => subscription?.unsubscribe();
  }, []);

  useEffect(() => {
    if (!isTourist) {
      setProfile(null);
      return;
    }
    setLoadingProfile(true);
    adminFetch("/api/turista/me")
      .then(res => (res.ok ? res.json() : null))
      .then(setProfile)
      .catch(() => setProfile(null))
      .finally(() => setLoadingProfile(false));
  }, [isTourist]);

  const handleLogout = async () => {
    if (supabase) await supabase.auth.signOut();
    setIsTourist(false);
    setProfile(null);
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase || loggingIn) return;
    setLoggingIn(true);
    setLoginError("");
    const { data, error } = await supabase.auth.signInWithPassword({ email: loginEmail, password: loginPassword });
    if (error || !data.user) {
      setLoginError("Email ou senha inválidos.");
      setLoggingIn(false);
      return;
    }
    if (data.user.app_metadata?.role !== "tourist") {
      await supabase.auth.signOut();
      setLoginError("Esta conta não tem um perfil de turista.");
      setLoggingIn(false);
      return;
    }
    setIsTourist(true);
    setLoggingIn(false);
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (signingUp) return;
    setSignupError("");
    if (password.length < 8) {
      setSignupError("A senha precisa ter pelo menos 8 caracteres.");
      return;
    }
    setSigningUp(true);
    try {
      const res = await fetch("/api/turista/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password, whatsapp, country, language, age: Number(age), preferences }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setSignupError(body.error || "Erro ao criar seu perfil.");
        return;
      }
      if (!supabase) return;
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        setSignupError("Perfil criado! Só não conseguimos entrar automaticamente — faça login com o email e senha que você acabou de definir.");
        setMode("login");
        setLoginEmail(email);
        return;
      }
      setIsTourist(true);
    } finally {
      setSigningUp(false);
    }
  };

  if (checkingSession || !supabase) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-editorial-bg">
        <LoaderCircle className="h-8 w-8 text-editorial-primary animate-spin" />
      </div>
    );
  }

  const header = (
    <header className="h-16 flex items-center justify-between px-6 md:px-10 border-b border-editorial-border bg-white">
      <a href="/" onClick={e => { e.preventDefault(); navigate("/"); }} className="flex items-center gap-2 cursor-pointer">
        <div className="bg-editorial-primary p-1.5 rounded-lg text-white flex items-center justify-center">
          <Compass className="h-4 w-4" />
        </div>
        <span className="font-serif italic font-bold text-editorial-primary">EcoSafari<span className="text-zinc-400 not-italic">.</span></span>
      </a>
      {isTourist && (
        <button onClick={handleLogout} className="flex items-center gap-1.5 text-[11px] uppercase tracking-widest font-bold text-editorial-muted hover:text-editorial-text transition cursor-pointer">
          <LogOut className="h-3.5 w-3.5" /> Sair
        </button>
      )}
    </header>
  );

  if (isTourist) {
    return (
      <div className="min-h-screen bg-editorial-bg font-sans">
        {header}
        <div className="flex items-center justify-center px-6 py-16">
          <div className="max-w-sm w-full bg-white border border-editorial-border rounded-lg p-8 shadow-sm">
            <div className="flex items-center gap-2 mb-1">
              <User className="h-4 w-4 text-editorial-primary" />
              <h1 className="text-xs uppercase tracking-[0.2em] font-bold text-editorial-primary">Meu Perfil de Turista</h1>
            </div>
            {loadingProfile ? (
              <div className="flex justify-center py-8"><LoaderCircle className="h-5 w-5 text-editorial-primary animate-spin" /></div>
            ) : profile ? (
              <div className="mt-5 space-y-3 text-sm">
                <p><span className="text-editorial-muted text-xs block">Nome</span> {profile.name}</p>
                <p><span className="text-editorial-muted text-xs block">Email</span> {profile.email}</p>
                <p><span className="text-editorial-muted text-xs block">WhatsApp</span> {profile.whatsapp}</p>
                <p><span className="text-editorial-muted text-xs block">País</span> {profile.country}</p>
                {profile.language && <p><span className="text-editorial-muted text-xs block">Idioma</span> {profile.language}</p>}
                <p><span className="text-editorial-muted text-xs block">Idade</span> {profile.age}</p>
                {typeof profile.coins === "number" && <p><span className="text-editorial-muted text-xs block">Coins</span> {profile.coins}</p>}
                <p><span className="text-editorial-muted text-xs block">Preferências</span> {profile.preferences}</p>
                <p className="text-emerald-700 text-xs font-semibold pt-2">✓ Você já pode avaliar pousadas, guias e atrações.</p>
              </div>
            ) : (
              <p className="text-editorial-muted text-xs mt-5">Não foi possível carregar seu perfil agora. Tente novamente em instantes.</p>
            )}
            <a href="/" onClick={e => { e.preventDefault(); navigate("/"); }} className="mt-6 inline-flex items-center gap-2 text-editorial-primary text-[11px] uppercase tracking-widest font-bold hover:opacity-80 transition cursor-pointer">
              <ArrowLeft className="h-3.5 w-3.5" /> Voltar ao catálogo
            </a>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-editorial-bg font-sans">
      {header}
      <div className="flex items-center justify-center px-6 py-16">
        <div className="max-w-sm w-full bg-white border border-editorial-border rounded-lg p-8 shadow-sm">
          <div className="flex items-center gap-2 mb-1">
            <User className="h-4 w-4 text-editorial-primary" />
            <h1 className="text-xs uppercase tracking-[0.2em] font-bold text-editorial-primary">Perfil de Turista</h1>
          </div>
          <p className="text-editorial-muted text-xs mb-6">Crie seu perfil (ou entre com um já existente) para poder avaliar pousadas, guias e atrações.</p>

          <div className="flex border border-editorial-border rounded-md overflow-hidden mb-5 text-[11px] uppercase tracking-widest font-bold">
            <button
              type="button"
              onClick={() => setMode("signup")}
              className={`flex-1 py-2 transition cursor-pointer ${mode === "signup" ? "bg-editorial-primary text-white" : "bg-white text-editorial-muted hover:bg-editorial-secondary"}`}
            >
              Criar perfil
            </button>
            <button
              type="button"
              onClick={() => setMode("login")}
              className={`flex-1 py-2 transition cursor-pointer ${mode === "login" ? "bg-editorial-primary text-white" : "bg-white text-editorial-muted hover:bg-editorial-secondary"}`}
            >
              Entrar
            </button>
          </div>

          {mode === "login" ? (
            <form onSubmit={handleLogin} className="flex flex-col gap-3">
              <input
                type="email" required placeholder="Email" value={loginEmail} onChange={e => setLoginEmail(e.target.value)}
                className="w-full border border-editorial-border bg-white px-3 py-2 text-sm rounded-md focus:outline-none focus:ring-1 focus:ring-editorial-primary"
              />
              <input
                type="password" required placeholder="Senha" value={loginPassword} onChange={e => setLoginPassword(e.target.value)}
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
          ) : (
            <form onSubmit={handleSignup} className="flex flex-col gap-3">
              <input
                type="text" required placeholder="Nome completo" value={name} onChange={e => setName(e.target.value)}
                className="w-full border border-editorial-border bg-white px-3 py-2 text-sm rounded-md focus:outline-none focus:ring-1 focus:ring-editorial-primary"
              />
              <input
                type="email" required placeholder="Email" value={email} onChange={e => setEmail(e.target.value)}
                className="w-full border border-editorial-border bg-white px-3 py-2 text-sm rounded-md focus:outline-none focus:ring-1 focus:ring-editorial-primary"
              />
              <input
                type="password" required minLength={8} placeholder="Senha (mínimo 8 caracteres)" value={password} onChange={e => setPassword(e.target.value)}
                className="w-full border border-editorial-border bg-white px-3 py-2 text-sm rounded-md focus:outline-none focus:ring-1 focus:ring-editorial-primary"
              />
              <input
                type="tel" required placeholder="WhatsApp (com DDD/país)" value={whatsapp} onChange={e => setWhatsapp(e.target.value)}
                className="w-full border border-editorial-border bg-white px-3 py-2 text-sm rounded-md focus:outline-none focus:ring-1 focus:ring-editorial-primary"
              />
              <div className="grid grid-cols-2 gap-3">
                <input
                  type="text" required placeholder="País" value={country} onChange={e => setCountry(e.target.value)}
                  className="w-full border border-editorial-border bg-white px-3 py-2 text-sm rounded-md focus:outline-none focus:ring-1 focus:ring-editorial-primary"
                />
                <input
                  type="number" required min={1} placeholder="Idade" value={age} onChange={e => setAge(e.target.value)}
                  className="w-full border border-editorial-border bg-white px-3 py-2 text-sm rounded-md focus:outline-none focus:ring-1 focus:ring-editorial-primary"
                />
              </div>
              <input
                type="text" required placeholder="Idioma preferido (ex: Português, English, Español)" value={language} onChange={e => setLanguage(e.target.value)}
                className="w-full border border-editorial-border bg-white px-3 py-2 text-sm rounded-md focus:outline-none focus:ring-1 focus:ring-editorial-primary"
              />
              <textarea
                required rows={2} placeholder="O que você gosta de fazer em viagens? (ex: trilhas, observação de aves, gastronomia...)"
                value={preferences} onChange={e => setPreferences(e.target.value)}
                className="w-full border border-editorial-border bg-white px-3 py-2 text-sm rounded-md focus:outline-none focus:ring-1 focus:ring-editorial-primary resize-none"
              />
              {signupError && <p className="text-red-600 text-xs font-medium">{signupError}</p>}
              <button
                type="submit" disabled={signingUp}
                className="mt-2 bg-editorial-primary text-white text-xs uppercase tracking-widest font-semibold py-2.5 rounded-md flex items-center justify-center gap-2 hover:opacity-90 transition disabled:opacity-60 cursor-pointer"
              >
                {signingUp ? <LoaderCircle className="h-4 w-4 animate-spin" /> : "Criar meu perfil"}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
